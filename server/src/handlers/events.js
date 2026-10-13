const db = require('../db/knex');
const eventsDb = require('../db/queries/events');
const sheetsSync = require('../services/sheetsSync');

const MAX_GUEST_NAME = 100;

// event_signups.guests is a JSON array of guest names (see migration 008)
function parseGuests(guests) {
  if (!Array.isArray(guests)) return [];
  return guests.map(g => String(g || '').trim()).filter(Boolean);
}

// Signup names are matched case- and whitespace-insensitively; older rows may
// have been stored with stray spaces, so trim on the SQL side too
const NAME_MATCH = 'LOWER(TRIM(name)) = ?';
const nameKey = (name) => String(name || '').trim().toLowerCase();

// Seats a signup takes: the member plus their guests. Interest takes no seat.
function seatsFor(row) {
  return row.ink_type === 'interest' ? 0 : 1 + parseGuests(row.guests).length;
}

/**
 * Port of getEvents() from Code.gs:419-458.
 * Includes each event's attendee list; api.js strips private fields for non-admins.
 */
async function getEvents() {
  const eventRows = await eventsDb.getAll();
  const signupRows = await db('event_signups').orderBy('timestamp');
  const byEvent = {};
  for (const s of signupRows) (byEvent[s.event_id] = byEvent[s.event_id] || []).push(s);

  const events = [];
  for (const row of eventRows) {
    if (!row.event_id) continue;

    const rows = byEvent[row.event_id] || [];
    let inkCount = 0, interestCount = 0, goingCount = 0;
    for (const s of rows) {
      if (s.ink_type === 'interest') interestCount++;
      else inkCount++;
      goingCount += seatsFor(s);
    }

    events.push({
      eventId: row.event_id,
      title: row.title || '',
      date: row.date || '',
      time: row.time || '',
      location: row.location || '',
      description: row.description || '',
      category: row.category || '',
      capacity: row.capacity || 0,
      maxGuests: row.max_guests || 0,
      collectGradYear: row.collect_grad_year,
      collectDiet: row.collect_diet,
      freezeDate: row.freeze_date || '',
      interestOnly: row.interest_only,
      signupCount: inkCount + interestCount,
      inkCount,
      interestCount,
      goingCount,
      attendees: rows.map(s => ({
        name: s.name,
        inkType: s.ink_type,
        guests: parseGuests(s.guests),
        gradYear: s.grad_year || '',
        diet: s.diet || '',
        allergies: s.allergies || '',
        notes: s.notes || ''
      }))
    });
  }

  return { events };
}

/**
 * Port of createEvent() from Code.gs:460-477.
 */
async function createEvent(event) {
  const eventId = 'evt_' + Date.now();
  await eventsDb.create(eventId, event);
  sheetsSync.syncEvents().catch(e => console.error('Sheets sync error (events):', e.message));
  return { status: 'ok', eventId };
}

/**
 * Port of updateEvent() from Code.gs:479-498.
 */
async function updateEvent(eventId, event) {
  const updated = await eventsDb.update(eventId, event);
  if (!updated) return { error: 'Event not found' };
  sheetsSync.syncEvents().catch(e => console.error('Sheets sync error (events):', e.message));
  return { status: 'ok' };
}

/**
 * Port of deleteEvent() from Code.gs:501-515.
 */
async function deleteEvent(eventId) {
  const deleted = await eventsDb.remove(eventId);
  if (!deleted) return { error: 'Event not found' };
  sheetsSync.syncEvents().catch(e => console.error('Sheets sync error (events):', e.message));
  sheetsSync.syncDeleteEventSheet(eventId).catch(e => console.error('Sheets sync error (delete event sheet):', e.message));
  return { status: 'ok' };
}

/**
 * Port of addEventSignup() from Code.gs:517-559.
 * Upserts by name. The event row is locked so concurrent signups can't overfill it,
 * and an existing signup is only replaced once the new one is known to fit.
 */
