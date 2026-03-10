const { OAuth2Client } = require('google-auth-library');

const config = require('../config');
const GOOGLE_CLIENT_ID = config.googleClientId;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Actions that require no authentication
const PUBLIC_ACTIONS = new Set([
  'ping',
  'checkAccessCode',
  'checkMember',
  'requestAccess',
  'getSettings',
  'getWeek',
  'getEvents',
]);

// Actions that require a verified Google token + admin membership
const ADMIN_ACTIONS = new Set([
  'getMembers',
  'addMember',
  'removeMember',
  'getAccessRequests',
  'approveAccessRequest',
  'denyAccessRequest',
  'setSettings',
  'setWeekConfig',
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'markServed',
  'setNotifyEmail',
]);

const membersDb = require('../db/queries/members');

/**
 * Verify a Google id_token and return the payload (email, name, etc.)
 * Returns null if verification fails.
 */
async function verifyGoogleToken(idToken) {
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  } catch (e) {
    return null;
  }
}

/**
 * Auth middleware for the /api route.
 * Extracts action from the request body/query, checks auth requirements.
 * Sets req.user if a valid Google token is present.
 */
async function auth(req, res, next) {
  // Parse action from request
  let data;
  if (req.method === 'GET' && req.query.payload) {
    try { data = JSON.parse(req.query.payload); } catch (e) { data = {}; }
  } else {
    data = req.body || {};
  }
  const action = data.action;

  // Public actions — no auth needed
  if (PUBLIC_ACTIONS.has(action)) return next();

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  // If token present, verify it
  if (token) {
    const payload = await verifyGoogleToken(token);
    if (payload) {
      req.user = { email: payload.email, name: payload.name };
    }
  }

  // Admin actions require verified Google user + admin flag
  if (ADMIN_ACTIONS.has(action)) {
    if (!req.user) {
      return res.json({ error: 'Authentication required' });
    }
    const member = await membersDb.findByEmail(req.user.email);
    if (!member || !member.is_admin) {
      return res.json({ error: 'Admin access required' });
    }
  }

  next();
}

module.exports = auth;
