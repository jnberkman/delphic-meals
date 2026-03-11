const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('../services/groupme');
const sheetsSync = require('../services/sheetsSync');

// In-memory pending states for users whose nickname isn't in the map.
// Key: sender_id, Value: { claimNum, timestamp }
// claimNum: the # they want to claim (null = most recent)
const pendingNameRequests = new Map();
const PENDING_TTL = 2 * 60 * 1000;

function cleanExpired() {
  const now = Date.now();
  for (const [key, val] of pendingNameRequests) {
    if (now - val.timestamp > PENDING_TTL) pendingNameRequests.delete(key);
  }
}

async function getSpotLabel(signup) {
  const monday = typeof signup.monday === 'string'
    ? signup.monday
    : signup.monday.toISOString().split('T')[0];
  const weekCfg = await weeksDb.getConfig(monday);
  const cfg = weekCfg ? weekCfg.config : null;
  const dayInfo = cfg && cfg[signup.day_index] ? cfg[signup.day_index] : {};
  if (dayInfo.day && dayInfo.meal) {
    let datePart = '';
    if (dayInfo.date) {
      const [, mm, dd] = dayInfo.date.split('-');
      datePart = ` (${parseInt(mm)}/${parseInt(dd)})`;
    }
    return `${signup.spot_up_orig_name}'s ${dayInfo.day} ${dayInfo.meal}${datePart}`;
  }
  return `${signup.spot_up_orig_name}'s meal`;
}

async function executeClaimById(spotId, claimerName) {
  const result = await db.transaction(async (trx) => {
    const signup = await signupsDb.findSpotUpByIdForUpdate(trx, spotId);
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

  const label = await getSpotLabel(result);
  groupme.postMessage(`${claimerName} claimed ${label} spot`);
  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return result;
}

/**
 * Execute a claim for the given claimer.
 * claimNum: 1-based index into the spot list, or null for the most recent.
 */
async function executeClaim(claimerName, claimNum) {
  const spots = await signupsDb.findAllAvailableSpotUps();
  if (spots.length === 0) return;

  // Most recent = last in the list (ordered by spotted_up_at asc)
  let spot;
  if (claimNum !== null) {
    if (claimNum < 1 || claimNum > spots.length) {
      groupme.postMessage(`Invalid number. Reply "claim #" with a number between 1 and ${spots.length}.`);
      return;
    }
    spot = spots[claimNum - 1];
  } else {
    spot = spots[spots.length - 1];
  }

  const result = await executeClaimById(spot.id, claimerName);
  if (!result) {
    groupme.postMessage('Sorry, that spot was already claimed.');
  }
}

/**
 * POST /groupme/callback/:secret
 *
 * Commands:
 *   "claim"   — claims the most recent spot-up
 *   "claim #" — claims a specific spot by number
 *   "spots"   — lists all available spot-ups with numbers
 *
 * If the sender's nickname isn't in the map, asks for their name first.
 */
router.post('/callback/:secret', async (req, res) => {
  res.status(200).end();

  const { secret } = req.params;
  if (!config.groupmeCallbackSecret || secret !== config.groupmeCallbackSecret) return;

  const msg = req.body;
  if (!msg || msg.sender_type === 'bot') return;
  if (!msg.text) return;

  const text = msg.text.trim();
  const textLower = text.toLowerCase();
  const senderId = msg.sender_id;

  try {
    cleanExpired();

    // Handle pending name reply for unknown nicknames
    const pending = pendingNameRequests.get(senderId);
    if (pending) {
      pendingNameRequests.delete(senderId);
      const claimerName = text;
      if (!claimerName) return;
      await executeClaim(claimerName, pending.claimNum);
      return;
    }

    // "spots" — list available spot-ups
    if (textLower === 'spots') {
      const spots = await signupsDb.findAllAvailableSpotUps();
      if (spots.length === 0) {
        groupme.postMessage('No spots available right now.');
        return;
      }
      const labels = await Promise.all(spots.map(s => getSpotLabel(s)));
      const lines = labels.map((label, i) => `${i + 1}. ${label}`);
      groupme.postMessage(`Available spots:\n${lines.join('\n')}\n\nReply "claim" for most recent, or "claim #" for a specific one.`);
      return;
    }

    // Parse "claim" or "claim #"
    const claimMatch = textLower.match(/^claim(?:\s+(\d+))?$/);
    if (!claimMatch) return;

    const claimNum = claimMatch[1] ? parseInt(claimMatch[1], 10) : null;
    const resolvedName = groupme.resolveNickname(msg.name);

    if (resolvedName) {
      await executeClaim(resolvedName, claimNum);
    } else {
      pendingNameRequests.set(senderId, { claimNum, timestamp: Date.now() });
      groupme.postMessage(`${msg.name}, reply with your first and last name to claim the spot.`);
    }
  } catch (e) {
    console.error('GroupMe callback error:', e.message);
  }
});

module.exports = router;
