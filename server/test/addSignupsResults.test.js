'use strict';

// addSignups reports what happened to each entry so the page confirms only saved days.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function stub(rel, exports) {
  const file = require.resolve(path.join('../src', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const rows = [];
stub('db/queries/weeks', {
  getConfig: async () => ({
    // Far-future override keeps the week open
    freeze_date: '2099-01-01T00:00',
    config: [
      { day: 'Monday', enabled: true },
      { day: 'Tuesday', enabled: true },
      { day: 'Wednesday', enabled: true }
    ],
    caps: { slot12: 1 }
  }),
  upsertConfig: async () => {}
});
stub('db/queries/signups', {
  findSignupByDayAndName: async (m, d, n) => rows.find(r => r.day_index === d && r.name === n) || null,
  countPartyByTime: async (m, d, t, excludeId) => rows.filter(r => r.day_index === d && r.id !== excludeId).length,
  deleteByDayAndName: async (m, d, n) => {
    const i = rows.findIndex(r => r.day_index === d && r.name === n);
    if (i < 0) return 0;
    rows.splice(i, 1);
    return 1;
  },
  insert: async row => { rows.push({ ...row, id: rows.length + 100 }); }
});
stub('services/sheetsSync', { syncWeek: async () => {} });

const { addSignups } = require('../src/handlers/meals');

test('addSignups returns a status for each entry', async () => {
  rows.push({ id: 1, day_index: 0, name: 'Ada' });   // Ada already has Monday
  rows.push({ id: 2, day_index: 1, name: 'Grace' }); // Tuesday is full (cap 1)
  const entry = (dayIndex, extra) => ({ dayIndex, name: 'Ada', time: '12:00 PM', ...extra });
  const result = await addSignups('2026-11-16', [
    entry(0),
    entry(1),
    entry(2, { guests: ['A', 'B'] })
  ], { slot12: 1, guestLimitPerSignup: 1 }, null);

  assert.deepEqual(result.results, [
    { dayIndex: 0, status: 'updated' },
    { dayIndex: 1, status: 'full' },
    { dayIndex: 2, status: 'guestLimit' }
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.full, 1);
  assert.equal(result.guestLimit, 1);
});

test('an edit keeps saved diet, allergies and notes it leaves out, and clears ones sent blank', async () => {
  rows.length = 0;
  rows.push({ id: 7, day_index: 2, name: 'Ada', diet: 'Vegan', allergies: 'no cheese', notes: 'window seat' });
  await addSignups('2026-11-16', [{ dayIndex: 2, name: 'Ada', time: '12:00 PM' }], { slot12: 5 }, null);
  let saved = rows.find(r => r.day_index === 2 && r.name === 'Ada');
  assert.equal(saved.diet, 'Vegan');
  assert.equal(saved.allergies, 'no cheese');
  assert.equal(saved.notes, 'window seat');

  await addSignups('2026-11-16', [{ dayIndex: 2, name: 'Ada', time: '12:00 PM', allergies: '', notes: '' }], { slot12: 5 }, null);
  saved = rows.find(r => r.day_index === 2 && r.name === 'Ada');
  assert.equal(saved.allergies, '');
  assert.equal(saved.notes, '');
  assert.equal(saved.diet, 'Vegan');
});
