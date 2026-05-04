const weeksDb = require('../db/queries/weeks');
const signupsDb = require('../db/queries/signups');
const { normalizeTime } = require('../utils/time');
const { buildDefaultConfig, DEFAULT_CAPS } = require('../utils/weekHelpers');
const sheetsSync = require('../services/sheetsSync');

function normalizeGuests(guests) {
  if (!guests) return [];
  if (typeof guests === 'string') {
    try {
      const parsed = JSON.parse(guests);
      if (Array.isArray(parsed)) guests = parsed;
    } catch (e) {}
  }
  const list = Array.isArray(guests)
    ? guests
    : String(guests).split(',');

  return list
    .map(name => String(name || '').trim())
    .filter(Boolean);
}

function getCapForEntry(weekCfg, caps, dayIdx, timeStr) {
  const day = weekCfg && weekCfg.config && weekCfg.config[dayIdx];
  const customSlot = day && Array.isArray(day.slots)
    ? day.slots.find(slot => normalizeTime(slot.time || slot) === timeStr)
    : null;
  if (customSlot && customSlot.cap != null && Number(customSlot.cap) > 0) {
    return Number(customSlot.cap);
  }

  const capSlot12 = caps.slot12 || weekCfg.caps.slot12 || 50;
  const capSlot1 = caps.slot1 || weekCfg.caps.slot1 || 50;
  const capDinner = caps.dinner || weekCfg.caps.dinner || 50;

  if (timeStr === '1:00 PM') return capSlot1;
  if (timeStr === '7:30 PM') return capDinner;
  return capSlot12;
}

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
      guests: normalizeGuests(row.guests),
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

  let added = 0, updated = 0, full = 0;

  for (const entry of entries) {
    const dayIdx = entry.dayIndex;
    const guests = normalizeGuests(entry.guests);
    const partySize = 1 + guests.length;

    // Check capacity
    const timeStr = normalizeTime(entry.time);
    const existing = await signupsDb.findSignupByDayAndName(monday, dayIdx, entry.name);
    const timeCount = await signupsDb.countPartyByTime(monday, dayIdx, timeStr, existing ? existing.id : null);
    const cap = getCapForEntry(weekCfg, caps, dayIdx, timeStr);

    if (timeCount + partySize > cap) { full++; continue; }

    // Delete existing signup for this name+day after capacity is known to be available.
    const deleted = await signupsDb.deleteByDayAndName(monday, dayIdx, entry.name);
    if (deleted > 0) updated++;

    await signupsDb.insert({
      monday,
      day_index: dayIdx,
      name: entry.name,
      diet: entry.diet || 'No Dietary Restrictions',
      allergies: entry.allergies || '',
      time: timeStr,
      early: entry.early || false,
      notes: entry.notes || '',
      guests: JSON.stringify(guests),
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

/**
 * Admin-only add of a single signup. Bypasses freeze date and capacity caps.
 * Used when an admin signs someone up on their behalf.
 */
async function adminAddSignup(monday, dayIndex, name, time) {
  if (!name || !String(name).trim()) {
    return { error: 'Name is required' };
  }

  let weekCfg = await weeksDb.getConfig(monday);
  if (!weekCfg) {
    const defaultCfg = buildDefaultConfig(monday);
    await weeksDb.upsertConfig(monday, defaultCfg, DEFAULT_CAPS, '');
    weekCfg = await weeksDb.getConfig(monday);
  }

  const cleanName = String(name).trim();
  const timeStr = normalizeTime(time);

  await signupsDb.deleteByDayAndName(monday, dayIndex, cleanName);

  await signupsDb.insert({
    monday,
    day_index: dayIndex,
    name: cleanName,
    diet: 'No Dietary Restrictions',
    allergies: '',
    time: timeStr,
    early: false,
    notes: '',
    grad_gasman: false
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { added: 1, name: cleanName };
}

module.exports = { getWeek, addSignups, removeSignup, setWeekConfig, adminAddSignup };
