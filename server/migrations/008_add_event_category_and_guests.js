// Event type (social, formal, sports, trip, other) and per-person guest allowance.
exports.up = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('category').notNullable().defaultTo('');
    t.integer('max_guests').notNullable().defaultTo(0);
  });

  // Guests now take seats. Old free-text guest entries will start counting toward
  // capacity, so log how many exist for a quick check in the deploy log.
  const [{ count }] = await knex('event_signups').whereNot('guests', '').count('* as count');
  console.log('008: event signups with legacy guest text: ' + count);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('category');
    t.dropColumn('max_guests');
  });
};
