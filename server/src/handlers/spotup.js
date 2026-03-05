const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const { normalizeTime } = require('../utils/time');
const sheetsSync = require('../services/sheetsSync');
const emailService = require('../services/email');

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
    spot_up_claimed_by: ''
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));

  // Send email notifications
  try {
    const weekCfg = await weeksDb.getConfig(monday);
    const config = weekCfg ? weekCfg.config : null;
    await emailService.sendSpotUpEmails(monday, dayIndex, name, timeNorm, config);
  } catch (e) {
    console.error('Spot-up email error:', e.message);
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
      spot_up_claimed_by: ''
    });

    sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
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
    spot_up_claimed_by: ''
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
