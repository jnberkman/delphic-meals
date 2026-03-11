const config = require('../config');
const db = require('../db/knex');

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
 * Resolve a GroupMe sender to a real name.
 * Priority: DB override → env var map → null.
 */
async function resolveNickname(senderId, nickname) {
  if (!nickname) return null;

  // Check DB first (user-set names)
  try {
    const row = await db('groupme_nicknames').where('sender_id', senderId).first();
    if (row) return row.real_name;
  } catch (e) {
    // Table may not exist yet during migration
  }

  // Fall back to env var map
  return NICKNAME_MAP[nickname.toLowerCase().trim()] || null;
}

/**
 * Save a user's real name in the DB, keyed by their GroupMe sender_id.
 */
async function setNickname(senderId, nickname, realName) {
  const existing = await db('groupme_nicknames').where('sender_id', senderId).first();
  if (existing) {
    await db('groupme_nicknames').where('sender_id', senderId).update({
      nickname,
      real_name: realName
    });
  } else {
    await db('groupme_nicknames').insert({
      sender_id: senderId,
      nickname,
      real_name: realName
    });
  }
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

module.exports = { postMessage, resolveNickname, setNickname };
