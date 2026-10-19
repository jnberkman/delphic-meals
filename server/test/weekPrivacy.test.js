'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentWeek } = require('../src/utils/weekView');
const { checkMember } = require('../src/handlers/members');

const loaded = {
  monday: '2026-10-26',
  config: [{ day: 'Monday', enabled: true }],
  caps: { slot12: 50 },
  freezeDate: '',
  freezeAt: '2026-10-23T18:00:00.000Z',
  signups: {
    0: [{
      name: 'Ada Lovelace',
      diet: 'Vegan',
      allergies: 'sesame',
      time: '12:00 PM',
      early: true,
      notes: 'window seat',
      guests: ['Grace Hopper'],
      timestamp: '2026-10-20T15:00:00.000Z',
      gradGasman: true,
      spotUpStatus: 'claimed',
      spotUpOrigName: 'Ada Lovelace',
      spotUpClaimedBy: 'Grace Hopper',
      servedStatus: ''
    }]
  }
};

test('an anonymous week has no names and keeps the freeze and the seat count', () => {
  const board = presentWeek(loaded, { roster: false, kitchen: false });
  const text = JSON.stringify(board);
  assert.equal(board.roster, false);
  assert.equal(board.freezeAt, loaded.freezeAt);
  assert.equal(board.signups, undefined);
  assert.equal(board.seats['0']['12:00 PM'], 2);
  assert.equal(text.includes('Ada Lovelace'), false);
  assert.equal(text.includes('Grace Hopper'), false);
  assert.equal(text.includes('sesame'), false);
  assert.equal(text.includes('window seat'), false);
});

test('a signed-in member gets names and not diet or allergies', () => {
  const roster = presentWeek(loaded, { roster: true, kitchen: false });
  assert.equal(roster.roster, true);
  assert.equal(roster.seats, undefined);
  assert.equal(roster.signups['0'][0].name, 'Ada Lovelace');
  assert.equal(roster.signups['0'][0].guests[0], 'Grace Hopper');
  assert.equal(roster.signups['0'][0].diet, undefined);
  assert.equal(roster.signups['0'][0].allergies, undefined);
});

test('an admin gets the roster including diet and allergies', () => {
  const roster = presentWeek(loaded, { roster: true, kitchen: true });
  assert.equal(roster.signups['0'][0].name, 'Ada Lovelace');
  assert.equal(roster.signups['0'][0].diet, 'Vegan');
  assert.equal(roster.signups['0'][0].allergies, 'sesame');
});

test('blank guest placeholders do not take a seat', () => {
  const board = presentWeek({
    monday: '2026-10-26',
    config: [],
    caps: {},
    freezeDate: '',
    freezeAt: '2026-10-23T18:00:00.000Z',
    signups: { 0: [{ name: 'Ada Lovelace', time: '12:00 PM', guests: ['', '  '] }] }
  }, { roster: false });
  assert.equal(board.seats['0']['12:00 PM'], 1);
  assert.equal(JSON.stringify(board).includes('Ada Lovelace'), false);
});
test('checkMember does not answer for a different email', async () => {
  const result = await checkMember('someone@club.org', 'Someone', '');
  assert.deepEqual(result, { authorized: false });
});
