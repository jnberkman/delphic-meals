/**
 * Unit tests for WeekDraft transitions (Slice 1).
 * Run: node scripts/test-week-draft.js
 */
'use strict';

const { WeekDraft } = require('../public/js/week-draft.js');

let passed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  passed++;
}

function fresh() {
  return new WeekDraft();
}

// select / deselect / focus
{
  const d = fresh();
  d.select(1);
  d.select(3);
  assert(d.selectedDays.has(1) && d.focusedDay === 3 && d.isDirty(), 'select marks dirty and focuses');
  d.focus(1);
  assert(d.focusedDay === 1 && d.selectedDays.size === 2, 'focus does not deselect');
  d.deselectLocal(1);
  assert(!d.selectedDays.has(1) && d.focusedDay === 3, 'deselectLocal refocuses to remaining');
}

// hydrate skips pending cancel; note preserve flag
{
  const d = fresh();
  d.beginRemove('2026-09-15', 0, 'Ada', '12:00 PM');
  d.hydrateFromServer({
    config: [{ enabled: true }, { enabled: true }],
    signups: {
      0: [{ name: 'Ada', time: '12:00 PM', allergies: 'nuts' }],
      1: [{ name: 'Ada', time: '1:00 PM' }] // allergies stripped
    },
    myName: 'ada',
    normalizeGuests: function (g) { return g || []; },
    extractAccommodations: function (a) { return a || ''; }
  });
  assert(!d.selectedDays.has(0), 'hydrate skips pending-cancel day');
  assert(d.selectedDays.has(1), 'hydrate selects other signed day');
  assert(d.dayOptions[1]._preserveAllergies === true, 'stripped allergies → preserve flag');
  assert(d.dayOptions[1].accommodations === '', 'stripped allergies → empty accom');
}

// restorePendingCancel is the single undo owner (toast + re-tap)
{
  const d = fresh();
  d.select(2);
  d.selectedTimes[2] = '7:30 PM';
  d.dayOptions[2] = { early: true, accommodations: 'no cheese' };
  d.beginRemove('2026-09-15', 2, 'Ada', '7:30 PM');
  assert(!d.selectedDays.has(2) && d.hasPendingCancel(2), 'beginRemove clears selection');
  assert(d.restorePendingCancel(2) === true, 'restore returns true');
  assert(d.selectedDays.has(2) && d.focusedDay === 2, 'restore reselects + focuses');
  assert(d.selectedTimes[2] === '7:30 PM' && d.dayOptions[2].early === true, 'restore keeps times/opts');
  assert(d.restorePendingCancel(2) === false, 'second restore is no-op');
}

// multi-cancel safe: clear one does not abort sibling
{
  const d = fresh();
  d.beginRemove('2026-09-15', 0, 'A', '12:00 PM');
  d.beginRemove('2026-09-15', 1, 'A', '1:00 PM');
  assert(d.pendingCancelCount() === 2, 'two pending');
  d.clearPendingCancel(0);
  assert(d.pendingCancelCount() === 1 && d.hasPendingCancel(1), 'sibling remains');
}

// dirty draft survives snapshot across "tab refetch"
{
  const d = fresh();
  d.select(4);
  d.ensureDayOptions(4).accommodations = 'extra rice';
  const snap = d.snapshot();
  d.clearSelection();
  d.clearDirty();
  assert(!d.isDirty() && d.selectedDays.size === 0, 'cleared');
  d.restore(snap);
  assert(d.isDirty() && d.selectedDays.has(4) && d.dayOptions[4].accommodations === 'extra rice', 'dirty draft restored');
}

// pruneStaleCancels keeps same-week only
{
  const d = fresh();
  d.beginRemove('2026-09-08', 0, 'A', '12:00 PM');
  d.beginRemove('2026-09-15', 1, 'A', '1:00 PM');
  d.pruneStaleCancels('2026-09-15');
  assert(!d.hasPendingCancel(0) && d.hasPendingCancel(1), 'stale pruned');
}

// dropClosedUnsigned
{
  const d = fresh();
  d.select(0);
  d.select(1);
  d.dropClosedUnsigned(
    function (i) { return i === 1; }, // only day 1 is signed
    function () { return false; }     // nothing open
  );
  assert(!d.selectedDays.has(0) && d.selectedDays.has(1), 'unsigned closed dropped; signed kept');
}

console.log('OK — ' + passed + ' WeekDraft assertions passed');
