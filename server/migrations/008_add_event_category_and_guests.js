// Event type (social, formal, sports, trip, other) and per-person guest allowance.
//
// Event guests move to a new jsonb array column, event_signups.guest_list, so a
// guest name containing a comma stays one guest. The old free-text `guests`
// column is left in place (expand-only): the previous release keeps reading and
// writing it while this deploy rolls out, and rolling back loses nothing.

const PLACEHOLDER = /^(none|n\/?a|na|no|nope|nobody|no guests?|-+|0|\.)$/i;

// Legacy free text: "John Smith, Jane Doe", "none", "2", "+1", ...
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

exports.up = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('category').notNullable().defaultTo('');
    t.integer('max_guests').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('event_signups', (t) => {
    t.jsonb('guest_list').notNullable().defaultTo('[]');
  });

  const rows = await knex('event_signups').select('id', 'guests').whereNot('guests', '');
  let withGuests = 0;
  for (const row of rows) {
    const list = parseLegacyGuests(row.guests);
    if (!list.length) continue;
    withGuests++;
    await knex('event_signups').where('id', row.id).update({ guest_list: JSON.stringify(list) });
  }

  // Guests now take seats, so legacy guest entries start counting toward capacity
  console.log('008: event signups with legacy guest text: ' + rows.length + ' (' + withGuests + ' now count as guests)');
};

exports.down = async function (knex) {
  await knex.schema.alterTable('event_signups', (t) => {
    t.dropColumn('guest_list');
  });
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('category');
    t.dropColumn('max_guests');
  });
};
