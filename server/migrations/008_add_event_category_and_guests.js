// Event type (social, formal, sports, trip, other) and per-person guest allowance.
exports.up = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('category').notNullable().defaultTo('');
    t.integer('max_guests').notNullable().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('category');
    t.dropColumn('max_guests');
  });
};
