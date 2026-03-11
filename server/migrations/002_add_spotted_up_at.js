exports.up = function (knex) {
  return knex.schema.alterTable('signups', (t) => {
    t.timestamp('spotted_up_at', { useTz: true }).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('signups', (t) => {
    t.dropColumn('spotted_up_at');
  });
};
