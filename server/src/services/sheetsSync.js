/**
 * Google Sheets Sync Module
 *
 * Writes data back to the Google Spreadsheet after every mutation,
 * preserving the same layout the chef currently sees.
 *
 * This is fire-and-forget: if Sheets API fails or credentials are not configured,
 * it logs an error but does NOT fail the request. Postgres is the source of truth.
 *
 * IMPORTANT: Will no-op gracefully when GOOGLE_SERVICE_ACCOUNT_KEY or
 * GOOGLE_SPREADSHEET_ID are not configured.
 */

const { google } = require('googleapis');
const config = require('../config');
const db = require('../db/knex');
const { normalizeTime, getTimeSlotsForMeal, getTimeLabel } = require('../utils/time');
const { CATEGORIES, CAT_COLORS, buildDefaultConfig } = require('../utils/weekHelpers');

let sheetsApi = null;
let configured = false;

function init() {
  if (sheetsApi) return true;
  if (!config.googleServiceAccountKey || !config.googleSpreadsheetId) {
    return false;
  }
  try {
    const keyJson = JSON.parse(Buffer.from(config.googleServiceAccountKey, 'base64').toString());
    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsApi = google.sheets({ version: 'v4', auth });
    configured = true;
    return true;
  } catch (e) {
    console.error('Google Sheets auth init failed:', e.message);
    return false;
  }
}

function isConfigured() {
  return configured || init();
}

const SPREADSHEET_ID = () => config.googleSpreadsheetId;

// ── Helper to batch-update values ──

async function updateValues(range, values) {
  await sheetsApi.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range,
    valueInputOption: 'RAW',
    requestBody: { values }
  });
}

async function clearRange(range) {
  await sheetsApi.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID(),
    range,
    requestBody: {}
  });
}

async function getSheetId(sheetName) {
  const resp = await sheetsApi.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID(),
    fields: 'sheets.properties'
  });
  const sheet = resp.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function ensureSheet(sheetName) {
  const id = await getSheetId(sheetName);
  if (id !== null) return id;
  const resp = await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }]
    }
  });
  return resp.data.replies[0].addSheet.properties.sheetId;
}

// ── Display Sheet Helpers ──

/**
 * Build Sheets API requests to write header values (rows 3-7) for columns C-G.
 * Mirrors the header-update logic in Code.gs setWeekConfig() lines 955-961.
 */
function buildHeaderValueRequests(sheetId, config_) {
  const requests = [];
  for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
    const col = dayIdx + 2; // columns C-G = indices 2-6
    const cfg = config_[dayIdx] || {};
    const rows = [
      { values: [buildCell(cfg.date || '', { bg: '#f3f3f3' })] },
      { values: [buildCell(cfg.day || '', { bg: '#f3f3f3' })] },
      { values: [buildCell(cfg.meal || '', { bg: '#f3f3f3' })] },
      { values: [buildCell(cfg.menu || '', { bg: '#f3f3f3', wrap: true })] },
      { values: [buildCell(getTimeLabel(cfg.functionsAs || cfg.meal || 'Lunch'), { bg: '#f3f3f3' })] },
    ];
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 2, startColumnIndex: col, endRowIndex: 7, endColumnIndex: col + 1 },
        rows,
        fields: 'userEnteredValue,userEnteredFormat'
      }
    });
  }
  return requests;
}

/**
 * Create the display sheet with full header structure.
 * Mirrors Code.gs createWeekSheet() lines 987-1016.
 */
async function createDisplaySheet(sheetName, config_) {
  const sheetId = await ensureSheet(sheetName);
  const requests = [
    // Title: B1
    {
      updateCells: {
        range: { sheetId, startRowIndex: 0, startColumnIndex: 1, endRowIndex: 1, endColumnIndex: 2 },
        rows: [{ values: [buildCell('Delphic Club Lunch/Dinner Sign-Ups', { bold: true, fontSize: 14 })] }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    },
    // Header labels: B3-B8
    {
      updateCells: {
        range: { sheetId, startRowIndex: 2, startColumnIndex: 1, endRowIndex: 8, endColumnIndex: 2 },
        rows: ['Date', 'Day', 'Meal', 'Menu', 'Time', 'Headcount'].map(label => ({
          values: [buildCell(label, { bold: true, bg: '#f3f3f3' })]
        })),
        fields: 'userEnteredValue,userEnteredFormat'
      }
    },
    // Header values: C3-G7
    ...buildHeaderValueRequests(sheetId, config_),
    // Headcount initial values: C8-G8
    ...config_.map((cfg, i) => ({
      updateCells: {
        range: { sheetId, startRowIndex: 7, startColumnIndex: i + 2, endRowIndex: 8, endColumnIndex: i + 3 },
        rows: [{ values: [{ userEnteredValue: { numberValue: 0 }, userEnteredFormat: { backgroundColor: hexToRgb('#f3f3f3') } }] }],
        fields: 'userEnteredValue,userEnteredFormat'
      }
    })),
    // Column widths: A=30, B=180, C-G=250
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 30 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 7 },
        properties: { pixelSize: 250 },
        fields: 'pixelSize'
      }
    }
  ];

  await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody: { requests }
  });
  return sheetId;
}

