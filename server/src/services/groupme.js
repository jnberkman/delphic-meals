const config = require('../config');

const GROUPME_API = 'https://api.groupme.com/v3';

// Parse GROUPME_NICKNAME_MAP env var (JSON: {"nickname": "Real Name", ...})
// Keys are lowercased at parse time for case-insensitive lookup.
const NICKNAME_MAP = (() => {
  if (!config.groupmeNicknameMap) return {};
  try {
    const raw = JSON.parse(config.groupmeNicknameMap);
    const map = {};
    for (const [nick, real] of Object.entries(raw)) {
      map[nick.toLowerCase().trim()] = real;
    }
    return map;
  } catch (e) {
    console.error('Failed to parse GROUPME_NICKNAME_MAP:', e.message);
    return {};
  }
})();

/**
 * Resolve a GroupMe nickname to a real name using the nickname map.
 * Returns null if no mapping exists.
 */
function resolveNickname(nickname) {
  if (!nickname) return null;
  return NICKNAME_MAP[nickname.toLowerCase().trim()] || null;
}

/**
 * Post a message to the GroupMe group via the bot.
 * Fire-and-forget — logs errors but never throws.
 */
async function postMessage(text) {
  if (!config.groupmeBotId) return;
  try {
    const res = await fetch(`${GROUPME_API}/bots/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: config.groupmeBotId, text })
    });
    if (!res.ok) {
      console.error('GroupMe post error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('GroupMe post error:', e.message);
  }
}

module.exports = { postMessage, resolveNickname };
