// Event type (social, formal, sports, trip, other) and per-person guest allowance,
// plus two event_signups columns:
//   guest_list  jsonb array of guest names, so a name containing a comma stays one guest
//   signer      who made the signup ('google:<email>' or 'guest:<browser id>'), so only
//               they or an admin can change it. NULL for signups made before this.
//
// Expand-only: the old free-text `guests` column stays (and is still written), so the
// previous release keeps working while this deploy rolls out, and rollback is lossless.
const { parseLegacyGuests } = require('../src/utils/guests');

exports.up = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('category').notNullable().defaultTo('');
    t.integer('max_guests').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('event_signups', (t) => {
    t.jsonb('guest_list').notNullable().defaultTo('[]');
    t.text('signer');
  });

  // Only "going" signups bring guests; interest never takes a seat
  const rows = await knex('event_signups').select('id', 'guests').whereNot('guests', '').whereNot('ink_type', 'interest');
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
    t.dropColumn('signer');
  });
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('category');
    t.dropColumn('max_guests');
  });
};
