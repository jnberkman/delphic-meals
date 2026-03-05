const membersDb = require('../db/queries/members');
const sheetsSync = require('../services/sheetsSync');

async function checkMember(email) {
  const member = await membersDb.findByEmail(email);
  if (!member) return { authorized: false };
  return {
    authorized: true,
    isAdmin: member.is_admin,
    name: member.name || '',
    notifyEmail: member.notify_email
  };
}

async function getMembers() {
  const rows = await membersDb.getAll();
  const members = rows.filter(r => r.email).map(r => ({
    email: r.email,
    isAdmin: r.is_admin,
    name: r.name || '',
    notifyEmail: r.notify_email
  }));
  return { members };
}

async function addMember(email, isAdmin, name) {
  const result = await membersDb.upsert(email, isAdmin, name);
  sheetsSync.syncMembers().catch(e => console.error('Sheets sync error (members):', e.message));
  return { status: 'ok', ...result };
}

async function removeMember(email) {
  const removed = await membersDb.remove(email);
  if (removed) sheetsSync.syncMembers().catch(e => console.error('Sheets sync error (members):', e.message));
  return { removed };
}

module.exports = { checkMember, getMembers, addMember, removeMember };
