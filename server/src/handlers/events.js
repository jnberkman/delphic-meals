const db = require('../db/knex');
const eventsDb = require('../db/queries/events');
const sheetsSync = require('../services/sheetsSync');

/**
 * Port of getEvents() from Code.gs:419-458.
 */
async function getEvents() {
  const eventRows = await eventsDb.getAll();
  const events = [];

  for (const row of eventRows) {
    if (!row.event_id) continue;

    const signupRows = await db('event_signups').where('event_id', row.event_id);
    let inkCount = 0, interestCount = 0;
    for (const s of signupRows) {
      if (s.ink_type === 'interest') interestCount++;
      else inkCount++;
    }

    events.push({
      eventId: row.event_id,
      title: row.title || '',
      date: row.date || '',
      time: row.time || '',
      location: row.location || '',
      description: row.description || '',
      capacity: row.capacity || 0,
      collectGradYear: row.collect_grad_year,
      collectDiet: row.collect_diet,
      freezeDate: row.freeze_date || '',
      interestOnly: row.interest_only,
      signupCount: inkCount + interestCount,
      inkCount,
      interestCount
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
  return { status: 'ok' };
}

/**
 * Port of addEventSignup() from Code.gs:517-559.
 */
async function addEventSignup(eventId, signup) {
  const event = await eventsDb.findById(eventId);
  if (!event) return { error: 'Event not found' };

  // Check freeze date
  if (event.freeze_date) {
    if (Date.now() > new Date(event.freeze_date).getTime()) {
      return { error: 'Sign-ups are closed for this event' };
    }
  }

  // Delete existing signup by this name (upsert)
  await db('event_signups')
    .where('event_id', eventId)
    .whereRaw('LOWER(name) = ?', [(signup.name || '').toLowerCase()])
    .del();

  // Check capacity
  if (event.capacity > 0) {
    const [{ count }] = await db('event_signups').where('event_id', eventId).count('* as count');
    if (parseInt(count, 10) >= event.capacity) {
      return { error: 'Event is full', full: true };
    }
  }

  await db('event_signups').insert({
    event_id: eventId,
    name: signup.name || '',
    grad_year: signup.gradYear || '',
    diet: signup.diet || '',
    allergies: signup.allergies || '',
    notes: signup.notes || '',
    guests: signup.guests || '',
    ink_type: signup.inkType || 'ink'
  });

  sheetsSync.syncEventSignups(eventId).catch(e => console.error('Sheets sync error (event signups):', e.message));
  return { status: 'ok', added: 1 };
}

/**
 * Port of removeEventSignup() from Code.gs:561-572.
 */
async function removeEventSignup(eventId, name) {
  const count = await db('event_signups')
    .where('event_id', eventId)
    .whereRaw('LOWER(name) = ?', [(name || '').toLowerCase()])
    .del();
  if (count > 0) {
    sheetsSync.syncEventSignups(eventId).catch(e => console.error('Sheets sync error (event signups):', e.message));
  }
  return { removed: count > 0 };
}

module.exports = { getEvents, createEvent, updateEvent, deleteEvent, addEventSignup, removeEventSignup };
