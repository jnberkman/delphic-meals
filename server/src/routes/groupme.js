const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('../services/groupme');
const sheetsSync = require('../services/sheetsSync');

// In-memory store for pending claims awaiting a name reply.
// Key: sender_id, Value: { timestamp }
// Expires after 2 minutes.
const pendingNameRequests = new Map();
const PENDING_TTL = 2 * 60 * 1000;

function cleanExpiredPending() {
  const now = Date.now();
  for (const [key, val] of pendingNameRequests) {
    if (now - val.timestamp > PENDING_TTL) pendingNameRequests.delete(key);
  }
}

async function claimSpot(claimerName) {
  const result = await db.transaction(async (trx) => {
    const signup = await signupsDb.findOldestSpotUpForUpdate(trx);
    if (!signup) return null;

    await trx('signups').where('id', signup.id).update({
      name: claimerName,
      spot_up_status: 'claimed',
      spot_up_orig_name: signup.spot_up_orig_name,
      spot_up_claimed_by: claimerName
    });

    await trx('claim_tokens')
      .where({ monday: signup.monday, day_idx: signup.day_index, orig_name: signup.spot_up_orig_name, time: signup.time, used: false })
      .update({ used: true });

    return signup;
  });

  if (!result) return null;

  const monday = typeof result.monday === 'string'
    ? result.monday
    : result.monday.toISOString().split('T')[0];

  const weekCfg = await weeksDb.getConfig(monday);
  const cfg = weekCfg ? weekCfg.config : null;
  const dayInfo = cfg && cfg[result.day_index] ? cfg[result.day_index] : {};
  let dayMeal = 'meal';
  if (dayInfo.day && dayInfo.meal) {
    let datePart = '';
    if (dayInfo.date) {
      const [, mm, dd] = dayInfo.date.split('-');
      datePart = ` (${parseInt(mm)}/${parseInt(dd)})`;
    }
    dayMeal = `${dayInfo.day} ${dayInfo.meal}${datePart}`;
  }

  groupme.postMessage(`${claimerName} claimed ${result.spot_up_orig_name}'s ${dayMeal} spot`);
  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return result;
}

/**
 * POST /groupme/callback/:secret
 * Receives messages from GroupMe. Processes "claim" keyword to award spot-ups.
 * If the sender's nickname isn't in the map, asks for their real name first.
 */
router.post('/callback/:secret', async (req, res) => {
  res.status(200).end();

  const { secret } = req.params;
  if (!config.groupmeCallbackSecret || secret !== config.groupmeCallbackSecret) return;

  const msg = req.body;
  if (!msg || msg.sender_type === 'bot') return;
  if (!msg.text) return;

  const text = msg.text.trim();
  const senderId = msg.sender_id;

  try {
    cleanExpiredPending();

    // Check if this is a name reply from someone with a pending claim
    if (pendingNameRequests.has(senderId)) {
      pendingNameRequests.delete(senderId);
      const claimerName = text;
      if (!claimerName) return;

      const result = await claimSpot(claimerName);
      if (!result) {
        groupme.postMessage('Sorry, that spot was already claimed.');
      }
      return;
    }

    // Only process "claim" messages
    if (text.toLowerCase() !== 'claim') return;

    const resolvedName = groupme.resolveNickname(msg.name);

    if (resolvedName) {
      const result = await claimSpot(resolvedName);
      if (!result) return;
    } else {
      // Nickname not in map — ask for their real name
      pendingNameRequests.set(senderId, { timestamp: Date.now() });
      groupme.postMessage(`${msg.name}, reply with your first and last name to claim the spot.`);
    }
  } catch (e) {
    console.error('GroupMe callback error:', e.message);
  }
});

module.exports = router;
