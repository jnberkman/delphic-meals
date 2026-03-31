const config = require('../config');
const db = require('../db/knex');

const GROUPME_API = 'https://api.groupme.com/v3';

/**
 * Resolve a GroupMe sender to a real name.
 * Priority: DB by sender_id → DB by nickname → null.
 * When found by nickname, backfills the sender_id for future lookups.
 */
async function resolveNickname(senderId, nickname) {
  if (!nickname) return null;

  try {
    // Check by sender_id first (exact match)
    const bySender = await db('groupme_nicknames').where('sender_id', senderId).first();
    if (bySender) return bySender.real_name;

    // Fall back to nickname lookup (case-insensitive)
    const byNick = await db('groupme_nicknames')
      .whereRaw('LOWER(nickname) = ?', [nickname.toLowerCase().trim()])
      .first();
    if (byNick) {
      // Backfill the real sender_id so future lookups are instant
      await db('groupme_nicknames').where('id', byNick.id).update({
        sender_id: senderId
      });
      return byNick.real_name;
    }
  } catch (e) {
    console.error('resolveNickname error:', e.message);
  }

  return null;
}

/**
 * Save a user's real name in the DB, keyed by their GroupMe sender_id.
 * Returns true on success, false on failure.
 */
async function setNickname(senderId, nickname, realName) {
  try {
    // Check if this sender already has an entry
    const bySender = await db('groupme_nicknames').where('sender_id', senderId).first();
    if (bySender) {
      await db('groupme_nicknames').where('id', bySender.id).update({
        nickname,
        real_name: realName
      });
      return true;
    }

    // Check if there's a nickname-only entry (from imported map) to claim
    const byNick = await db('groupme_nicknames')
      .whereRaw('LOWER(nickname) = ?', [nickname.toLowerCase().trim()])
      .first();
    if (byNick) {
      await db('groupme_nicknames').where('id', byNick.id).update({
        sender_id: senderId,
        real_name: realName
      });
      return true;
    }

    // New entry
    await db('groupme_nicknames').insert({
      sender_id: senderId,
      nickname,
      real_name: realName
    });
    return true;
  } catch (e) {
    console.error('setNickname error:', e.message);
    return false;
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

/**
 * Post a message to the GroupMe topic via user access token.
 * Fire-and-forget — logs errors but never throws.
 */
async function postToTopic(text) {
  if (!config.groupmeTopicId || !config.groupmeAccessToken) return;
  try {
    const res = await fetch(`${GROUPME_API}/groups/${config.groupmeTopicId}/messages?token=${config.groupmeAccessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          source_guid: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text
        }
      })
    });
    if (!res.ok) {
      console.error('GroupMe topic post error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('GroupMe topic post error:', e.message);
  }
}

module.exports = { postMessage, postToTopic, resolveNickname, setNickname };
