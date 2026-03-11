const { Router } = require('express');
const router = Router();
const db = require('../db/knex');
const claimTokensDb = require('../db/queries/claimTokens');
const membersDb = require('../db/queries/members');
const signupsDb = require('../db/queries/signups');
const { normalizeTime } = require('../utils/time');
const { buildClaimResultPage } = require('../services/emailTemplates');
const sheetsSync = require('../services/sheetsSync');

/**
 * Port of handleEmailClaim() + claimViaToken() from Code.gs:52-1331.
 * Uses Postgres row-level locking instead of Apps Script LockService.
 */
router.get('/', async (req, res) => {
  const token = req.query.claimToken;
  if (!token) return res.status(400).send(renderError('Missing Token', 'No claim token provided.'));

  try {
    const result = await claimViaToken(token);
    const success = result.status === 'ok';
    const title = success ? 'Spot Claimed!' : (result.error === 'claim_failed' ? 'Already Claimed' : 'Error');
    const msg = success
      ? `You've claimed <strong>${result.origName}'s</strong> spot. You're on the list.`
      : (result.message || 'Something went wrong.');
    const name = success ? result.claimerName : '';
    res.send(buildClaimResultPage(success, title, msg, name));
  } catch (err) {
    console.error('Claim error:', err);
    res.send(renderError('Error', 'Something went wrong. Please try again.'));
  }
});

async function claimViaToken(token) {
  return db.transaction(async (trx) => {
    const tokenRow = await trx('claim_tokens').where('token', token).forUpdate().first();
    if (!tokenRow) return { error: 'not_found', message: 'Link not found or expired.' };

    if (tokenRow.used) return { error: 'already_used', message: 'This link has already been used.' };

    // Reject tokens older than 24 hours
    if (tokenRow.created_at && Date.now() - new Date(tokenRow.created_at).getTime() > 24 * 60 * 60 * 1000) {
      return { error: 'expired', message: 'This link has expired.' };
    }

    const monday = tokenRow.monday;
    const dayIdx = tokenRow.day_idx;
    const origName = tokenRow.orig_name;
    const time = tokenRow.time;
    const recipientEmail = tokenRow.recipient_email;

    const member = await membersDb.findByEmail(recipientEmail);
    if (!member) return { error: 'not_member', message: 'Your email is not on the member list.' };
    const claimerName = member.name || recipientEmail;

    // Try to claim the spot
    const timeNorm = normalizeTime(time);
    const signup = await signupsDb.findSpotUpForUpdate(trx, monday, dayIdx, origName, timeNorm);
    if (!signup) return { error: 'claim_failed', message: 'This spot was already claimed by someone else.' };

    await trx('signups').where('id', signup.id).update({
      name: claimerName,
      spot_up_status: 'claimed',
      spot_up_orig_name: signup.spot_up_orig_name || origName,
      spot_up_claimed_by: claimerName
    });

    // Invalidate all tokens for this spot
    await trx('claim_tokens')
      .where({ monday, day_idx: dayIdx, orig_name: origName, time, used: false })
      .update({ used: true });

    sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (claim):', e.message));
    sheetsSync.syncClaimTokens().catch(e => console.error('Sheets sync error (claim tokens):', e.message));

    return { status: 'ok', claimerName, origName, monday, dayIdx };
  });
}

function renderError(title, message) {
  return buildClaimResultPage(false, title, message, '');
}

module.exports = router;
