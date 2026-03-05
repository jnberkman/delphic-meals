const { Router } = require('express');
const router = Router();

const mealsHandler = require('../handlers/meals');
const spotupHandler = require('../handlers/spotup');
const membersHandler = require('../handlers/members');
const accessHandler = require('../handlers/access');
const settingsHandler = require('../handlers/settings');
const eventsHandler = require('../handlers/events');

const handlers = {
  ping:               () => ({ status: 'ok' }),
  // Meals
  getWeek:            (d) => mealsHandler.getWeek(d.monday),
  addSignups:         (d) => mealsHandler.addSignups(d.monday, d.entries, d.caps || {}),
  removeSignup:       (d) => mealsHandler.removeSignup(d.monday, d.dayIndex, d.name, d.time),
  setWeekConfig:      (d) => mealsHandler.setWeekConfig(d.monday, d.config, d.caps || {}, d.freezeDate || ''),
  // Spot Up
  spotUp:             (d) => spotupHandler.spotUp(d.monday, d.dayIndex, d.name, d.time),
  claimSpotUp:        (d) => spotupHandler.claimSpotUp(d.monday, d.dayIndex, d.originalName, d.time, d.claimerName),
  unclaimSpotUp:      (d) => spotupHandler.unclaimSpotUp(d.monday, d.dayIndex, d.originalName, d.time),
  cancelSpotUp:       (d) => spotupHandler.cancelSpotUp(d.monday, d.dayIndex, d.name, d.time),
  markServed:         (d) => spotupHandler.markServed(d.monday, d.dayIndex, d.name, d.time, d.served),
  // Members
  checkMember:        (d) => membersHandler.checkMember(d.email),
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
  getEvents:          () => eventsHandler.getEvents(),
  createEvent:        (d) => eventsHandler.createEvent(d.event),
  updateEvent:        (d) => eventsHandler.updateEvent(d.eventId, d.event),
  deleteEvent:        (d) => eventsHandler.deleteEvent(d.eventId),
  addEventSignup:     (d) => eventsHandler.addEventSignup(d.eventId, d.signup),
  removeEventSignup:  (d) => eventsHandler.removeEventSignup(d.eventId, d.name),
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
    const result = await handler(data);
    res.json(result);
  } catch (err) {
    console.error(`Action ${action} error:`, err);
    res.json({ error: err.message || 'Internal error' });
  }
}

router.get('/', dispatch);
router.post('/', dispatch);

module.exports = router;
