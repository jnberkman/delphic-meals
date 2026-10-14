const db = require('../db/knex');
const eventsDb = require('../db/queries/events');
const sheetsSync = require('../services/sheetsSync');
const { parseGuestList } = require('../utils/guests');

const MAX_NAME = 100;

// Signup names are matched case- and whitespace-insensitively; older rows may
// have been stored with stray spaces
const nameKey = (name) => String(name || '').trim().toLowerCase();

// Seats a signup takes: the member plus their guests. Interest takes no seat.
function seatsFor(row) {
  return row.ink_type === 'interest' ? 0 : 1 + parseGuestList(row.guest_list).length;
}

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function isFrozen(event) {
  return !!event.freeze_date && Date.now() > new Date(event.freeze_date).getTime();
}

function isPast(event) {
  return !!event.date && event.date < todayET();
}

/*
 * Who is asking, built by routes/api.js:
 *   signers      identities this caller can act as: 'google:<email>' (verified token)
 *                and/or 'guest:<browser id>'. A signup's `signer` column holds one.
 *   isAdmin      may change anyone's signup and ignore the freeze
 *   canSeeNames  members and guest-code users see who's going
 * Signups made before migration 008 have no signer and stay editable by name.
 */
const NOBODY = { signers: [], ownNames: [], isAdmin: false, canSeeNames: false };
const ownsRow = (viewer, row) => !!row.signer && viewer.signers.includes(row.signer);

// Someone else's signup this viewer may still change: admins any; a verified member
// may take back one a guest browser made under the member's own name
function canOverride(viewer, row) {
  if (viewer.isAdmin) return true;
  return String(row.signer || '').startsWith('guest:') && (viewer.ownNames || []).includes(nameKey(row.name));
}

/**
 * Port of getEvents() from Code.gs:419-458, plus attendee lists.
 * Year/diet/allergies/notes go only to admins and to the person who signed up.
 */
async function getEvents(viewer = NOBODY) {
  const [eventRows, signupRows] = await Promise.all([
    eventsDb.getAll(),
    db('event_signups').orderBy('timestamp')
  ]);
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
      attendees: viewer.canSeeNames ? rows.map(s => {
        const mine = ownsRow(viewer, s);
        const a = {
          name: s.name,
          inkType: s.ink_type,
          guests: parseGuestList(s.guest_list),
          mine,
          claimed: !!s.signer
        };
        if (mine || viewer.isAdmin) {
          Object.assign(a, { gradYear: s.grad_year || '', diet: s.diet || '', allergies: s.allergies || '', notes: s.notes || '' });
        }
        return a;
      }) : []
    });
  }

  // Lets the UI say "sign in to see who's going" instead of showing empty lists
  return viewer.canSeeNames ? { events } : { events, namesHidden: true };
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
 * A signup someone else made can only be changed by an admin.
 */
