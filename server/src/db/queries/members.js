const db = require('../knex');

async function findByEmail(email) {
  return db('members').whereRaw('LOWER(email) = ?', [email.toLowerCase().trim()]).first();
}

async function getAll() {
  return db('members').select('*').orderBy('id');
}

async function upsert(email, isAdmin, name) {
  const existing = await findByEmail(email);
  if (existing) {
    await db('members').where('id', existing.id).update({
      email,
      is_admin: isAdmin || false,
      name: name || ''
    });
    return { updated: true };
  }
  await db('members').insert({
    email,
    is_admin: isAdmin || false,
    name: name || ''
  });
  return { added: true };
}

async function remove(email) {
  const count = await db('members').whereRaw('LOWER(email) = ?', [email.toLowerCase().trim()]).del();
  return count > 0;
}

async function setNotify(email, notify) {
  const count = await db('members')
    .whereRaw('LOWER(email) = ?', [email.toLowerCase().trim()])
    .update({ notify_email: !!notify });
  return count > 0;
}

async function getAdminsWithNotify() {
  return db('members').where({ is_admin: true, notify_email: true }).select('*');
}

async function getMembersWithNotify() {
  return db('members').where({ notify_email: true }).select('*');
}

module.exports = { findByEmail, getAll, upsert, remove, setNotify, getAdminsWithNotify, getMembersWithNotify };
