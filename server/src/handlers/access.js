const membersDb = require('../db/queries/members');
const accessDb = require('../db/queries/accessRequests');
const sheetsSync = require('../services/sheetsSync');
const emailService = require('../services/email');

/**
 * Port of requestAccess() from Code.gs:677-722.
 */
async function requestAccess(email, name) {
  // Already a member?
  const member = await membersDb.findByEmail(email);
  if (member) return { alreadyMember: true };

  // Already pending?
  const pending = await accessDb.findPending(email);
  if (pending) return { alreadyPending: true };

  await accessDb.create(email, name);

  // Email all admins
  try {
    const allMembers = await membersDb.getAll();
    const admins = allMembers.filter(m => m.is_admin && m.email);
    for (const admin of admins) {
      await emailService.sendAccessRequestEmail(name || email, email, admin.name || '', admin.email);
    }
  } catch (e) {
    console.error('Access request email error:', e.message);
  }

  sheetsSync.syncAccessRequests().catch(e => console.error('Sheets sync error (access):', e.message));
  return { status: 'ok' };
}

async function getAccessRequests() {
  const rows = await accessDb.getPending();
  const requests = rows.map(r => ({
    email: r.email,
    name: r.name,
    requestedAt: r.requested_at ? r.requested_at.toISOString() : ''
  }));
  return { requests };
}

/**
 * Port of approveAccessRequest() from Code.gs:738-761.
 */
async function approveAccessRequest(email, name) {
  await membersDb.upsert(email, false, name || '');
  await accessDb.updateStatus(email, 'approved');

  try {
    await emailService.sendApprovalEmail(email, name || '');
  } catch (e) {
    console.error('Approval email error:', e.message);
  }

  sheetsSync.syncAccessRequests().catch(e => console.error('Sheets sync error (access):', e.message));
  sheetsSync.syncMembers().catch(e => console.error('Sheets sync error (members):', e.message));
  return { status: 'ok' };
}

async function denyAccessRequest(email) {
  await accessDb.updateStatus(email, 'denied');
  sheetsSync.syncAccessRequests().catch(e => console.error('Sheets sync error (access):', e.message));
  return { status: 'ok' };
}

module.exports = { requestAccess, getAccessRequests, approveAccessRequest, denyAccessRequest };
