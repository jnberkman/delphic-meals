const config = require('../config');

const GROUPME_API = 'https://api.groupme.com/v3';

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

/**
 * Look up a GroupMe user's real name (not group nickname) by user_id.
 * Returns the name string, or null if not found.
 */
async function getMemberName(senderUserId) {
  if (!config.groupmeAccessToken || !config.groupmeGroupId) return null;
  try {
    const res = await fetch(
      `${GROUPME_API}/groups/${config.groupmeGroupId}?token=${config.groupmeAccessToken}`
    );
    if (!res.ok) {
      console.error('GroupMe group fetch error:', res.status);
      return null;
    }
    const data = await res.json();
    const member = data.response.members.find(m => m.user_id === senderUserId);
    return member ? member.name : null;
  } catch (e) {
    console.error('GroupMe member lookup error:', e.message);
    return null;
  }
}

module.exports = { postMessage, getMemberName };
