// No lunch Monday 2026-10-12 (Indigenous Peoples' Day / Columbus Day — no classes).
const { buildDefaultConfig, DEFAULT_CAPS } = require('../src/utils/weekHelpers');

const MONDAY = '2026-10-12';
const DAY_INDEX = 0;
const NOTE = "No lunch — Indigenous Peoples' Day";

exports.up = async function (knex) {
  const existing = await knex('week_configs').where('monday', MONDAY).first();
  const config = existing ? existing.config : buildDefaultConfig(MONDAY);
  config[DAY_INDEX] = { ...config[DAY_INDEX], enabled: false, menu: NOTE };

  if (existing) {
    await knex('week_configs').where('monday', MONDAY).update({ config: JSON.stringify(config) });
  } else {
    // Week not configured yet — carry over caps from the latest configured week
    const prev = await knex('week_configs').where('monday', '<', MONDAY).orderBy('monday', 'desc').first();
    await knex('week_configs').insert({
      monday: MONDAY,
      config: JSON.stringify(config),
      caps: JSON.stringify(prev ? prev.caps : DEFAULT_CAPS),
      freeze_date: ''
    });
  }
};

exports.down = async function (knex) {
  const existing = await knex('week_configs').where('monday', MONDAY).first();
  if (!existing) return;
  const config = existing.config;
  config[DAY_INDEX] = { ...config[DAY_INDEX], enabled: true, menu: '' };
  await knex('week_configs').where('monday', MONDAY).update({ config: JSON.stringify(config) });
};
