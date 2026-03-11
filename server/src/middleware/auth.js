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

// Actions that require a verified Google token OR a valid access code
const MEMBER_ACTIONS = new Set([
  'addSignups',
  'removeSignup',
  'spotUp',
  'claimSpotUp',
  'unclaimSpotUp',
  'cancelSpotUp',
  'addEventSignup',
  'removeEventSignup',
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
 * Check if the request includes a valid guest access code.
 */
function hasValidAccessCode(data) {
  return !!(config.accessCode && data.accessCode === config.accessCode);
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

  // Extract token from Authorization header (always attempt, even for public actions)
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (token) {
    const payload = await verifyGoogleToken(token);
    if (payload) {
      const member = await membersDb.findByEmail(payload.email);
      req.user = { email: payload.email, name: payload.name, isAdmin: !!(member && member.is_admin) };
    }
  }

  // Public actions — no auth needed (but req.user may be set above)
  if (PUBLIC_ACTIONS.has(action)) return next();

  // Member actions require a verified Google token OR a valid access code
  if (MEMBER_ACTIONS.has(action)) {
    if (!req.user && !hasValidAccessCode(data)) {
      return res.json({ error: 'Authentication required' });
    }
    return next();
  }

  // Admin actions require verified Google user + admin flag
  if (ADMIN_ACTIONS.has(action)) {
    if (!req.user) {
      return res.json({ error: 'Authentication required' });
    }
    if (!req.user.isAdmin) {
      return res.json({ error: 'Admin access required' });
    }
  }

  next();
}

module.exports = auth;
