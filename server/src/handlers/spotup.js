const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const { normalizeTime } = require('../utils/time');
const sheetsSync = require('../services/sheetsSync');
const emailService = require('../services/email');
const groupme = require('../services/groupme');

/**
 * Port of spotUp() from Code.gs:212-242.
 */
async function spotUp(monday, dayIndex, name, time) {
  const timeNorm = normalizeTime(time);
  const signup = await signupsDb.findSignup(monday, dayIndex, name, timeNorm);
  if (!signup) return { error: 'Signup not found' };

  await signupsDb.update(signup.id, {
    spot_up_status: 'spotup',
    spot_up_orig_name: name,
    spot_up_claimed_by: '',
    spotted_up_at: new Date()
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));

  // Get week config for day/meal context (used by both email and GroupMe)
  let dayMeal = 'a meal';
  try {
    const weekCfg = await weeksDb.getConfig(monday);
    const weekConfig = weekCfg ? weekCfg.config : null;
    const dayName = weekConfig && weekConfig[dayIndex] ? (weekConfig[dayIndex].day || '') : '';
    const mealType = weekConfig && weekConfig[dayIndex] ? (weekConfig[dayIndex].meal || '') : '';
    const dateStr = weekConfig && weekConfig[dayIndex] ? (weekConfig[dayIndex].date || '') : '';
    if (dayName && mealType) {
      let datePart = '';
      if (dateStr) {
        const [, mm, dd] = dateStr.split('-');
        datePart = ` (${parseInt(mm)}/${parseInt(dd)})`;
      }
      dayMeal = `${dayName} ${mealType}${datePart}`;
    }

    await emailService.sendSpotUpEmails(monday, dayIndex, name, timeNorm, weekConfig);
    sheetsSync.syncClaimTokens().catch(e => console.error('Sheets sync error (claim tokens):', e.message));
  } catch (e) {
    console.error('Spot-up email error:', e.message);
  }

  // Post to GroupMe (fire-and-forget)
  // Keep it short — "spots" command gives the full list
  const allSpots = await signupsDb.findAllAvailableSpotUps().catch(() => []);
  if (allSpots.length > 1) {
    // Find this spot's position in the list (ordered by spotted_up_at asc)
    const idx = allSpots.findIndex(s => s.id === signup.id);
    const num = idx >= 0 ? idx + 1 : allSpots.length;
    groupme.postMessage(`${name} spotted up for ${dayMeal} — reply "claim ${num}" to claim it (${allSpots.length} spots open, "spots" to see all)`);
  } else {
    groupme.postMessage(`${name} spotted up for ${dayMeal} — reply "claim" to claim it`);
  }

  return { status: 'ok' };
}

/**
 * Port of claimSpotUp() from Code.gs:248-279.
 * Uses SELECT ... FOR UPDATE for concurrency control.
 */
async function claimSpotUp(monday, dayIndex, originalName, time, claimerName) {
  const timeNorm = normalizeTime(time);

  return db.transaction(async (trx) => {
    const signup = await signupsDb.findSpotUpForUpdate(trx, monday, dayIndex, originalName, timeNorm);
    if (!signup) return { error: 'Spot up not found or already claimed' };

    await trx('signups').where('id', signup.id).update({
      name: claimerName,
      spot_up_status: 'claimed',
      spot_up_orig_name: signup.spot_up_orig_name || originalName,
      spot_up_claimed_by: claimerName
    });

    sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
    return { status: 'ok' };
  });
}

/**
 * Port of unclaimSpotUp() from Code.gs:285-312.
 */
async function unclaimSpotUp(monday, dayIndex, originalName, time) {
  const timeNorm = normalizeTime(time);

  return db.transaction(async (trx) => {
    const signup = await signupsDb.findClaimedForUpdate(trx, monday, dayIndex, originalName, timeNorm);
    if (!signup) return { error: 'Claimed spot not found' };

    await trx('signups').where('id', signup.id).update({
      name: signup.spot_up_orig_name,
      spot_up_status: 'spotup',
      spot_up_claimed_by: '',
      spotted_up_at: new Date()
    });

    sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));

    // Re-notify GroupMe that the spot is available again
    const weekCfg = await weeksDb.getConfig(monday);
    const cfg = weekCfg ? weekCfg.config : null;
    const dayInfo = cfg && cfg[dayIndex] ? cfg[dayIndex] : {};
    let dayMeal = 'a meal';
    if (dayInfo.day && dayInfo.meal) {
      let datePart = '';
      if (dayInfo.date) {
        const [, mm, dd] = dayInfo.date.split('-');
        datePart = ` (${parseInt(mm)}/${parseInt(dd)})`;
      }
      dayMeal = `${dayInfo.day} ${dayInfo.meal}${datePart}`;
    }
    const allSpots = await signupsDb.findAllAvailableSpotUps().catch(() => []);
    if (allSpots.length > 1) {
      const idx = allSpots.findIndex(s => s.id === signup.id);
      const num = idx >= 0 ? idx + 1 : allSpots.length;
      groupme.postMessage(`${signup.spot_up_orig_name}'s ${dayMeal} spot is available again — reply "claim ${num}" to claim it (${allSpots.length} spots open, "spots" to see all)`);
    } else {
      groupme.postMessage(`${signup.spot_up_orig_name}'s ${dayMeal} spot is available again — reply "claim" to claim it`);
    }

    return { status: 'ok' };
  });
}

/**
 * Port of cancelSpotUp() from Code.gs:318-343.
 */
async function cancelSpotUp(monday, dayIndex, name, time) {
  const timeNorm = normalizeTime(time);
  const signup = await signupsDb.findSignup(monday, dayIndex, name, timeNorm);
  if (!signup || signup.spot_up_status !== 'spotup') {
    return { error: 'Spot up not found or already claimed' };
  }

  await signupsDb.update(signup.id, {
    spot_up_status: '',
    spot_up_orig_name: '',
    spot_up_claimed_by: '',
    spotted_up_at: null
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { status: 'ok' };
}

/**
 * Port of markServed() from Code.gs:370-390.
 */
async function markServed(monday, dayIndex, name, time, served) {
  const timeNorm = normalizeTime(time);
  const signup = await signupsDb.findSignup(monday, dayIndex, name, timeNorm);
  if (!signup) return { error: 'Signup not found' };

  await signupsDb.update(signup.id, {
    served_status: served ? 'served' : ''
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { status: 'ok' };
}

module.exports = { spotUp, claimSpotUp, unclaimSpotUp, cancelSpotUp, markServed };
