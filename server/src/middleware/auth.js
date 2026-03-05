/**
 * Placeholder auth middleware for future Google id_token verification.
 * Currently a no-op pass-through to match the existing Apps Script behavior
 * (which does no server-side token verification).
 */
module.exports = function auth(req, res, next) {
  next();
};
