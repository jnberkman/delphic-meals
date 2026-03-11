const db = require('../knex');

async function getByMonday(monday) {
  return db('signups').where('monday', monday).orderBy('id');
}

async function getByMondayAndDay(monday, dayIndex) {
  return db('signups').where({ monday, day_index: dayIndex }).orderBy('id');
}

async function findSignup(monday, dayIndex, name, time) {
  return db('signups')
    .where({ monday, day_index: dayIndex })
    .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
    .where('time', time)
    .first();
}

async function findSignupByDayAndName(monday, dayIndex, name) {
  return db('signups')
    .where({ monday, day_index: dayIndex })
    .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
    .first();
}

async function insert(signup) {
  const [row] = await db('signups').insert(signup).returning('*');
  return row;
}

async function deleteByDayAndName(monday, dayIndex, name) {
  return db('signups')
    .where({ monday, day_index: dayIndex })
    .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
    .del();
}

async function update(id, fields) {
  await db('signups').where('id', id).update(fields);
}

async function countByTime(monday, dayIndex, time) {
  const [{ count }] = await db('signups')
    .where({ monday, day_index: dayIndex, time })
    .count('* as count');
  return parseInt(count, 10);
}

/**
 * Find a spot-up signup row for claiming.
 * Uses SELECT ... FOR UPDATE for concurrency control.
 */
async function findSpotUpForUpdate(trx, monday, dayIndex, originalName, time) {
  return trx('signups')
    .where({ monday, day_index: dayIndex, time, spot_up_status: 'spotup' })
    .where(function () {
      this.whereRaw('LOWER(spot_up_orig_name) = ?', [originalName.toLowerCase()])
        .orWhereRaw('LOWER(name) = ?', [originalName.toLowerCase()]);
    })
    .forUpdate()
    .first();
}

/**
 * Find a claimed signup row for unclaiming.
 */
async function findClaimedForUpdate(trx, monday, dayIndex, originalName, time) {
  return trx('signups')
    .where({ monday, day_index: dayIndex, time, spot_up_status: 'claimed' })
    .whereRaw('LOWER(spot_up_orig_name) = ?', [originalName.toLowerCase()])
    .forUpdate()
    .first();
}

/**
 * Find the oldest unclaimed spot-up within 2 hours for GroupMe claiming.
 * Uses SELECT ... FOR UPDATE for concurrency control.
 */
async function findOldestSpotUpForUpdate(trx) {
  return trx('signups')
    .where('spot_up_status', 'spotup')
    .whereNotNull('spotted_up_at')
    .whereRaw("spotted_up_at > NOW() - INTERVAL '2 hours'")
    .orderBy('spotted_up_at', 'asc')
    .forUpdate()
    .first();
}

module.exports = {
  getByMonday, getByMondayAndDay, findSignup, findSignupByDayAndName,
  insert, deleteByDayAndName, update, countByTime,
  findSpotUpForUpdate, findClaimedForUpdate, findOldestSpotUpForUpdate
};
