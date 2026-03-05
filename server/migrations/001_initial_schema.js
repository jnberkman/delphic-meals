exports.up = function (knex) {
  return knex.schema

    // Members
    .createTable('members', (t) => {
      t.increments('id').primary();
      t.text('email').notNullable().unique();
      t.text('name').notNullable().defaultTo('');
      t.boolean('is_admin').notNullable().defaultTo(false);
      t.boolean('notify_email').notNullable().defaultTo(false);
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    })
    .raw('CREATE INDEX idx_members_email ON members (LOWER(email))')

    // Settings (key-value)
    .createTable('settings', (t) => {
      t.text('key').primary();
      t.text('value').notNullable();
    })
    .raw("INSERT INTO settings (key, value) VALUES ('openAccess', 'false'), ('spotUpEnabled', 'true')")

    // Access requests
    .createTable('access_requests', (t) => {
      t.increments('id').primary();
      t.text('email').notNullable();
      t.text('name').notNullable().defaultTo('');
      t.timestamp('requested_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.text('status').notNullable().defaultTo('pending');
    })
    .raw("ALTER TABLE access_requests ADD CONSTRAINT chk_ar_status CHECK (status IN ('pending', 'approved', 'denied'))")
    .raw('CREATE INDEX idx_access_requests_status ON access_requests (status)')
    .raw('CREATE INDEX idx_access_requests_email ON access_requests (LOWER(email))')

    // Week configs
    .createTable('week_configs', (t) => {
      t.date('monday').primary();
      t.jsonb('config').notNullable().defaultTo('[]');
      t.jsonb('caps').notNullable().defaultTo('{"slot12":50,"slot1":50,"dinner":50}');
      t.text('freeze_date').notNullable().defaultTo('');
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    })

    // Signups
    .createTable('signups', (t) => {
      t.increments('id').primary();
      t.date('monday').notNullable();
      t.smallint('day_index').notNullable();
      t.text('name').notNullable();
      t.text('diet').notNullable().defaultTo('No Dietary Restrictions');
      t.text('allergies').notNullable().defaultTo('');
      t.text('time').notNullable().defaultTo('');
      t.boolean('early').notNullable().defaultTo(false);
      t.text('notes').notNullable().defaultTo('');
      t.timestamp('timestamp', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.boolean('grad_gasman').notNullable().defaultTo(false);
      t.text('spot_up_status').notNullable().defaultTo('');
      t.text('spot_up_orig_name').notNullable().defaultTo('');
      t.text('spot_up_claimed_by').notNullable().defaultTo('');
      t.text('served_status').notNullable().defaultTo('');
    })
    .raw("ALTER TABLE signups ADD CONSTRAINT chk_day_index CHECK (day_index BETWEEN 0 AND 4)")
    .raw("ALTER TABLE signups ADD CONSTRAINT chk_spot_up_status CHECK (spot_up_status IN ('', 'spotup', 'claimed'))")
    .raw("ALTER TABLE signups ADD CONSTRAINT chk_served_status CHECK (served_status IN ('', 'served'))")
    .raw('CREATE INDEX idx_signups_monday ON signups (monday)')
    .raw('CREATE INDEX idx_signups_monday_day ON signups (monday, day_index)')
    .raw('CREATE INDEX idx_signups_name ON signups (LOWER(name), monday, day_index)')

    // Events
    .createTable('events', (t) => {
      t.text('event_id').primary();
      t.text('title').notNullable().defaultTo('');
      t.text('date').notNullable().defaultTo('');
      t.text('time').notNullable().defaultTo('');
      t.text('location').notNullable().defaultTo('');
      t.text('description').notNullable().defaultTo('');
      t.integer('capacity').notNullable().defaultTo(0);
      t.boolean('collect_grad_year').notNullable().defaultTo(false);
      t.boolean('collect_diet').notNullable().defaultTo(false);
      t.text('freeze_date').notNullable().defaultTo('');
      t.boolean('interest_only').notNullable().defaultTo(false);
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    })

    // Event signups
    .createTable('event_signups', (t) => {
      t.increments('id').primary();
      t.text('event_id').notNullable().references('event_id').inTable('events').onDelete('CASCADE');
      t.text('name').notNullable();
      t.text('grad_year').notNullable().defaultTo('');
      t.text('diet').notNullable().defaultTo('');
      t.text('allergies').notNullable().defaultTo('');
      t.text('notes').notNullable().defaultTo('');
      t.timestamp('timestamp', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.text('guests').notNullable().defaultTo('');
      t.text('ink_type').notNullable().defaultTo('ink');
    })
    .raw("ALTER TABLE event_signups ADD CONSTRAINT chk_ink_type CHECK (ink_type IN ('ink', 'interest'))")
    .raw('CREATE INDEX idx_event_signups_event ON event_signups (event_id)')
    .raw('CREATE UNIQUE INDEX idx_event_signups_unique ON event_signups (event_id, LOWER(name))')

    // Claim tokens
    .createTable('claim_tokens', (t) => {
      t.uuid('token').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.date('monday').notNullable();
      t.smallint('day_idx').notNullable();
      t.text('orig_name').notNullable();
      t.text('time').notNullable();
      t.text('recipient_email').notNullable();
      t.boolean('used').notNullable().defaultTo(false);
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    })
    .raw('CREATE INDEX idx_claim_tokens_lookup ON claim_tokens (monday, day_idx, orig_name, time)');
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('claim_tokens')
    .dropTableIfExists('event_signups')
    .dropTableIfExists('events')
    .dropTableIfExists('signups')
    .dropTableIfExists('week_configs')
    .dropTableIfExists('access_requests')
    .dropTableIfExists('settings')
    .dropTableIfExists('members');
};
