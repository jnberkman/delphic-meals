// The seeded nickname map had "Jared Maznik" → "Wyatt Wiggins", so Jared's
// GroupMe claims were recorded under Wyatt's name. resolveNickname may have
// already backfilled a sender_id onto that row, so match on nickname alone.
exports.up = async function (knex) {
  await knex('groupme_nicknames')
    .whereRaw('LOWER(nickname) = ?', ['jared maznik'])
    .where('real_name', 'Wyatt Wiggins')
    .update({ real_name: 'Jared Maznik' });
};

exports.down = async function (knex) {
  await knex('groupme_nicknames')
    .whereRaw('LOWER(nickname) = ?', ['jared maznik'])
    .where('real_name', 'Jared Maznik')
    .update({ real_name: 'Wyatt Wiggins' });
};
