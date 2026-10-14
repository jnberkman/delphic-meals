// Event guest lists. event_signups.guest_list is a JSON array of names.

const PLACEHOLDER = /^(none|n\/?a|na|no|nope|nobody|no guests?|-+|0|\.)$/i;

// A guest list from a request or the database. Arrays are kept as-is (so a name
// may contain a comma); strings come from older clients and are comma-separated.
function parseGuestList(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      const parsed = JSON.parse(list);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {}
  }
  if (typeof list === 'string') list = list.split(',');
  if (!Array.isArray(list)) return [];
  return list.map(g => String(g == null ? '' : g).trim()).filter(Boolean);
}

// Free text typed into the old Events tab or the Sheets import:
// "John Smith, Jane Doe", "none", "2", "+1", ...
function parseLegacyGuests(text) {
  const raw = String(text || '').trim();
  if (!raw || PLACEHOLDER.test(raw)) return [];
  const count = raw.match(/^\+?(\d{1,2})$/);
  if (count) {
    const n = Math.min(parseInt(count[1], 10), 10);
    return Array.from({ length: n }, (_, i) => n === 1 ? 'Guest' : 'Guest ' + (i + 1));
  }
  return raw.split(',').map(g => g.trim()).filter(g => g && !PLACEHOLDER.test(g));
}

module.exports = { parseGuestList, parseLegacyGuests };