// ── Sync Functions ──

// No-ops: only the chef-facing Week display sheet is synced
async function syncMembers() {}
async function syncSettings() {}
async function syncAccessRequests() {}

/**
 * Sync week data and rebuild the display sheet.
 * Combines syncWeekData + syncWeekConfig + rebuildDisplaySheet.
 */
async function syncWeek(monday) {
  if (!isConfigured()) return;

  // Sync config sheet
  const weekCfg = await db('week_configs').where('monday', monday).first();
  if (weekCfg) {
    const cfgSheetName = `Week_${monday}_config`;
    await ensureSheet(cfgSheetName);
    const cfgJson = JSON.stringify({
      config: weekCfg.config,
      caps: weekCfg.caps,
      freezeDate: weekCfg.freeze_date || ''
    });
    await updateValues(`${cfgSheetName}!A1`, [[cfgJson]]);
  }

  // Sync data sheet
  const signups = await db('signups').where('monday', monday).orderBy('id');
  const dataSheetName = `Week_${monday}_data`;
  await ensureSheet(dataSheetName);
  const header = [['dayIndex', 'name', 'diet', 'allergies', 'time', 'early', 'notes', 'timestamp', 'gradGasman', 'spotUpStatus', 'spotUpOrigName', 'spotUpClaimedBy', 'servedStatus']];
  const rows = signups.map(s => [
    s.day_index, s.name, s.diet || '', s.allergies || '', s.time || '',
    s.early, s.notes || '',
    s.timestamp ? s.timestamp.toISOString() : '',
    s.grad_gasman, s.spot_up_status || '', s.spot_up_orig_name || '',
    s.spot_up_claimed_by || '', s.served_status || ''
  ]);
  await clearRange(`${dataSheetName}!A:M`);
  await updateValues(`${dataSheetName}!A1`, [...header, ...rows]);

  // Rebuild display sheet
  await rebuildDisplaySheet(monday, signups, weekCfg);
}

/**
 * Port of rebuildDisplaySheet() from Code.gs:1098-1194.
 * Rebuilds the formatted human-readable week sheet with colors,
 * grouping, and headcounts.
 */
async function rebuildDisplaySheet(monday, signups, weekCfg) {
  const sheetName = `Week_${monday}`;
  const config_ = weekCfg ? weekCfg.config : buildDefaultConfig(monday);

  let sheetId = await getSheetId(sheetName);
  if (sheetId === null) {
    sheetId = await createDisplaySheet(sheetName, config_);
  }

  // Group signups by day
  const byDay = {};
  for (const s of signups) {
    const d = s.day_index;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(s);
  }

  // Build cell values and formatting requests
  const requests = [];
  const valueRows = [];

  // Clear rows 9+ (row index 8+)
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: 8, startColumnIndex: 1, endColumnIndex: 8 },
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  // Update header rows 3-7 with current config values
  requests.push(...buildHeaderValueRequests(sheetId, config_));

  // Update headcounts in row 8 (index 7)
  for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
    const col = dayIdx + 2; // columns C-G = index 2-6
    const daySups = byDay[dayIdx] || [];
    requests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 7, startColumnIndex: col, endRowIndex: 8, endColumnIndex: col + 1 },
        rows: [{ values: [{ userEnteredValue: { numberValue: daySups.length } }] }],
        fields: 'userEnteredValue'
      }
    });
  }

  // Build content for each day column
  for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
    const col = dayIdx + 2;
    const daySups = byDay[dayIdx] || [];
    const meal = config_[dayIdx] ? (config_[dayIdx].functionsAs || config_[dayIdx].meal) : 'Lunch';
    const configDay = config_[dayIdx] || {};
    const slots = (configDay.slots && configDay.slots.length > 0)
      ? configDay.slots.map(s => s.time || s)
      : getTimeSlotsForMeal(meal);

    let row = 8; // 0-indexed row 8 = row 9 in sheet
    const cellRows = [];

    // "Members attending:" header
    cellRows.push({
      values: [buildCell('Members attending:', { bold: true, fontSize: 10 })]
    });
    row++;

    const shownNames = {};

    for (const slot of slots) {
      const slotLabel = slot === '12:00 PM' ? '12:00-1:00 PM' : slot === '1:00 PM' ? '1:00-2:00 PM' : slot;
      cellRows.push({
        values: [buildCell(slotLabel, { bold: true, fontSize: 11, bg: '#E3F2FD', fg: '#1565C0' })]
      });
      row++;

      const slotMembers = daySups.filter(s => normalizeTime(s.time) === slot);
      slotMembers.sort((a, b) => (b.early ? 1 : 0) - (a.early ? 1 : 0));

      for (const m of slotMembers) {
        shownNames[m.name.toLowerCase()] = true;
        cellRows.push({ values: [renderMemberCell(m)] });
        row++;
      }
      cellRows.push({ values: [{ userEnteredValue: { stringValue: '' } }] });
      row++;
    }

    // Orphans (signups whose time doesn't match any slot)
    const orphans = daySups.filter(s => !shownNames[s.name.toLowerCase()]);
    if (orphans.length > 0) {
      const orphanTimes = {};
      for (const m of orphans) {
        const t = normalizeTime(m.time) || 'unknown';
        if (!orphanTimes[t]) orphanTimes[t] = [];
        orphanTimes[t].push(m);
      }
      for (const [t, members] of Object.entries(orphanTimes)) {
        cellRows.push({
          values: [buildCell(`${t} (time updated)`, { bold: true, fontSize: 11, bg: '#FFF8E1', fg: '#8B6914' })]
        });
        row++;
        for (const m of members) {
          cellRows.push({ values: [renderMemberCell(m)] });
          row++;
        }
        cellRows.push({ values: [{ userEnteredValue: { stringValue: '' } }] });
        row++;
      }
    }

    if (cellRows.length > 0) {
      requests.push({
        updateCells: {
          range: { sheetId, startRowIndex: 8, startColumnIndex: col, endRowIndex: 8 + cellRows.length, endColumnIndex: col + 1 },
          rows: cellRows,
          fields: 'userEnteredValue,userEnteredFormat'
        }
      });
    }
  }

  // KEY column (column B, starting at row 10 = index 9)
  const keyRows = [{ values: [buildCell('KEY:', { bold: true, fontSize: 10 })] }];
  for (const cat of CATEGORIES) {
    const colors = CAT_COLORS[cat];
    keyRows.push({
      values: [buildCell(cat, { bold: true, fontSize: 10, fg: colors.font, bg: colors.bg })]
    });
  }
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: 9, startColumnIndex: 1, endRowIndex: 9 + keyRows.length, endColumnIndex: 2 },
      rows: keyRows,
      fields: 'userEnteredValue,userEnteredFormat'
    }
  });

  if (requests.length > 0) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: { requests }
    });
  }
}

