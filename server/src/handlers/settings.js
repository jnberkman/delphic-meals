const settingsDb = require('../db/queries/settings');
const membersDb = require('../db/queries/members');
const sheetsSync = require('../services/sheetsSync');

async function getSettings() {
  const settings = await settingsDb.getAll();
  return { settings };
}

async function setSettings(newSettings) {
  await settingsDb.setMany(newSettings);
  sheetsSync.syncSettings().catch(e => console.error('Sheets sync error (settings):', e.message));
  return { status: 'ok' };
}

async function setNotifyEmail(email, notify) {
  const updated = await membersDb.setNotify(email, notify);
  if (!updated) return { error: 'Member not found' };
  sheetsSync.syncMembers().catch(e => console.error('Sheets sync error (members):', e.message));
  return { status: 'ok' };
}

module.exports = { getSettings, setSettings, setNotifyEmail };
