// Nickname map from GROUPME_NICKNAME_MAP env var, imported into the DB.
// Entries without a known sender_id use a placeholder; resolveNickname
// backfills the real sender_id on first message from that user.
const NICKNAME_MAP = {
  "African AIDS": "Huntley Masterson",
  "Avery Pratt": "Avery Pratt",
  "Ben Fitzpayne": "Ben Fitzpayne",
  "Ben Seklir": "Ben Seklir",
  "Benjew Brenner": "Benji Brenner",
  "Blick Bantersin": "Nick Jacobsson",
  "Blinsky": "Sasha Minsky",
  "cAlan Farnum": "Calan Scherer",
  "Carlo Vellandi": "Carlo Vellandi",
  "Certified Zammelier": "Andy Weissman",
  "Chairman Zhao": "Andrew Zhao",
  "Chase McCann": "Chase McCann",
  "Coby Hayes": "Coby Hayes",
  "Cut Man Miller": "Cam Miller",
  "Darious Hanson": "Darious Hanson",
  "Deng Xiaobong": "Kendall Carll",
  "Derek Thompson": "Derek Thompson",
  "deutchland": "Jackson Deutch",
  "DJN": "Dylan Jin-Ngo",
  "Doug": "Dominic Brancel",
  "Dre'Shon": "Dre'Shon Jackson",
  "Edward Fingerman": "Dylan Fingersh",
  "F": "Femi Ositade",
  "Garner Currie": "Garner Currie",
  "Good Will Banting": "EJ Barthelemy",
  "gshueh": "Grant Shueh",
  "Guido Nudie-leoni": "Chaelon Simpson",
  "Harrison Strom": "Harrison Strom",
  "Henry Zhou": "Henry Zhou",
  "Hoo Lee Sheet": "Luke Sonson",
  "Hudson Allain": "Hudson Allain",
  "Hudson Brown": "Hudson Brown",
  "Jacari Dillard": "Jacari Dillard",
  "Jack Lopez": "Jack Lopez",
  "Jackson Henehan": "Jackson Henehan",
  "Jacob Gokongwei": "Jacob Gokongwei",
  "Jafloko": "Jacobo Alvarez-Martinez",
  "Jap and Knees": "Nick Torres",
  "Jared Maznik": "Wyatt Wiggins",
  "Jason Coreas": "Jason Coreas",
  "Johnnie Walker's Bitch": "Brian Thomas",
  "Jung": "Ryan Jung",
  "Kim Jong Un": "Jacob Kwon",
  "Kylan Bantson": "Kylan Benson",
  "Kyler Rno": "Kyler Rno",
  "Lil' Billy": "Will Burns",
  "Lukas Peabody": "Lukas Peabody",
  "Marlowe": "Cooper McCann",
  "Master Chief-fu": "Laszlo Somlay",
  "Master Stewgway": "Nai Hola",
  "Matthew Morden": "Matthew Morden",
  "Matthew Thompson": "Matthew Thompson",
  "Maxwell Lu": "Maxwell Lu",
  "Michael Savadove": "Michael Savadove",
  "Mofocka": "Manuel Fernandez",
  "Mudbaby Stew": "Joey Perriello",
  "Mumbai Malaria": "Jack Burghardt",
  "Nihaal Rana": "Nihaal Rana",
  "Nik Zappia": "Nik Zappia",
  "Owen Guest": "Owen Guest",
  "Owen Umansky": "Owen Umansky",
  "RJ LinkedIn": "RJ Lichten",
  "Robby Meek": "Robby Meek",
  "Roy Han": "Roy Han",
  "saav-an-dih": "Saavan Shah",
  "Samip Phuyal": "Samip Phuyal",
  "Sluté": "Elias Soulé",
  "Spedward Tuckerman": "Edwin Ryerson",
  "Stewaño": "Chris Ruaño",
  "Stewermann": "Charlie Scheuermann",
  "Stewsgonewild": "Tanner Furtak",
  "Sum Ting Wong": "Matthew Zhang",
  "Thomas O'Brien": "Thomas O'Brien",
  "Toasty": "Jake Tsotadze",
  "The King of Beers": "Matt Hallman",
  "Wooly": "Owen Woolbert",
  "9 linden homeless dude": "Jared Maznik",
  "nb": "Nathaniel Berkman",
  "The Deutch Files": "Jackson Deutch"
};

exports.up = async function (knex) {
  // Allow sender_id to be nullable for imported entries that don't have one yet
  await knex.schema.alterTable('groupme_nicknames', (t) => {
    t.string('sender_id').nullable().alter();
  });

  // Drop the unique constraint on sender_id so null placeholders don't conflict,
  // then re-add it as a partial unique index (only non-null values)
  await knex.raw('ALTER TABLE groupme_nicknames DROP CONSTRAINT IF EXISTS groupme_nicknames_sender_id_unique');
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS groupme_nicknames_sender_id_unique ON groupme_nicknames (sender_id) WHERE sender_id IS NOT NULL');

  // Add unique index on lowercase nickname for lookup
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS groupme_nicknames_nickname_lower_unique ON groupme_nicknames (LOWER(nickname))');

  // Insert entries that don't already exist (by nickname, case-insensitive)
  for (const [nickname, realName] of Object.entries(NICKNAME_MAP)) {
    const existing = await knex('groupme_nicknames')
      .whereRaw('LOWER(nickname) = ?', [nickname.toLowerCase()])
      .first();
    if (!existing) {
      await knex('groupme_nicknames').insert({
        sender_id: null,
        nickname,
        real_name: realName
      });
    }
  }
};

exports.down = async function (knex) {
  // Remove seeded entries (those without a sender_id)
  await knex('groupme_nicknames').whereNull('sender_id').del();

  // Drop the nickname index
  await knex.raw('DROP INDEX IF EXISTS groupme_nicknames_nickname_lower_unique');

  // Restore the original unique constraint
  await knex.raw('DROP INDEX IF EXISTS groupme_nicknames_sender_id_unique');
  await knex.schema.alterTable('groupme_nicknames', (t) => {
    t.string('sender_id').notNullable().unique().alter();
  });
};
