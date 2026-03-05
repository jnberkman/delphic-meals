const weeksDb = require('../db/queries/weeks');
const signupsDb = require('../db/queries/signups');
const { normalizeTime } = require('../utils/time');
const { buildDefaultConfig, DEFAULT_CAPS } = require('../utils/weekHelpers');
const sheetsSync = require('../services/sheetsSync');

/**
 * Port of getWeek() from Code.gs:870-886.
 */
async function getWeek(monday) {
  const weekCfg = await weeksDb.getConfig(monday);
  const config = weekCfg ? weekCfg.config : buildDefaultConfig(monday);
  const caps = weekCfg ? weekCfg.caps : DEFAULT_CAPS;
  const freezeDate = weekCfg ? weekCfg.freeze_date : '';

  const rows = await signupsDb.getByMonday(monday);
  const signups = {};
  for (const row of rows) {
    const dayIdx = row.day_index;
    if (!signups[dayIdx]) signups[dayIdx] = [];
    signups[dayIdx].push({
      name: row.name || '',
      diet: row.diet || 'No Dietary Restrictions',
      allergies: row.allergies || '',
      time: normalizeTime(row.time),
      early: row.early,
      notes: row.notes || '',
      timestamp: row.timestamp ? row.timestamp.toISOString() : '',
      gradGasman: row.grad_gasman,
      spotUpStatus: row.spot_up_status || '',
      spotUpOrigName: row.spot_up_orig_name || '',
      spotUpClaimedBy: row.spot_up_claimed_by || '',
      servedStatus: row.served_status || ''
    });
  }

  return { monday, config, signups, caps, freezeDate };
}

/**
 * Port of addSignups() from Code.gs:889-930.
 */
async function addSignups(monday, entries, caps) {
  // Ensure week config exists
  let weekCfg = await weeksDb.getConfig(monday);
  if (!weekCfg) {
    const defaultCfg = buildDefaultConfig(monday);
    const mergedCaps = { ...DEFAULT_CAPS, ...caps };
    await weeksDb.upsertConfig(monday, defaultCfg, mergedCaps, '');
    weekCfg = await weeksDb.getConfig(monday);
  }

  // Check freeze date
  if (weekCfg.freeze_date) {
    if (Date.now() > new Date(weekCfg.freeze_date).getTime()) {
      return { added: 0, duplicates: 0, full: 0, error: 'Sign-ups are closed for this week' };
    }
  }

  const capSlot12 = caps.slot12 || weekCfg.caps.slot12 || 50;
  const capSlot1 = caps.slot1 || weekCfg.caps.slot1 || 50;
  const capDinner = caps.dinner || weekCfg.caps.dinner || 50;

  let added = 0, updated = 0, full = 0;

  for (const entry of entries) {
    const dayIdx = entry.dayIndex;

    // Delete existing signup for this name+day (upsert behavior)
    const deleted = await signupsDb.deleteByDayAndName(monday, dayIdx, entry.name);
    if (deleted > 0) updated++;

    // Check capacity
    const timeStr = normalizeTime(entry.time);
    const timeCount = await signupsDb.countByTime(monday, dayIdx, timeStr);
    let cap = capSlot12;
    if (timeStr === '1:00 PM') cap = capSlot1;
    else if (timeStr === '7:30 PM') cap = capDinner;

    if (timeCount >= cap) { full++; continue; }

    await signupsDb.insert({
      monday,
      day_index: dayIdx,
      name: entry.name,
      diet: entry.diet || 'No Dietary Restrictions',
      allergies: entry.allergies || '',
      time: timeStr,
      early: entry.early || false,
      notes: entry.notes || '',
      grad_gasman: entry.gradGasman || false
    });
    added++;
  }

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { added, updated, full };
}

/**
 * Port of removeSignup() from Code.gs:932-948.
 */
async function removeSignup(monday, dayIndex, name, time) {
  await signupsDb.deleteByDayAndName(monday, dayIndex, name);
  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { removed: true };
}

/**
 * Port of setWeekConfig() from Code.gs:950-966.
 */
async function setWeekConfig(monday, config, caps, freezeDate) {
  await weeksDb.upsertConfig(monday, config, caps, freezeDate);
  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { status: 'ok' };
}

module.exports = { getWeek, addSignups, removeSignup, setWeekConfig };
