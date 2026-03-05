const db = require('../knex');

async function getConfig(monday) {
  return db('week_configs').where('monday', monday).first();
}

async function upsertConfig(monday, config, caps, freezeDate) {
  await db('week_configs')
    .insert({ monday, config: JSON.stringify(config), caps: JSON.stringify(caps), freeze_date: freezeDate || '' })
    .onConflict('monday')
    .merge({ config: JSON.stringify(config), caps: JSON.stringify(caps), freeze_date: freezeDate || '' });
}

module.exports = { getConfig, upsertConfig };
