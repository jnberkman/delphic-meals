exports.up = async function (knex) {
  await knex.schema.createTable('groupme_nicknames', (t) => {
    t.increments('id').primary();
    t.string('sender_id').notNullable().unique();
    t.string('nickname').notNullable();
    t.string('real_name').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('groupme_nicknames');
};
