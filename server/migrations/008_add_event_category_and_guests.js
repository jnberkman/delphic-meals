// Event type (social, formal, sports, trip, other) and per-person guest allowance.
// Also stores event_signups.guests as a JSON array of names (like signups.guests),
// so a guest name containing a comma stays one guest.
exports.up = async function (knex) {
  await knex.schema.alterTable('events', (t) => {
    t.text('category').notNullable().defaultTo('');
    t.integer('max_guests').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('event_signups', (t) => {
    t.jsonb('guests_list').notNullable().defaultTo('[]');
  });

  // Legacy rows hold free text like "John Smith, Jane Doe"
  const rows = await knex('event_signups').select('id', 'guests').whereNot('guests', '');
  for (const row of rows) {
    const list = String(row.guests).split(',').map(g => g.trim()).filter(Boolean);
    await knex('event_signups').where('id', row.id).update({ guests_list: JSON.stringify(list) });
  }

  await knex.schema.alterTable('event_signups', (t) => {
    t.dropColumn('guests');
  });
  await knex.schema.alterTable('event_signups', (t) => {
    t.renameColumn('guests_list', 'guests');
  });

  // Guests now take seats, so legacy guest entries start counting toward capacity
  console.log('008: event signups with legacy guest text: ' + rows.length);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('event_signups', (t) => {
    t.text('guests_text').notNullable().defaultTo('');
  });

  const rows = await knex('event_signups').select('id', 'guests');
  for (const row of rows) {
    const list = Array.isArray(row.guests) ? row.guests : [];
    if (list.length) await knex('event_signups').where('id', row.id).update({ guests_text: list.join(', ') });
  }

  await knex.schema.alterTable('event_signups', (t) => {
    t.dropColumn('guests');
  });
  await knex.schema.alterTable('event_signups', (t) => {
    t.renameColumn('guests_text', 'guests');
  });

  await knex.schema.alterTable('events', (t) => {
    t.dropColumn('category');
    t.dropColumn('max_guests');
  });
};
