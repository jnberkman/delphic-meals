'use strict';

const { DAYS } = require('./weekHelpers');

/**
 * Meal sign-ups for a week close at its freeze instant. By default that is
 * 2:00 PM America/New_York on the Friday before the week's Monday. An admin
 * moves it by saving `freezeDate` as an Eastern wall time, `YYYY-MM-DDTHH:mm`
 * (what the admin datetime-local picker produces). Blank means the default.
 * A far-future time keeps the week open.
 *
 *   const freeze = mealFreeze.forWeek(monday, weekCfg); // row, or null
 *   freeze.at            // Date, the effective cutoff
 *   freeze.override      // '' or the stored wall time
 *   freeze.closedReason(dayIndex, actor, now) // null = allowed, else a sentence
 *   mealFreeze.checkOverride(raw)             // null = storable, else an error
 *
 * Spot-up and claim transfer an existing seat and do not call this module.
 */

const ZONE = 'America/New_York';
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const MONDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const easternParts = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

const easternLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

function wallOf(ms) {
  const parts = {};
  for (const { type, value } of easternParts.formatToParts(ms)) {
    if (type !== 'literal') parts[type] = value;
  }
  let hour = +parts.hour;
  if (hour === 24) hour = 0;
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour,
    minute: +parts.minute,
    second: +parts.second
  };
}

function offsetMinutes(ms) {
  const wall = wallOf(ms);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return (asUtc - Math.floor(ms / 1000) * 1000) / 60000;
}

function wallToInstant(wall) {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = asUtc - offsetMinutes(asUtc) * 60000;
  const second = asUtc - offsetMinutes(first) * 60000;
  if (first === second) return new Date(first);
  const got = wallOf(second);
  const same = got.year === wall.year && got.month === wall.month && got.day === wall.day
    && got.hour === wall.hour && got.minute === wall.minute;
  return new Date(same ? second : Math.max(first, second));
}

function parseWall(raw) {
  if (typeof raw !== 'string') return null;
  const match = WALL_RE.exec(raw.trim());
  if (!match) return null;
  const wall = {
    year: +match[1],
    month: +match[2],
    day: +match[3],
    hour: +match[4],
    minute: +match[5]
  };
  if (wall.hour > 23 || wall.minute > 59) return null;
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute));
  if (probe.getUTCFullYear() !== wall.year || probe.getUTCMonth() + 1 !== wall.month
    || probe.getUTCDate() !== wall.day || probe.getUTCHours() !== wall.hour
    || probe.getUTCMinutes() !== wall.minute) {
    return null;
  }
  return wall;
}

function defaultFreeze(monday) {
  const match = typeof monday === 'string' ? MONDAY_RE.exec(monday) : null;
  if (!match) throw new RangeError('monday must be YYYY-MM-DD');
  const year = +match[1];
  const month = +match[2];
  const day = +match[3];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) {
    throw new RangeError('monday must be a real calendar date');
  }
  const friday = new Date(Date.UTC(year, month - 1, day - 3));
  return wallToInstant({
    year: friday.getUTCFullYear(),
    month: friday.getUTCMonth() + 1,
    day: friday.getUTCDate(),
    hour: 14,
    minute: 0
  });
}

function formatEastern(at) {
  return easternLabel.format(at) + ' ET';
}

function forWeek(monday, weekCfg) {
  const override = (weekCfg && weekCfg.freeze_date) || '';
  const wall = override ? parseWall(override) : null;
  const at = wall ? wallToInstant(wall) : defaultFreeze(monday);
  const days = Array.isArray(weekCfg && weekCfg.config)
    ? weekCfg.config
    : DAYS.map(day => ({ day, enabled: true }));

  function closedReason(dayIndex, actor, now) {
    if (actor && actor.isAdmin === true) return null;
    const index = Number(dayIndex);
    const day = Number.isInteger(index) ? days[index] : undefined;
    if (!day) return 'That day is not part of this week';
    const name = day.day || DAYS[index];
    if (day.enabled === false) return 'There is no meal on ' + name;
    if (now < at.getTime()) return null;
    if (day.reopenSignups === true) return null;
    return 'Sign-ups for ' + name + ' closed ' + formatEastern(at);
  }

  return { at, override, closedReason };
}

function checkOverride(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string' && parseWall(raw)) return null;
  return 'Freeze time must be an Eastern date and time like 2026-10-23T14:00, or blank for the Friday 2 PM default';
}

module.exports = { forWeek, checkOverride };
