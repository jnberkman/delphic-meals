#!/usr/bin/env node

/**
 * One-time data migration script: reads existing Google Spreadsheet data
 * and inserts it into the PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *   GOOGLE_SERVICE_ACCOUNT_KEY=<base64-encoded-key> \
 *   GOOGLE_SPREADSHEET_ID=<spreadsheet-id> \
 *   node scripts/migrate-from-sheets.js
 *
 * This script is idempotent — it clears tables before inserting.
 * Run it once before switching the frontend to the new API.
 */

require('dotenv').config();
const { google } = require('googleapis');
const knex = require('knex')(require('../knexfile'));

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function main() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !SPREADSHEET_ID) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SPREADSHEET_ID');
    process.exit(1);
  }

  const keyJson = JSON.parse(Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString());
  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get all sheet names
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties.title' });
  const sheetNames = meta.data.sheets.map(s => s.properties.title);
  console.log('Found sheets:', sheetNames.join(', '));

  async function readSheet(name) {
    if (!sheetNames.includes(name)) return [];
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${name}!A:Z` });
    return resp.data.values || [];
  }

  // ── Members ──
  console.log('\nImporting Members...');
  const membersData = await readSheet('Members');
  if (membersData.length > 1) {
    await knex('members').del();
    const rows = membersData.slice(1).filter(r => r[0]);
    for (const r of rows) {
      await knex('members').insert({
        email: r[0],
        is_admin: toBool(r[1]),
        name: r[2] || '',
        notify_email: toBool(r[3])
      });
    }
    console.log(`  Imported ${rows.length} members`);
  }

  // ── Settings ──
  console.log('\nImporting Settings...');
  const settingsData = await readSheet('Settings');
  if (settingsData.length > 1) {
    for (const r of settingsData.slice(1)) {
      if (!r[0]) continue;
      await knex('settings')
        .insert({ key: r[0], value: String(r[1] || '') })
        .onConflict('key')
        .merge({ value: String(r[1] || '') });
    }
    console.log(`  Imported ${settingsData.length - 1} settings`);
  }

  // ── Access Requests ──
  console.log('\nImporting Access Requests...');
  const arData = await readSheet('AccessRequests');
  if (arData.length > 1) {
    await knex('access_requests').del();
    for (const r of arData.slice(1)) {
      if (!r[0]) continue;
      await knex('access_requests').insert({
        email: r[0],
        name: r[1] || '',
        requested_at: r[2] ? new Date(r[2]) : new Date(),
        status: r[3] || 'pending'
      });
    }
    console.log(`  Imported ${arData.length - 1} access requests`);
  }

  // ── Events ──
  console.log('\nImporting Events...');
  const eventsData = await readSheet('Events');
  if (eventsData.length > 1) {
    await knex('event_signups').del();
    await knex('events').del();
    for (const r of eventsData.slice(1)) {
      if (!r[0]) continue;
      await knex('events').insert({
        event_id: r[0],
        title: r[1] || '',
        date: r[2] || '',
        time: r[3] || '',
        location: r[4] || '',
        description: r[5] || '',
        capacity: parseInt(r[6]) || 0,
        collect_grad_year: toBool(r[7]),
        collect_diet: toBool(r[8]),
        freeze_date: r[9] || '',
        interest_only: toBool(r[10])
      });
    }
    console.log(`  Imported ${eventsData.length - 1} events`);
  }

  // ── Event Signups ──
  const eventSheets = sheetNames.filter(n => n.startsWith('Event_'));
  for (const esn of eventSheets) {
    const eventId = esn.replace('Event_', '');
    console.log(`\nImporting ${esn}...`);
    const esData = await readSheet(esn);
    if (esData.length > 1) {
      for (const r of esData.slice(1)) {
        if (!r[0]) continue;
        try {
          await knex('event_signups').insert({
            event_id: eventId,
            name: r[0],
            grad_year: r[1] || '',
            diet: r[2] || '',
            allergies: r[3] || '',
            notes: r[4] || '',
            timestamp: r[5] ? new Date(r[5]) : new Date(),
            guests: r[6] || '',
            ink_type: r[7] || 'ink'
          });
        } catch (e) {
          if (e.code === '23503') console.log(`    Skipping orphan signup for event ${eventId}`);
          else throw e;
        }
      }
      console.log(`  Imported ${esData.length - 1} signups`);
    }
  }

  // ── Week Configs + Signups ──
  const configSheets = sheetNames.filter(n => /^Week_\d{4}-\d{2}-\d{2}_config$/.test(n));
  await knex('signups').del();
  await knex('week_configs').del();

  for (const csn of configSheets) {
    const monday = csn.replace('Week_', '').replace('_config', '');
    console.log(`\nImporting Week ${monday}...`);

    // Config
    const cfgData = await readSheet(csn);
    if (cfgData.length > 0 && cfgData[0][0]) {
      try {
        const parsed = JSON.parse(cfgData[0][0]);
        await knex('week_configs').insert({
          monday,
          config: JSON.stringify(parsed.config || []),
          caps: JSON.stringify(parsed.caps || { slot12: 50, slot1: 50, dinner: 50 }),
          freeze_date: parsed.freezeDate || ''
        });
        console.log('  Config imported');
      } catch (e) {
        console.log('  Config parse error:', e.message);
      }
    }

    // Data
    const dataSheetName = `Week_${monday}_data`;
    const dataRows = await readSheet(dataSheetName);
    if (dataRows.length > 1) {
      let count = 0;
      for (const r of dataRows.slice(1)) {
        const dayIndex = parseInt(r[0]);
        if (isNaN(dayIndex)) continue;
        await knex('signups').insert({
          monday,
          day_index: dayIndex,
          name: r[1] || '',
          diet: r[2] || 'No Dietary Restrictions',
          allergies: r[3] || '',
          time: r[4] || '',
          early: toBool(r[5]),
          notes: r[6] || '',
          timestamp: r[7] ? new Date(r[7]) : new Date(),
          grad_gasman: toBool(r[8]),
          spot_up_status: r[9] || '',
          spot_up_orig_name: r[10] || '',
          spot_up_claimed_by: r[11] || '',
          served_status: r[12] || ''
        });
        count++;
      }
      console.log(`  ${count} signups imported`);
    }
  }

  // ── Claim Tokens ──
  console.log('\nImporting Claim Tokens...');
  const ctData = await readSheet('ClaimTokens');
  if (ctData.length > 1) {
    await knex('claim_tokens').del();
    for (const r of ctData.slice(1)) {
      if (!r[0]) continue;
      try {
        await knex('claim_tokens').insert({
          token: r[0],
          monday: r[1],
          day_idx: parseInt(r[2]) || 0,
          orig_name: r[3] || '',
          time: r[4] || '',
          recipient_email: r[5] || '',
          used: toBool(r[6]),
          created_at: r[7] ? new Date(r[7]) : new Date()
        });
      } catch (e) {
        // Skip invalid UUIDs or other token issues
        console.log(`    Skipped token: ${e.message}`);
      }
    }
    console.log(`  Imported claim tokens`);
  }

  // ── Verification ──
  console.log('\n── Verification ──');
  const counts = {
    members: await knex('members').count('* as c').first(),
    settings: await knex('settings').count('* as c').first(),
    access_requests: await knex('access_requests').count('* as c').first(),
    week_configs: await knex('week_configs').count('* as c').first(),
    signups: await knex('signups').count('* as c').first(),
    events: await knex('events').count('* as c').first(),
    event_signups: await knex('event_signups').count('* as c').first(),
    claim_tokens: await knex('claim_tokens').count('* as c').first()
  };
  for (const [table, row] of Object.entries(counts)) {
    console.log(`  ${table}: ${row.c} rows`);
  }

  console.log('\nMigration complete!');
  await knex.destroy();
}

function toBool(val) {
  return val === true || val === 'true' || val === 'TRUE';
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