async function addEventSignup(eventId, signup) {
  const name = String(signup.name || '').trim();
  if (!name) return { error: 'Name is required' };

  const result = await db.transaction(async (trx) => {
    const event = await trx('events').where('event_id', eventId).forUpdate().first();
    if (!event) return { error: 'Event not found' };

    if (event.freeze_date && Date.now() > new Date(event.freeze_date).getTime()) {
      return { error: 'Sign-ups are closed for this event' };
    }

    const inkType = event.interest_only || signup.inkType === 'interest' ? 'interest' : 'ink';
    const guests = inkType === 'ink' ? parseGuests(signup.guests) : [];
    // All of this person's rows (legacy data can hold "Bob" and "Bob " separately)
    const mine = await trx('event_signups')
      .where('event_id', eventId)
      .whereRaw(NAME_MATCH, [nameKey(name)])
      .orderBy('timestamp');
    const existing = mine[0];

    // Guests already on a signup (e.g. from before guest limits existed) can be kept
    const hadGuests = existing ? parseGuests(existing.guests).length : 0;
    const maxGuests = Math.max(event.max_guests || 0, hadGuests);
    if (guests.length > maxGuests) {
      return { error: maxGuests ? 'This event allows up to ' + maxGuests + (maxGuests === 1 ? ' guest' : ' guests') + ' per person' : 'This event doesn\'t allow guests' };
    }
    if (guests.some(g => g.length > MAX_GUEST_NAME)) return { error: 'Guest names must be under ' + MAX_GUEST_NAME + ' characters' };
    const row = { ink_type: inkType, guests };

    if (event.capacity > 0 && seatsFor(row) > 0) {
      const all = await trx('event_signups').where('event_id', eventId);
      const myIds = new Set(mine.map(s => s.id));
      const taken = all.filter(s => !myIds.has(s.id)).reduce((sum, s) => sum + seatsFor(s), 0);
      const current = mine.reduce((sum, s) => sum + seatsFor(s), 0);
      // Changes that don't add seats always go through, even on an over-full event
      if (taken + seatsFor(row) > event.capacity && seatsFor(row) > current) {
        const left = Math.max(0, event.capacity - taken);
        return guests.length && left > 0
          ? { error: 'Only ' + left + (left === 1 ? ' spot' : ' spots') + ' left — try with fewer guests', full: true }
          : { error: 'Event is full', full: true };
      }
    }

    // Fields left out of the request keep their previous value (members edit
    // guests without seeing the private details they entered before)
    const keep = (field, col) => signup[field] !== undefined ? String(signup[field] || '') : (existing ? existing[col] : '');

    if (mine.length) await trx('event_signups').whereIn('id', mine.map(s => s.id)).del();

    await trx('event_signups').insert({
      event_id: eventId,
      name,
      grad_year: keep('gradYear', 'grad_year'),
      diet: keep('diet', 'diet'),
      allergies: keep('allergies', 'allergies'),
      notes: keep('notes', 'notes'),
      guests: JSON.stringify(guests),
      ink_type: inkType,
      // Editing keeps your place in the signup order
      ...(existing ? { timestamp: existing.timestamp } : {})
    });
    return { status: 'ok', added: 1 };
  });

  if (result.status === 'ok') {
    sheetsSync.syncEventSignups(eventId).catch(e => console.error('Sheets sync error (event signups):', e.message));
  }
  return result;
}

/**
 * Port of removeEventSignup() from Code.gs:561-572.
 */
async function removeEventSignup(eventId, name) {
  const count = await db('event_signups')
    .where('event_id', eventId)
    .whereRaw(NAME_MATCH, [nameKey(name)])
    .del();
  if (count > 0) {
    sheetsSync.syncEventSignups(eventId).catch(e => console.error('Sheets sync error (event signups):', e.message));
  }
  return { removed: count > 0 };
}

module.exports = { getEvents, createEvent, updateEvent, deleteEvent, addEventSignup, removeEventSignup };