async function addEventSignup(eventId, signup, viewer = NOBODY) {
  signup = signup || {};
  const name = String(signup.name || '').trim();
  if (!name) return { error: 'Name is required' };
  if (name.length > MAX_NAME) return { error: 'Name must be under ' + MAX_NAME + ' characters' };

  const result = await db.transaction(async (trx) => {
    const event = await trx('events').where('event_id', eventId).forUpdate().first();
    if (!event) return { error: 'Event not found' };
    if (!viewer.isAdmin && isPast(event)) return { error: 'This event has already happened' };
    if (!viewer.isAdmin && isFrozen(event)) return { error: 'Sign-ups are closed for this event' };

    const all = await trx('event_signups').where('event_id', eventId).orderBy('timestamp');
    // All of this person's rows (legacy data can hold "Bob" and "Bob " separately)
    const mine = all.filter(s => nameKey(s.name) === nameKey(name));
    const existing = mine[0];
    const owner = mine.find(s => s.signer && !viewer.signers.includes(s.signer));
    if (owner && !canOverride(viewer, owner)) {
      return { error: name + ' is already signed up by someone else. Use your own name, or ask an admin to change it.' };
    }
    if (owner && !viewer.isAdmin) {
      console.log(`Event ${eventId}: member ${viewer.signers[0]} took back signup "${name}" from ${owner.signer}`);
    }

    // Fields left out of the request keep their saved value (older clients send
    // guests as '' and never had a guest picker)
    let inkType = signup.inkType === undefined ? (existing ? existing.ink_type : 'ink') : (signup.inkType === 'interest' ? 'interest' : 'ink');
    if (event.interest_only) inkType = 'interest';
    const guestsGiven = signup.guests !== undefined && signup.guests !== '';
    const savedGuests = existing ? parseGuestList(existing.guest_list) : [];
    const guests = inkType === 'interest' ? [] : (guestsGiven ? parseGuestList(signup.guests) : savedGuests);

    // Guests already on a going signup (e.g. from before guest limits) can be kept
    const hadGuests = existing && existing.ink_type !== 'interest' ? savedGuests.length : 0;
    const maxGuests = Math.max(event.max_guests || 0, hadGuests);
    if (guests.length > maxGuests) {
      return { error: maxGuests ? 'This event allows up to ' + maxGuests + (maxGuests === 1 ? ' guest' : ' guests') + ' per person' : 'This event doesn\'t allow guests' };
    }
    if (guests.some(g => g.length > MAX_NAME)) return { error: 'Guest names must be under ' + MAX_NAME + ' characters' };

    const row = { ink_type: inkType, guest_list: guests };
    if (event.capacity > 0 && seatsFor(row) > 0) {
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

    // Private fields carry over only for your own signup (or an admin's edit). Taking
    // over an unclaimed legacy signup must not hand you someone's diet/allergies/notes.
    const inheritPrivate = viewer.isAdmin || !!(existing && existing.signer && viewer.signers.includes(existing.signer));
    const keep = (field, col) => signup[field] !== undefined ? String(signup[field] || '') : (existing && inheritPrivate ? existing[col] : '');

    if (mine.length) await trx('event_signups').whereIn('id', mine.map(s => s.id)).del();

    await trx('event_signups').insert({
      event_id: eventId,
      name,
      grad_year: keep('gradYear', 'grad_year'),
      diet: keep('diet', 'diet'),
      allergies: keep('allergies', 'allergies'),
      notes: keep('notes', 'notes'),
      guest_list: JSON.stringify(guests),
      // Legacy text column, still read by the previous release during a deploy
      guests: guests.join(', '),
      ink_type: inkType,
      // An admin editing someone's signup leaves it theirs; a member taking back
      // their name from a guest becomes the owner
      signer: owner && viewer.isAdmin ? owner.signer : (viewer.signers[0] || (existing && existing.signer) || null),
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
 * Members can remove their own signup (or an unclaimed legacy one) until the
 * freeze; withdrawing interest is allowed after it since interest takes no seat.
 */
async function removeEventSignup(eventId, name, viewer = NOBODY) {
  const event = await eventsDb.findById(eventId);
  if (!event) return { error: 'Event not found' };

  const rows = (await db('event_signups').where('event_id', eventId)).filter(s => nameKey(s.name) === nameKey(name));
  if (!rows.length) return { removed: false };

  if (!viewer.isAdmin) {
    if (rows.some(s => s.signer && !viewer.signers.includes(s.signer) && !canOverride(viewer, s))) {
      return { error: 'You can only remove your own signup' };
    }
    if (isPast(event)) return { error: 'This event has already happened' };
    if (isFrozen(event) && rows.some(s => s.ink_type !== 'interest')) {
      return { error: 'Sign-ups are closed for this event — ask an admin to remove you' };
    }
  }

  const takenBack = !viewer.isAdmin && rows.find(s => s.signer && !viewer.signers.includes(s.signer));
  if (takenBack) console.log(`Event ${eventId}: member ${viewer.signers[0]} removed guest signup "${name}" (${takenBack.signer})`);

  const count = await db('event_signups').whereIn('id', rows.map(s => s.id)).del();
  if (count > 0) {
    sheetsSync.syncEventSignups(eventId).catch(e => console.error('Sheets sync error (event signups):', e.message));
  }
  return { removed: count > 0 };
}

module.exports = { getEvents, createEvent, updateEvent, deleteEvent, addEventSignup, removeEventSignup };
