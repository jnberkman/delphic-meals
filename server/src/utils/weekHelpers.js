const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_MEALS = ['Lunch', 'Lunch', 'Lunch', 'Dinner', 'Lunch'];

const CATEGORIES = [
  'No Dietary Restrictions', 'Vegan', 'Vegetarian',
  'Gluten-Free', 'Allergies', 'No Pork', 'No Beef'
];

const CAT_COLORS = {
  'No Dietary Restrictions': { font: '#000000', bg: null },
  'Vegan':                   { font: '#2E7D32', bg: '#E8F5E9' },
  'Vegetarian':              { font: '#558B2F', bg: '#F1F8E9' },
  'Gluten-Free':             { font: '#E65100', bg: '#FFF3E0' },
  'Allergies':               { font: '#B71C1C', bg: '#FFEBEE' },
  'No Pork':                 { font: '#4A148C', bg: '#F3E5F5' },
  'No Beef':                 { font: '#4A148C', bg: '#F3E5F5' }
};

const DEFAULT_CAPS = { slot12: 50, slot1: 50, dinner: 50 };

/**
 * Build the default week config for a given Monday date string.
 * Port of buildDefaultConfig() from Code.gs:1196-1206.
 */
function buildDefaultConfig(monday) {
  const md = new Date(monday + 'T12:00:00');
  return DAYS.map((name, i) => {
    const d = new Date(md.getTime());
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      date: `${yyyy}-${mm}-${dd}`,
      day: name,
      meal: DEFAULT_MEALS[i],
      menu: '',
      enabled: true
    };
  });
}

module.exports = { DAYS, DEFAULT_MEALS, CATEGORIES, CAT_COLORS, DEFAULT_CAPS, buildDefaultConfig };
