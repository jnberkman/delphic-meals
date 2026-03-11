const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('../services/groupme');
const sheetsSync = require('../services/sheetsSync');

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

async function buildSpotsList() {
  const spots = await signupsDb.findAllAvailableSpotUps();
  if (spots.length === 0) return { list: null, spots: [] };
  const labels = await Promise.all(spots.map(s => getSpotLabel(s)));
  const list = labels.map((label, i) => `${i + 1}. ${label}`).join('\n');
  return { list, spots };
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

async function executeClaim(claimerName, claimNum) {
  const spots = await signupsDb.findAllAvailableSpotUps();
  if (spots.length === 0) return;

  let spot;
  if (claimNum !== null) {
    if (claimNum < 1 || claimNum > spots.length) return; // silently ignore bad numbers
    spot = spots[claimNum - 1];
  } else {
    spot = spots[0];
  }

  await executeClaimById(spot.id, claimerName);
  // silently ignore if already claimed — no error message
}

/**
 * POST /groupme/callback/:secret
 *
 * Commands (must be the ENTIRE message, nothing else):
 *   "claim"            — claims the most recent spot-up
 *   "claim #"          — claims a specific spot by number (use "spots" to see numbers)
 *   "spots"            — lists all available spot-ups with numbers
 *   "name First Last"  — sets your real name for future claims (requires first + last)
 *
 * Name resolution: DB (self-set) → env var map → GroupMe nickname.
 * Silently ignores unrecognized messages and invalid input to avoid chat noise.
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
    // "name First Last" — requires at least two words after "name"
    const nameMatch = text.match(/^name\s+(\S+\s+\S.*)$/i);
    if (nameMatch) {
      const realName = nameMatch[1].trim();
      await groupme.setNickname(senderId, msg.name, realName);
      groupme.postMessage(`${msg.name} → ${realName}`);
      return;
    }

    // "spots" — list available spot-ups
    if (textLower === 'spots') {
      const { list } = await buildSpotsList();
      if (!list) return; // no spots, stay silent
      groupme.postMessage(`Available spots:\n${list}\n\n"claim" = most recent, "claim #" = specific`);
      return;
    }

    // "claim" or "claim #"
    const claimMatch = textLower.match(/^claim(?:\s+(\d+))?$/);
    if (!claimMatch) return;

    const claimNum = claimMatch[1] ? parseInt(claimMatch[1], 10) : null;
    const claimerName = await groupme.resolveNickname(senderId, msg.name);

    if (!claimerName) {
      groupme.postMessage(`${msg.name}, set your name first: reply "name First Last"`);
      return;
    }

    await executeClaim(claimerName, claimNum);
  } catch (e) {
    console.error('GroupMe callback error:', e.message);
  }
});

module.exports = router;
