'use strict';

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mealFreeze = require('../src/utils/mealFreeze');

const MEMBER = { isAdmin: false };
const ADMIN = { isAdmin: true };
const DAYS5 = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({ day, enabled: true }));

function at(monday, override) {
  const weekCfg = override ? { freeze_date: override, config: DAYS5 } : null;
  return mealFreeze.forWeek(monday, weekCfg).at.toISOString();
}

test('default freeze is Friday 2:00 PM America/New_York before the Monday', () => {
  assert.equal(at('2026-10-26'), '2026-10-23T18:00:00.000Z');
  assert.equal(at('2026-11-02'), '2026-10-30T18:00:00.000Z');
  assert.equal(at('2026-11-09'), '2026-11-06T19:00:00.000Z');
  assert.equal(at('2026-03-09'), '2026-03-06T19:00:00.000Z');
  assert.equal(at('2026-03-16'), '2026-03-13T18:00:00.000Z');
});

test('a blank week uses the default and echoes no override', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', null);
  assert.equal(freeze.override, '');
  assert.equal(freeze.at.toISOString(), '2026-10-23T18:00:00.000Z');
});

test('an Eastern wall-clock override is that instant, including the live Oct 17 value', () => {
  assert.equal(at('2026-10-19', '2026-10-17T09:19'), '2026-10-17T13:19:00.000Z');
});

test('an unparseable override falls back to the default and keeps the raw text', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: 'garbage', config: DAYS5 });
  assert.equal(freeze.at.toISOString(), '2026-10-23T18:00:00.000Z');
  assert.equal(freeze.override, 'garbage');
});

test('a malformed monday throws', () => {
  assert.throws(() => mealFreeze.forWeek('nope', null), RangeError);
});

test('a signup before the freeze is accepted and at the freeze is rejected', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: '', config: DAYS5 });
  assert.equal(freeze.closedReason(0, MEMBER, Date.parse('2026-10-23T17:59:59.999Z')), null);
  assert.equal(typeof freeze.closedReason(0, MEMBER, Date.parse('2026-10-23T18:00:00.000Z')), 'string');
  assert.equal(typeof freeze.closedReason(0, MEMBER, Date.parse('2026-10-24T15:00:00.000Z')), 'string');
});

test('an admin override later than the default reopens the week', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: '2026-10-30T14:00', config: DAYS5 });
  assert.equal(freeze.at.toISOString(), '2026-10-30T18:00:00.000Z');
  assert.equal(freeze.closedReason(0, MEMBER, Date.parse('2026-10-24T12:00:00.000Z')), null);
});

test('an earlier override closes the week before the default Friday', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: '2026-10-21T14:00', config: DAYS5 });
  assert.equal(typeof freeze.closedReason(0, MEMBER, Date.parse('2026-10-22T15:00:00.000Z')), 'string');
});

test('reopenSignups keeps one day open after the cutoff', () => {
  const config = DAYS5.map(day => ({ ...day }));
  config[2] = { ...config[2], reopenSignups: true };
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: '', config });
  const after = Date.parse('2026-10-24T15:00:00.000Z');
  assert.equal(typeof freeze.closedReason(0, MEMBER, after), 'string');
  assert.equal(freeze.closedReason(2, MEMBER, after), null);
});

test('a disabled day is closed before the cutoff, and an admin is not', () => {
  const config = DAYS5.map(day => ({ ...day }));
  config[0] = { ...config[0], enabled: false };
  const freeze = mealFreeze.forWeek('2026-10-26', { freeze_date: '', config });
  const before = Date.parse('2026-10-22T15:00:00.000Z');
  assert.equal(typeof freeze.closedReason(0, MEMBER, before), 'string');
  assert.equal(freeze.closedReason(0, ADMIN, Date.parse('2026-10-24T15:00:00.000Z')), null);
  assert.equal(freeze.closedReason(0, ADMIN, before), null);
});

test('a missing actor and a bad day index fail closed for members', () => {
  const freeze = mealFreeze.forWeek('2026-10-26', null);
  const before = Date.parse('2026-10-22T15:00:00.000Z');
  assert.equal(freeze.closedReason(0, undefined, before), null);
  assert.equal(typeof freeze.closedReason(7, MEMBER, before), 'string');
  assert.equal(typeof freeze.closedReason('x', undefined, before), 'string');
});

function listJs(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) listJs(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

test('every meal signup insert and delete calls the freeze gate', () => {
  const root = path.join(__dirname, '../src');
  const outside = [];
  for (const file of listJs(root, [])) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    const writes = /signupsDb\.(insert|deleteByDayAndName)\s*\(/.test(text)
      || /db\(['"]signups['"]\)[^;]{0,120}\.(insert|del)\s*\(/.test(text);
    if (!writes) continue;
    if (rel !== 'handlers/meals.js' && rel !== 'db/queries/signups.js') outside.push(rel);
  }
  assert.deepEqual(outside, []);

  const meals = fs.readFileSync(path.join(root, 'handlers/meals.js'), 'utf8');
  const missed = [];
  for (const part of meals.split(/\n(?=(?:async )?function )/)) {
    const name = part.match(/^(?:async )?function (\w+)/);
    if (!name) continue;
    if (!/signupsDb\.(insert|deleteByDayAndName)\s*\(/.test(part)) continue;
    if (!/\.closedReason\(/.test(part)) missed.push(name[1]);
  }
  assert.deepEqual(missed, []);
});

test('checkOverride accepts a blank or an Eastern wall time and rejects an absolute instant', () => {
  assert.equal(mealFreeze.checkOverride(''), null);
  assert.equal(mealFreeze.checkOverride(undefined), null);
  assert.equal(mealFreeze.checkOverride('2026-10-23T14:00'), null);
  assert.equal(mealFreeze.checkOverride('2026-10-23T14:00:00'), null);
  for (const bad of ['2026-10-23T18:00:00.000Z', '2026-02-30T14:00', 'tomorrow', 42]) {
    assert.equal(typeof mealFreeze.checkOverride(bad), 'string');
  }
});