function renderMemberCell(m) {
  const tags = [];
  if (m.diet && m.diet !== 'No Dietary Restrictions') tags.push(m.diet.toLowerCase());
  if (m.allergies) tags.push(m.allergies);
  if (m.early) tags.push('early');
  if (m.grad_gasman) tags.push('Grad Gasman');
  if (m.spot_up_status === 'spotup') tags.push('SPOT UP');
  if (m.spot_up_status === 'claimed') tags.push('CLAIMED from ' + m.spot_up_orig_name);

  let display = m.name;
  if (tags.length > 0) display += ' (' + tags.join(', ') + ')';

  const format = {};
  const colors = CAT_COLORS[m.diet] || CAT_COLORS['No Dietary Restrictions'];
  if (colors.font !== '#000000') format.fg = colors.font;
  if (colors.bg) format.bg = colors.bg;
  if (m.early) { format.bg = '#E3F2FD'; format.fg = '#1565C0'; }
  if (m.allergies) { format.bg = '#F3E5F5'; format.fg = '#4A148C'; format.bold = true; }
  if (m.grad_gasman) { format.bg = '#FFF8E1'; format.fg = '#8B6914'; format.bold = true; }
  if (m.spot_up_status === 'spotup') { format.bg = '#FFF3E0'; format.fg = '#E65100'; }
  if (m.spot_up_status === 'claimed') { format.bg = '#E8F5E9'; format.fg = '#2E7D32'; }
  if (m.served_status === 'served') { format.strikethrough = true; format.fg = '#999999'; }

  return buildCell(display, format);
}

function buildCell(text, fmt = {}) {
  const cell = {
    userEnteredValue: { stringValue: text },
    userEnteredFormat: {}
  };
  const f = cell.userEnteredFormat;
  if (fmt.bold) {
    f.textFormat = { ...f.textFormat, bold: true };
  }
  if (fmt.fontSize) {
    f.textFormat = { ...f.textFormat, fontSize: fmt.fontSize };
  }
  if (fmt.fg) {
    f.textFormat = { ...f.textFormat, foregroundColorStyle: { rgbColor: hexToRgb(fmt.fg) } };
  }
  if (fmt.bg) {
    f.backgroundColor = hexToRgb(fmt.bg);
  }
  if (fmt.strikethrough) {
    f.textFormat = { ...f.textFormat, strikethrough: true };
  }
  if (fmt.wrap) {
    f.wrapStrategy = 'WRAP';
  }
  return cell;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255
  };
}

// ── Events sync ──

// No-ops: only the chef-facing Week display sheet is synced
async function syncEvents() {}
async function syncEventSignups(eventId) {}
async function syncDeleteEventSheet(eventId) {}

// ── Claim tokens sync ──

// No-op: only the chef-facing Week display sheet is synced
async function syncClaimTokens() {}

module.exports = {
  syncMembers, syncSettings, syncAccessRequests,
  syncWeek, syncEvents, syncEventSignups,
  syncDeleteEventSheet, syncClaimTokens
};
