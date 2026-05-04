function parseLegacyGuestNotes(notes) {
  if (!notes || !/guests\s*:/i.test(notes)) {
    return { guests: [], notes };
  }

  const guests = [];
  const keep = [];
  const parts = String(notes).split(/\s*;\s*/);

  for (const part of parts) {
    const match = part.match(/^Guests\s*:\s*(.+)$/i);
    if (!match) {
      if (part.trim()) keep.push(part.trim());
      continue;
    }

    match[1]
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
      .forEach(name => guests.push(name));
  }

  return { guests, notes: keep.join('; ') };
}

exports.up = async function (knex) {
  await knex.schema.alterTable('signups', (t) => {
    t.jsonb('guests').notNullable().defaultTo('[]');
  });

  const rows = await knex('signups')
    .select('id', 'notes')
    .whereRaw("notes ~* '(^|;)\\s*guests\\s*:'");

  for (const row of rows) {
    const parsed = parseLegacyGuestNotes(row.notes || '');
    if (parsed.guests.length === 0) continue;
    await knex('signups').where('id', row.id).update({
      guests: JSON.stringify(parsed.guests),
      notes: parsed.notes
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('signups', (t) => {
    t.dropColumn('guests');
  });
};
