/**
 * Normalize time values to a consistent format (e.g. "12:00 PM", "1:00 PM", "7:30 PM").
 * Handles Date objects, ISO strings, Sheets date serials, and plain time strings.
 * Port of normalizeTime() from Code.gs:974-985.
 */
function normalizeTime(val) {
  if (!val) return '';
  if (val instanceof Date || (typeof val === 'string' && (val.indexOf('1899') !== -1 || val.indexOf('GMT') !== -1))) {
    try {
      const d = new Date(val);
      let h = d.getHours();
      const m = d.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return hr + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    } catch (e) { /* fall through */ }
  }
  return val.toString();
}

/**
 * Lunch time slots. `time` is the value stored on signups, `cap` the key in
 * week_configs.caps, `label` the chef-sheet display. Keep in sync with
 * LUNCH_SLOTS in index.html.
 */
const LUNCH_SLOTS = [
  { time: '11:30 AM', cap: 'slot1130', label: '11:30 AM-12:00 PM' },
  { time: '12:00 PM', cap: 'slot12',   label: '12:00-12:30 PM' },
  { time: '12:30 PM', cap: 'slot1230', label: '12:30-1:00 PM' },
  { time: '1:00 PM',  cap: 'slot1',    label: '1:00-1:30 PM' },
  { time: '1:30 PM',  cap: 'slot130',  label: '1:30-2:00 PM' }
];

function getLunchSlot(time) {
  return LUNCH_SLOTS.find(s => s.time === time) || null;
}

/**
 * Port of getTimeLabel() from Code.gs:1038-1041.
 */
function getTimeLabel(meal) {
  if (meal === 'Dinner') return '7:30 PM';
  if (meal === 'Brunch') return '12:00 PM';
  return '11:30 AM-2:00 PM';
}

/**
 * Port of getTimeSlotsForMeal() from Code.gs:1043-1046.
 */
function getTimeSlotsForMeal(meal) {
  if (meal === 'Dinner') return ['7:30 PM'];
  if (meal === 'Brunch') return ['12:00 PM'];
  return LUNCH_SLOTS.map(s => s.time);
}

// Today's date (YYYY-MM-DD) in America/New_York
function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

module.exports = { normalizeTime, getTimeLabel, getTimeSlotsForMeal, LUNCH_SLOTS, getLunchSlot, todayET };
