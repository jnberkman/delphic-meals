const db = require('../knex');

async function create(tokenData) {
  const [row] = await db('claim_tokens').insert(tokenData).returning('*');
  return row;
}

async function findByToken(token) {
  return db('claim_tokens').where('token', token).first();
}

async function markUsed(token) {
  await db('claim_tokens').where('token', token).update({ used: true });
}

async function markAllUsedForSpot(monday, dayIdx, origName, time) {
  await db('claim_tokens')
    .where({ monday, day_idx: dayIdx, orig_name: origName, time, used: false })
    .update({ used: true });
}

module.exports = { create, findByToken, markUsed, markAllUsedForSpot };
