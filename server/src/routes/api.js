const { Router } = require('express');
const router = Router();

const mealsHandler = require('../handlers/meals');
const spotupHandler = require('../handlers/spotup');
const membersHandler = require('../handlers/members');
const accessHandler = require('../handlers/access');
const settingsHandler = require('../handlers/settings');
const eventsHandler = require('../handlers/events');

const config = require('../config');
const { hasValidAccessCode } = require('../middleware/auth');
const settingsDb = require('../db/queries/settings');

// Who is calling, for the events handlers (see handlers/events.js). Google identity
// comes from the verified token; the guest id is a random id the browser keeps,
// honoured only for callers who may sign up at all.
async function eventViewer(req, data) {
  const hasCode = hasValidAccessCode(data);
  const user = req.user || {};
  const memberName = user.isMember && user.memberName ? user.memberName.trim().toLowerCase() : '';
  // With auto-register on, members pick their own members-list name, so it can't
  // prove who they are
  const trustMemberName = !!memberName && !(await settingsDb.getAll()).autoRegister;
  const signers = [];
  if (req.user && req.user.email) signers.push('google:' + req.user.email.toLowerCase());
  if ((req.user || hasCode) && typeof data.signerId === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(data.signerId)) {
    signers.push('guest:' + data.signerId);
  }
  return {
    signers,
    selfNames: [memberName, (user.name || '').trim().toLowerCase()].filter(Boolean),
    // A members-list name (set by admins, unlike the Google profile name), so a guest
    // can't lock a member out by signing up under it first
    ownNames: trustMemberName ? [memberName] : [],
    isAdmin: !!(req.user && req.user.isAdmin),
    canSeeNames: !!(req.user && req.user.isMember) || hasCode
  };
}

const handlers = {
  ping:               () => ({ status: 'ok' }),
  checkAccessCode:    (d) => ({ valid: !!(config.accessCode && d.code === config.accessCode) }),
  // Meals
  getWeek:            (d) => mealsHandler.getWeek(d.monday),
  addSignups:         (d) => mealsHandler.addSignups(d.monday, d.entries, d.caps || {}),
  removeSignup:       (d) => mealsHandler.removeSignup(d.monday, d.dayIndex, d.name, d.time),
  setWeekConfig:      (d) => mealsHandler.setWeekConfig(d.monday, d.config, d.caps || {}, d.freezeDate || ''),
  adminAddSignup:     (d) => mealsHandler.adminAddSignup(d.monday, d.dayIndex, d.name, d.time),
  // Spot Up
  spotUp:             (d) => spotupHandler.spotUp(d.monday, d.dayIndex, d.name, d.time),
  claimSpotUp:        (d) => spotupHandler.claimSpotUp(d.monday, d.dayIndex, d.originalName, d.time, d.claimerName),
  unclaimSpotUp:      (d) => spotupHandler.unclaimSpotUp(d.monday, d.dayIndex, d.originalName, d.time),
  cancelSpotUp:       (d) => spotupHandler.cancelSpotUp(d.monday, d.dayIndex, d.name, d.time),
  markServed:         (d) => spotupHandler.markServed(d.monday, d.dayIndex, d.name, d.time, d.served),
  // Members
  checkMember:        (d) => membersHandler.checkMember(d.email, d.name),
  getMembers:         () => membersHandler.getMembers(),
  addMember:          (d) => membersHandler.addMember(d.email, d.isAdmin, d.name),
  removeMember:       (d) => membersHandler.removeMember(d.email),
  // Access
  requestAccess:        (d) => accessHandler.requestAccess(d.email, d.name),
  getAccessRequests:    () => accessHandler.getAccessRequests(),
  approveAccessRequest: (d) => accessHandler.approveAccessRequest(d.email, d.name),
  denyAccessRequest:    (d) => accessHandler.denyAccessRequest(d.email),
  // Settings
  getSettings:        () => settingsHandler.getSettings(),
  setSettings:        (d) => settingsHandler.setSettings(d.settings),
  setNotifyEmail:     (d) => settingsHandler.setNotifyEmail(d.email, d.notify),
  // Events
  getEvents:          async (d, req) => eventsHandler.getEvents(await eventViewer(req, d)),
  createEvent:        (d) => eventsHandler.createEvent(d.event),
  updateEvent:        (d) => eventsHandler.updateEvent(d.eventId, d.event),
  deleteEvent:        (d) => eventsHandler.deleteEvent(d.eventId),
  addEventSignup:     async (d, req) => eventsHandler.addEventSignup(d.eventId, d.signup, await eventViewer(req, d)),
  removeEventSignup:  async (d, req) => eventsHandler.removeEventSignup(d.eventId, d.name, await eventViewer(req, d)),
};

async function dispatch(req, res) {
  let data;
  if (req.method === 'GET' && req.query.payload) {
    try { data = JSON.parse(req.query.payload); } catch (e) {
      return res.json({ error: 'Invalid payload JSON' });
    }
  } else {
    data = req.body || {};
  }

  const action = data.action;
  if (!action) return res.json({ error: 'Missing action' });

  const handler = handlers[action];
  if (!handler) return res.json({ error: 'Unknown action: ' + action });

  try {
    let result = await handler(data, req);

    // Strip sensitive fields from getWeek for non-admin callers
    if (action === 'getWeek' && result && result.signups && !(req.user && req.user.isAdmin)) {
      for (const dayIdx of Object.keys(result.signups)) {
        result.signups[dayIdx] = result.signups[dayIdx].map(s => {
          const { diet, allergies, ...rest } = s;
          return rest;
        });
      }
    }

    res.json(result);
  } catch (err) {
    console.error(`Action ${action} error:`, err);
    res.json({ error: 'Internal error' });
  }
}

router.get('/', dispatch);
router.post('/', dispatch);

module.exports = router;
