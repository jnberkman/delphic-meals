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
 * Port of getTimeLabel() from Code.gs:1038-1041.
 */
function getTimeLabel(meal) {
  if (meal === 'Dinner') return '7:30 PM';
  if (meal === 'Brunch') return '12:00 PM';
  return '12:00-1:00 PM / 1:00-2:00 PM';
}

/**
 * Port of getTimeSlotsForMeal() from Code.gs:1043-1046.
 */
function getTimeSlotsForMeal(meal) {
  if (meal === 'Dinner') return ['7:30 PM'];
  if (meal === 'Brunch') return ['12:00 PM'];
  return ['12:00 PM', '1:00 PM'];
}

module.exports = { normalizeTime, getTimeLabel, getTimeSlotsForMeal };
