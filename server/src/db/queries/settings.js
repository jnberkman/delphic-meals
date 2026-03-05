const db = require('../knex');

async function getAll() {
  const rows = await db('settings').select('*');
  const settings = { openAccess: false, spotUpEnabled: true };
  for (const row of rows) {
    if (row.key === 'openAccess') settings.openAccess = row.value === 'true';
    if (row.key === 'spotUpEnabled') settings.spotUpEnabled = row.value !== 'false';
  }
  return settings;
}

async function setMany(newSettings) {
  for (const [key, val] of Object.entries(newSettings)) {
    await db('settings')
      .insert({ key, value: String(val) })
      .onConflict('key')
      .merge({ value: String(val) });
  }
}

module.exports = { getAll, setMany };
