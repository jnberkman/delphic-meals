const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('../services/groupme');
const sheetsSync = require('../services/sheetsSync');

/**
 * POST /groupme/callback/:secret
 * Receives messages from GroupMe. Processes "claim" keyword to award spot-ups.
 */
router.post('/callback/:secret', async (req, res) => {
  // Always respond 200 quickly — GroupMe expects it
  res.status(200).end();

  const { secret } = req.params;
  if (!config.groupmeCallbackSecret || secret !== config.groupmeCallbackSecret) return;

  const msg = req.body;
  if (!msg || msg.sender_type === 'bot') return;
  if (!msg.text || msg.text.trim().toLowerCase() !== 'claim') return;

  try {
    // Look up sender's real GroupMe name (not group nickname)
    const claimerName = await groupme.getMemberName(msg.sender_id) || msg.name;
    if (!claimerName) return;

    // Find and claim the oldest available spot-up within 2 hours
    const result = await db.transaction(async (trx) => {
      const signup = await signupsDb.findOldestSpotUpForUpdate(trx);
      if (!signup) return null;

      await trx('signups').where('id', signup.id).update({
        name: claimerName,
        spot_up_status: 'claimed',
        spot_up_orig_name: signup.spot_up_orig_name,
        spot_up_claimed_by: claimerName
      });

      // Invalidate all email claim tokens for this spot
      await trx('claim_tokens')
        .where({ monday: signup.monday, day_idx: signup.day_index, orig_name: signup.spot_up_orig_name, time: signup.time, used: false })
        .update({ used: true });

      return signup;
    });

    if (!result) return;

    // Ensure monday is a string (DB may return Date object)
    const monday = typeof result.monday === 'string'
      ? result.monday
      : result.monday.toISOString().split('T')[0];

    // Build confirmation message with day/meal context
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
  } catch (e) {
    console.error('GroupMe callback error:', e.message);
  }
});

module.exports = router;
