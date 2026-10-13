const db = require('../knex');

async function getAll() {
  return db('events').select('*').orderBy('date');
}

async function findById(eventId) {
  return db('events').where('event_id', eventId).first();
}

async function create(eventId, event) {
  await db('events').insert({
    event_id: eventId,
    title: event.title || '',
    date: event.date || '',
    time: event.time || '',
    location: event.location || '',
    description: event.description || '',
    capacity: event.capacity || 0,
    collect_grad_year: event.collectGradYear || false,
    collect_diet: event.collectDiet || false,
    freeze_date: event.freezeDate || '',
    interest_only: event.interestOnly || false,
    category: event.category || '',
    max_guests: Math.max(0, parseInt(event.maxGuests, 10) || 0)
  });
}

async function update(eventId, event) {
  const count = await db('events').where('event_id', eventId).update({
    title: event.title || '',
    date: event.date || '',
    time: event.time || '',
    location: event.location || '',
    description: event.description || '',
    capacity: event.capacity || 0,
    collect_grad_year: event.collectGradYear || false,
    collect_diet: event.collectDiet || false,
    freeze_date: event.freezeDate || '',
    interest_only: event.interestOnly || false,
    category: event.category || '',
    max_guests: Math.max(0, parseInt(event.maxGuests, 10) || 0)
  });
  return count > 0;
}

async function remove(eventId) {
  const count = await db('events').where('event_id', eventId).del();
  return count > 0;
}

module.exports = { getAll, findById, create, update, remove };
