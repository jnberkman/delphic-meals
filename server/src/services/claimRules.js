const { normalizeTime } = require('../utils/time');
const { DEFAULT_MEALS } = require('../utils/weekHelpers');

function toMondayKey(monday) {
  return typeof monday === 'string' ? monday : monday.toISOString().split('T')[0];
}

async function isDinner(trx, monday, dayIndex, time) {
  const weekCfg = await trx('week_configs').where('monday', monday).first();
  const day = weekCfg && weekCfg.config ? weekCfg.config[dayIndex] : null;
  if (day && day.meal) return /dinner/i.test(day.meal);
  if (normalizeTime(time) === '7:30 PM') return true;
  return DEFAULT_MEALS[dayIndex] === 'Dinner';
}

/**
 * Dinner spot-ups are for members who missed the sign-up window, so a claimer
 * who is already on that evening's list (their own signup or an earlier claim)
 * is turned away. Lunch spot-ups are unrestricted.
 *
 * Must be called inside the claim transaction, after the spot row is locked.
 * Returns an error message, or null if the claim may proceed.
 */
async function checkClaimAllowed(trx, spot, claimerName) {
  const monday = toMondayKey(spot.monday);
  if (!(await isDinner(trx, monday, spot.day_index, spot.time))) return null;

  const displayName = String(claimerName || '').trim();
  const name = displayName.toLowerCase();
  // Serialize claims per person+day so two quick claims can't both pass the check
  await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`claim:${monday}:${spot.day_index}:${name}`]);

  const existing = await trx('signups')
    .where({ monday, day_index: spot.day_index })
    .whereRaw('LOWER(TRIM(name)) = ?', [name])
    .whereNot('id', spot.id)
    .first();
  if (!existing) return null;

  if (existing.spot_up_status === 'spotup') {
    return `${displayName} has their own dinner spot up for grabs that night — cancel that spot-up instead of claiming another`;
  }
  return `${displayName} is already signed up for dinner that night — dinner spot-ups are only for members who missed sign-ups`;
}

module.exports = { checkClaimAllowed, toMondayKey };
