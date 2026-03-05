const db = require('../knex');

async function findPending(email) {
  return db('access_requests')
    .whereRaw('LOWER(email) = ?', [email.toLowerCase().trim()])
    .where('status', 'pending')
    .first();
}

async function create(email, name) {
  await db('access_requests').insert({ email, name: name || '' });
}

async function getPending() {
  return db('access_requests').where('status', 'pending').select('email', 'name', 'requested_at').orderBy('requested_at');
}

async function updateStatus(email, status) {
  await db('access_requests')
    .whereRaw('LOWER(email) = ?', [email.toLowerCase().trim()])
    .where('status', 'pending')
    .update({ status });
}

module.exports = { findPending, create, getPending, updateStatus };
