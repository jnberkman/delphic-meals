// ═══════════════════════════════════════════════════════════════
//  DELPHIC CLUB MEAL SIGN-UPS — Google Apps Script Backend v8
//  v8: Added Spot Up system
//  v8.1: Fixed dayIndex → dayIdx bug in addSignups
// ═══════════════════════════════════════════════════════════════

const CATEGORIES = [
  'No Dietary Restrictions', 'Vegan', 'Vegetarian',
  'Gluten-Free', 'Allergies', 'No Pork', 'No Beef'
];

var CAT_COLORS = {
  'No Dietary Restrictions': { font: '#000000', bg: null },
  'Vegan':                   { font: '#2E7D32', bg: '#E8F5E9' },
  'Vegetarian':              { font: '#558B2F', bg: '#F1F8E9' },
  'Gluten-Free':             { font: '#E65100', bg: '#FFF3E0' },
  'Allergies':               { font: '#B71C1C', bg: '#FFEBEE' },
  'No Pork':                 { font: '#4A148C', bg: '#F3E5F5' },
  'No Beef':                 { font: '#4A148C', bg: '#F3E5F5' }
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DEFAULT_MEALS = ['Lunch', 'Lunch', 'Lunch', 'Dinner', 'Lunch'];

// ── Web App Entry Points ──

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return handleRequest(data);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    // Email claim link
    if (e && e.parameter && e.parameter.claimToken) {
      return handleEmailClaim(e.parameter.claimToken);
    }
    if (e && e.parameter && e.parameter.payload) {
      var data = JSON.parse(e.parameter.payload);
      return handleRequest(data);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', message: 'Club Meal Signup API v8.1 running.' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleEmailClaim(token) {
  var result = claimViaToken(token);
  var success = result.status === 'ok';
  var title = success ? 'Spot Claimed!' : (result.error === 'claim_failed' ? 'Already Claimed' : 'Error');
  var msg = success
    ? 'You\'ve claimed <strong>' + result.origName + '\'s</strong> spot. You\'re on the list.'
    : (result.message || 'Something went wrong.');
  var name = success ? result.claimerName : '';
  return HtmlService.createHtmlOutput(buildClaimResultPage(success, title, msg, name))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function buildClaimResultPage(success, title, message, name) {
  var color = success ? '#2E7D32' : '#C62828';
  var icon = success ? '&#10003;' : '&#10007;';
  return '<!DOCTYPE html><html><head><title>' + title + '</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>*{box-sizing:border-box}body{margin:0;background:#f4f1eb;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}' +
    '.card{background:#fff;border-radius:10px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)}' +
    '.icon{width:56px;height:56px;border-radius:50%;background:' + color + ';color:#fff;font-size:28px;line-height:56px;margin:0 auto 20px}' +
    '.title{font-size:24px;font-weight:700;color:#1a1a2e;margin-bottom:12px}' +
    '.msg{font-size:15px;color:#555;line-height:1.6;margin-bottom:20px}' +
    '.claimer{font-size:13px;color:#888;margin-bottom:24px}' +
    '.btn{display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-weight:600}' +
    '.footer{font-size:11px;color:#bbb;margin-top:24px;letter-spacing:.5px;text-transform:uppercase}</style>' +
    '</head><body><div class="card">' +
    '<div class="icon">' + icon + '</div>' +
    '<div class="title">' + title + '</div>' +
    '<div class="msg">' + message + '</div>' +
    (name ? '<div class="claimer">Claimed by: <strong>' + name + '</strong></div>' : '') +
    '<a href="https://rmeek-robot.github.io/delphic-meals/" class="btn">Open Meal Sign-Ups</a>' +
    '<div class="footer">Delphic Club</div>' +
    '</div></body></html>';
}

function buildSpotUpEmail(origName, dayMeal, time, recipientName, claimUrl) {
  var greeting = recipientName ? 'Hi ' + recipientName + ',' : 'Hi,';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1eb;font-family:Georgia,serif;">' +
    '<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
    '<div style="background:#1a1a2e;padding:24px 32px;">' +
    '<div style="font-size:20px;font-weight:700;color:#e8d5a3;">Delphic Club</div>' +
    '<div style="font-size:11px;color:#8888aa;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Spot Up Alert</div>' +
    '</div>' +
    '<div style="padding:32px;">' +
    '<p style="margin:0 0 8px;font-size:14px;color:#666;">' + greeting + '</p>' +
    '<p style="margin:0 0 28px;font-size:16px;color:#222;line-height:1.6;">' +
    '<strong>' + origName + '</strong> spotted up their <strong>' + dayMeal + '</strong> spot' +
    (time ? ' (<strong>' + time + '</strong>)' : '') + '.</p>' +
    '<div style="text-align:center;margin:0 0 28px;">' +
    '<a href="' + claimUrl + '" style="display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:15px 40px;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:.5px;">Claim This Spot</a>' +
    '</div>' +
    '<p style="margin:0;font-size:12px;color:#aaa;text-align:center;line-height:1.6;">First click claims it — link is single-use. If already taken you\'ll see a message.</p>' +
    '</div></div></body></html>';
}

function handleRequest(data) {
  var action = data.action;
  var result;
  switch (action) {
    case 'ping':
      result = { status: 'ok' };
      break;
    // ── Meal signups ──
    case 'getWeek':
      result = getWeek(data.monday);
      break;
    case 'addSignups':
      result = addSignups(data.monday, data.entries, data.caps || {});
      break;
    case 'removeSignup':
      result = removeSignup(data.monday, data.dayIndex, data.name, data.time);
      break;
    case 'setWeekConfig':
      result = setWeekConfig(data.monday, data.config, data.caps || {}, data.freezeDate || '');
      break;
    // ── Spot Up ──
    case 'spotUp':
      result = spotUp(data.monday, data.dayIndex, data.name, data.time);
      break;
    case 'claimSpotUp':
      result = claimSpotUp(data.monday, data.dayIndex, data.originalName, data.time, data.claimerName);
      break;
    case 'unclaimSpotUp':
      result = unclaimSpotUp(data.monday, data.dayIndex, data.originalName, data.time);
      break;
    case 'cancelSpotUp':
      result = cancelSpotUp(data.monday, data.dayIndex, data.name, data.time);
      break;
    case 'markServed':
      result = markServed(data.monday, data.dayIndex, data.name, data.time, data.served);
      break;
    // ── Members ──
    case 'checkMember':
      result = checkMember(data.email);
      break;
    case 'getMembers':
      result = getMembers();
      break;
    case 'addMember':
      result = addMember(data.email, data.isAdmin, data.name);
      break;
    case 'removeMember':
      result = removeMember(data.email);
      break;
    // ── Settings ──
    case 'getSettings':
      result = getSettings();
      break;
    case 'setSettings':
      result = setSettings(data.settings);
      break;
    case 'setNotifyEmail':
      result = setNotifyEmail(data.email, data.notify);
      break;
    // ── Special Events ──
    case 'getEvents':
      result = getEvents();
      break;
    case 'createEvent':
      result = createEvent(data.event);
      break;
    case 'updateEvent':
      result = updateEvent(data.eventId, data.event);
      break;
    case 'deleteEvent':
      result = deleteEvent(data.eventId);
      break;
    case 'addEventSignup':
      result = addEventSignup(data.eventId, data.signup);
      break;
    case 'removeEventSignup':
      result = removeEventSignup(data.eventId, data.name);
      break;
    default:
      result = { error: 'Unknown action: ' + action };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}


// ═══════════════════════════════════════════════════════════════
//  SPOT UP FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Mark a signup as "spot up" — the person is giving up their spot.
 * Sets columns J=spotUpStatus to "spotup", K=spotUpOrigName to their name, L=spotUpClaimedBy to ""
 */
function spotUp(monday, dayIndex, name, time) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  if (!ds || ds.getLastRow() < 2) return { error: 'Signup not found' };

  ensureSpotUpColumns(ds);
  var data = ds.getDataRange().getValues();
  var timeNorm = normalizeTime(time);

  for (var r = 1; r < data.length; r++) {
    if (parseInt(data[r][0]) === parseInt(dayIndex) &&
        data[r][1].toString().toLowerCase() === name.toLowerCase() &&
        normalizeTime(data[r][4]) === timeNorm) {
      // Set spotUpStatus = "spotup", spotUpOrigName = original name, spotUpClaimedBy = ""
      ds.getRange(r + 1, 10).setValue('spotup');
      ds.getRange(r + 1, 11).setValue(name);
      ds.getRange(r + 1, 12).setValue('');
      var sheet = ss.getSheetByName('Week_' + monday);
      if (sheet) rebuildDisplaySheet(sheet, monday);
      // Send email notifications to opted-in members
      try {
        var cfgSheet = ss.getSheetByName('Week_' + monday + '_config');
        var cfg = null;
        if (cfgSheet) { try { cfg = JSON.parse(cfgSheet.getRange('A1').getValue()).config; } catch(ce) {} }
        sendSpotUpEmails(monday, dayIndex, name, normalizeTime(time), cfg);
      } catch(emailErr) { Logger.log('Spot-up email error: ' + emailErr.message); }
      return { status: 'ok' };
    }
  }
  return { error: 'Signup not found' };
}

/**
 * Claim a spotted-up slot. The claimer takes over the spot.
 * Updates the name to the claimer, sets spotUpStatus to "claimed", keeps spotUpOrigName, sets spotUpClaimedBy.
 */
function claimSpotUp(monday, dayIndex, originalName, time, claimerName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  if (!ds || ds.getLastRow() < 2) return { error: 'Signup not found' };

  ensureSpotUpColumns(ds);
  var data = ds.getDataRange().getValues();
  var timeNorm = normalizeTime(time);

  for (var r = 1; r < data.length; r++) {
    var rowStatus = (data[r][9] || '').toString();
    var rowOrigName = (data[r][10] || '').toString();
    var rowName = data[r][1].toString();

    // Match: must be a "spotup" status row for this day/time, and orig name matches
    if (parseInt(data[r][0]) === parseInt(dayIndex) &&
        normalizeTime(data[r][4]) === timeNorm &&
        rowStatus === 'spotup' &&
        (rowOrigName.toLowerCase() === originalName.toLowerCase() || rowName.toLowerCase() === originalName.toLowerCase())) {
      // Update the name to claimer
      ds.getRange(r + 1, 2).setValue(claimerName);
      ds.getRange(r + 1, 10).setValue('claimed');
      // Keep the original name in column 11
      if (!rowOrigName) ds.getRange(r + 1, 11).setValue(originalName);
      ds.getRange(r + 1, 12).setValue(claimerName);
      var sheet = ss.getSheetByName('Week_' + monday);
      if (sheet) rebuildDisplaySheet(sheet, monday);
      return { status: 'ok' };
    }
  }
  return { error: 'Spot up not found or already claimed' };
}

/**
 * Unclaim a spot up — revert back to "spotup" status with the original name.
 * This is called when someone who claimed wants to give it back.
 */
function unclaimSpotUp(monday, dayIndex, originalName, time) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  if (!ds || ds.getLastRow() < 2) return { error: 'Signup not found' };

  ensureSpotUpColumns(ds);
  var data = ds.getDataRange().getValues();
  var timeNorm = normalizeTime(time);

  for (var r = 1; r < data.length; r++) {
    var rowStatus = (data[r][9] || '').toString();
    var rowOrigName = (data[r][10] || '').toString();

    if (parseInt(data[r][0]) === parseInt(dayIndex) &&
        normalizeTime(data[r][4]) === timeNorm &&
        rowStatus === 'claimed' &&
        rowOrigName.toLowerCase() === originalName.toLowerCase()) {
      // Revert: put original name back, set status back to spotup
      ds.getRange(r + 1, 2).setValue(rowOrigName);
      ds.getRange(r + 1, 10).setValue('spotup');
      ds.getRange(r + 1, 12).setValue('');
      var sheet = ss.getSheetByName('Week_' + monday);
      if (sheet) rebuildDisplaySheet(sheet, monday);
      return { status: 'ok' };
    }
  }
  return { error: 'Claimed spot not found' };
}

/**
 * Cancel a spot up entirely — revert back to normal signup (no spot up status).
 * Only works if the spot is in "spotup" state (not claimed).
 */
function cancelSpotUp(monday, dayIndex, name, time) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  if (!ds || ds.getLastRow() < 2) return { error: 'Signup not found' };

  ensureSpotUpColumns(ds);
  var data = ds.getDataRange().getValues();
  var timeNorm = normalizeTime(time);

  for (var r = 1; r < data.length; r++) {
    var rowStatus = (data[r][9] || '').toString();
    if (parseInt(data[r][0]) === parseInt(dayIndex) &&
        data[r][1].toString().toLowerCase() === name.toLowerCase() &&
        normalizeTime(data[r][4]) === timeNorm &&
        rowStatus === 'spotup') {
      // Clear spot up columns
      ds.getRange(r + 1, 10).setValue('');
      ds.getRange(r + 1, 11).setValue('');
      ds.getRange(r + 1, 12).setValue('');
      var sheet = ss.getSheetByName('Week_' + monday);
      if (sheet) rebuildDisplaySheet(sheet, monday);
      return { status: 'ok' };
    }
  }
  return { error: 'Spot up not found or already claimed' };
}

/**
 * Ensure the data sheet has columns J, K, L for spot up tracking.
 */
function ensureSpotUpColumns(ds) {
  var headers = ds.getRange(1, 1, 1, ds.getLastColumn()).getValues()[0];
  if (headers.length < 12 || headers[9] !== 'spotUpStatus') {
    // Extend headers if needed
    while (ds.getMaxColumns() < 12) ds.insertColumnAfter(ds.getMaxColumns());
    ds.getRange(1, 10).setValue('spotUpStatus');
    ds.getRange(1, 11).setValue('spotUpOrigName');
    ds.getRange(1, 12).setValue('spotUpClaimedBy');
  }
  // Column M — served status
  if (headers.length < 13 || headers[12] !== 'servedStatus') {
    while (ds.getMaxColumns() < 13) ds.insertColumnAfter(ds.getMaxColumns());
    ds.getRange(1, 13).setValue('servedStatus');
  }
}


/**
 * Mark or unmark a signup as served during meal service.
 * Sets column M (servedStatus) to 'served' or ''.
 * Rebuilds the display sheet so the name shows as strikethrough.
 */
function markServed(monday, dayIndex, name, time, served) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  if (!ds || ds.getLastRow() < 2) return { error: 'Signup not found' };

  ensureSpotUpColumns(ds); // also ensures column 13
  var data = ds.getDataRange().getValues();
  var timeNorm = normalizeTime(time);

  for (var r = 1; r < data.length; r++) {
    if (parseInt(data[r][0]) === parseInt(dayIndex) &&
        data[r][1].toString().toLowerCase() === name.toLowerCase() &&
        normalizeTime(data[r][4]) === timeNorm) {
      ds.getRange(r + 1, 13).setValue(served ? 'served' : '');
      var sheet = ss.getSheetByName('Week_' + monday);
      if (sheet) rebuildDisplaySheet(sheet, monday);
      return { status: 'ok' };
    }
  }
  return { error: 'Signup not found' };
}

// ═══════════════════════════════════════════════════════════════
//  SPECIAL EVENTS
// ═══════════════════════════════════════════════════════════════

function getEventsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Events');
  if (!sheet) {
    sheet = ss.insertSheet('Events');
    sheet.getRange('A1:J1').setValues([['eventId', 'title', 'date', 'time', 'location', 'description', 'capacity', 'collectGradYear', 'collectDiet', 'freezeDate']]);
    sheet.getRange('A1:J1').setFontWeight('bold');
  }
  return sheet;
}

function getEventSignupsSheet(eventId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = 'Event_' + eventId;
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange('A1:G1').setValues([['name', 'gradYear', 'diet', 'allergies', 'notes', 'timestamp', 'guests']]);
    sheet.getRange('A1:G1').setFontWeight('bold');
  }
  return sheet;
}

function getEvents() {
  var sheet = getEventsSheet();
  var events = [];
  if (sheet.getLastRow() < 2) return { events: events };

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  data.forEach(function(row) {
    if (!row[0]) return;
    var eventId = row[0].toString();
    var signupCount = 0;
    var signupSheet = ss.getSheetByName('Event_' + eventId);
    if (signupSheet && signupSheet.getLastRow() > 1) {
      signupCount = signupSheet.getLastRow() - 1;
    }
    events.push({
      eventId: eventId,
      title: row[1] || '',
      date: row[2] ? (row[2] instanceof Date ? Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'yyyy-MM-dd') : row[2].toString()) : '',
      time: row[3] || '',
      location: row[4] || '',
      description: row[5] || '',
      capacity: row[6] || 0,
      collectGradYear: row[7] === true || row[7] === 'true' || row[7] === 'TRUE',
      collectDiet: row[8] === true || row[8] === 'true' || row[8] === 'TRUE',
      freezeDate: row[9] || '',
      signupCount: signupCount
    });
  });

  return { events: events };
}

function createEvent(event) {
  var sheet = getEventsSheet();
  var eventId = 'evt_' + new Date().getTime();
  sheet.appendRow([
    eventId,
    event.title || '',
    event.date || '',
    event.time || '',
    event.location || '',
    event.description || '',
    event.capacity || 0,
    event.collectGradYear || false,
    event.collectDiet || false,
    event.freezeDate || ''
  ]);
  return { status: 'ok', eventId: eventId };
}

function updateEvent(eventId, event) {
  var sheet = getEventsSheet();
  if (sheet.getLastRow() < 2) return { error: 'Event not found' };
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0].toString() === eventId) {
      sheet.getRange(r + 1, 2).setValue(event.title || '');
      sheet.getRange(r + 1, 3).setValue(event.date || '');
      sheet.getRange(r + 1, 4).setValue(event.time || '');
      sheet.getRange(r + 1, 5).setValue(event.location || '');
      sheet.getRange(r + 1, 6).setValue(event.description || '');
      sheet.getRange(r + 1, 7).setValue(event.capacity || 0);
      sheet.getRange(r + 1, 8).setValue(event.collectGradYear || false);
      sheet.getRange(r + 1, 9).setValue(event.collectDiet || false);
      sheet.getRange(r + 1, 10).setValue(event.freezeDate || '');
      return { status: 'ok' };
    }
  }
  return { error: 'Event not found' };
}

function deleteEvent(eventId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getEventsSheet();
  if (sheet.getLastRow() < 2) return { error: 'Event not found' };
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0].toString() === eventId) {
      sheet.deleteRow(r + 1);
      var signupSheet = ss.getSheetByName('Event_' + eventId);
      if (signupSheet) ss.deleteSheet(signupSheet);
      return { status: 'ok' };
    }
  }
  return { error: 'Event not found' };
}

function addEventSignup(eventId, signup) {
  var events = getEvents().events;
  var event = null;
  for (var i = 0; i < events.length; i++) {
    if (events[i].eventId === eventId) { event = events[i]; break; }
  }
  if (!event) return { error: 'Event not found' };

  if (event.freezeDate) {
    var freezeTime = new Date(event.freezeDate).getTime();
    if (Date.now() > freezeTime) return { error: 'Sign-ups are closed for this event' };
  }

  var sheet = getEventSignupsSheet(eventId);

  if (sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      if (data[r][0].toString().toLowerCase() === signup.name.toLowerCase()) {
        sheet.deleteRow(r + 1);
        break;
      }
    }
  }

  var currentCount = sheet.getLastRow() - 1;
  if (event.capacity > 0 && currentCount >= event.capacity) {
    return { error: 'Event is full', full: true };
  }

  sheet.appendRow([
    signup.name || '',
    signup.gradYear || '',
    signup.diet || '',
    signup.allergies || '',
    signup.notes || '',
    new Date().toISOString(),
    signup.guests || ''
  ]);

  return { status: 'ok', added: 1 };
}

function removeEventSignup(eventId, name) {
  var sheet = getEventSignupsSheet(eventId);
  if (sheet.getLastRow() < 2) return { removed: false };
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0].toString().toLowerCase() === name.toLowerCase()) {
      sheet.deleteRow(r + 1);
      return { removed: true };
    }
  }
  return { removed: false };
}


// ═══════════════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════════════

function getMembersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Members');
  if (!sheet) {
    sheet = ss.insertSheet('Members');
    sheet.getRange('A1:D1').setValues([['email', 'isAdmin', 'name', 'notifyEmail']]);
    sheet.getRange('A1:D1').setFontWeight('bold');
  } else if (sheet.getLastColumn() < 4) {
    sheet.getRange(1, 4).setValue('notifyEmail');
  }
  return sheet;
}

function checkMember(email) {
  var sheet = getMembersSheet();
  if (sheet.getLastRow() < 2) return { authorized: false };
  var lastCol = Math.max(sheet.getLastColumn(), 4);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  var emailLower = email.toLowerCase().trim();
  for (var r = 0; r < data.length; r++) {
    if (data[r][0].toString().toLowerCase().trim() === emailLower) {
      return {
        authorized: true,
        isAdmin: data[r][1] === true || data[r][1] === 'true' || data[r][1] === 'TRUE',
        name: data[r][2] ? data[r][2].toString() : '',
        notifyEmail: data[r][3] === true || data[r][3] === 'true' || data[r][3] === 'TRUE'
      };
    }
  }
  return { authorized: false };
}

function getMembers() {
  var sheet = getMembersSheet();
  var members = [];
  if (sheet.getLastRow() < 2) return { members: members };
  var lastCol = Math.max(sheet.getLastColumn(), 4);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  for (var r = 0; r < data.length; r++) {
    if (!data[r][0]) continue;
    members.push({
      email: data[r][0].toString(),
      isAdmin: data[r][1] === true || data[r][1] === 'true' || data[r][1] === 'TRUE',
      name: data[r][2] ? data[r][2].toString() : '',
      notifyEmail: data[r][3] === true || data[r][3] === 'true' || data[r][3] === 'TRUE'
    });
  }
  return { members: members };
}

function addMember(email, isAdmin, name) {
  var sheet = getMembersSheet();
  // Update if already exists
  if (sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (data[r][0].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
        sheet.getRange(r + 1, 1).setValue(email);
        sheet.getRange(r + 1, 2).setValue(isAdmin || false);
        sheet.getRange(r + 1, 3).setValue(name || '');
        return { status: 'ok', updated: true };
      }
    }
  }
  sheet.appendRow([email, isAdmin || false, name || '']);
  return { status: 'ok', added: true };
}

function removeMember(email) {
  var sheet = getMembersSheet();
  if (sheet.getLastRow() < 2) return { removed: false };
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
      sheet.deleteRow(r + 1);
      return { removed: true };
    }
  }
  return { removed: false };
}


// ═══════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════

function getSettingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.getRange('A1:B1').setValues([['key', 'value']]);
    sheet.getRange('A1:B1').setFontWeight('bold');
    sheet.appendRow(['openAccess', 'false']);
  }
  return sheet;
}

function getSettings() {
  var sheet = getSettingsSheet();
  var settings = { openAccess: false };
  if (sheet.getLastRow() < 2) return { settings: settings };
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var key = data[r][0].toString();
    var val = data[r][1];
    if (key === 'openAccess') settings.openAccess = val === true || val === 'true' || val === 'TRUE';
  }
  return { settings: settings };
}

function setSettings(newSettings) {
  var sheet = getSettingsSheet();
  var data = sheet.getDataRange().getValues();
  var keys = Object.keys(newSettings);
  keys.forEach(function(key) {
    var found = false;
    for (var r = 1; r < data.length; r++) {
      if (data[r][0].toString() === key) {
        sheet.getRange(r + 1, 2).setValue(newSettings[key]);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, newSettings[key]]);
  });
  return { status: 'ok' };
}


// ═══════════════════════════════════════════════════════════════
//  MEAL SIGNUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getWeek(monday) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Week_' + monday;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { monday: monday, config: buildDefaultConfig(monday), signups: {}, caps: { slot12: 50, slot1: 50, dinner: 50 } };
  }
  var result = readSheetData(sheet, monday);
  var configSheet = ss.getSheetByName('Week_' + monday + '_config');
  if (configSheet) {
    try {
      var raw = configSheet.getRange('A1').getValue();
      var parsed = JSON.parse(raw);
      result.caps = parsed.caps || { slot12: 50, slot1: 50, dinner: 50 };
    } catch (e) { result.caps = { slot12: 50, slot1: 50, dinner: 50 }; }
  } else { result.caps = { slot12: 50, slot1: 50, dinner: 50 }; }
  return result;
}

function addSignups(monday, entries, caps) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Week_' + monday;
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = createWeekSheet(ss, monday, buildDefaultConfig(monday), caps, "");
  var existing = readSheetData(sheet, monday);
  var added = 0, updated = 0, full = 0;
  if (existing.freezeDate) {
    if (Date.now() > new Date(existing.freezeDate).getTime()) return { added: 0, duplicates: 0, full: 0, error: 'Sign-ups are closed for this week' };
  }
  var capSlot12 = caps.slot12 || 50, capSlot1 = caps.slot1 || 50, capDinner = caps.dinner || 50;
  entries.forEach(function(entry) {
    var dayIdx = entry.dayIndex;
    var daySups = existing.signups[dayIdx] || [];
    var dataSheet = ss.getSheetByName(sheetName + '_data');
    if (dataSheet && dataSheet.getLastRow() > 1) {
      var rows = dataSheet.getDataRange().getValues();
      for (var r = rows.length - 1; r >= 1; r--) {
        if (rows[r][0] == dayIdx && rows[r][1].toString().toLowerCase() === entry.name.toLowerCase()) {
          dataSheet.deleteRow(r + 1);
          daySups = daySups.filter(function(s) { return s.name.toLowerCase() !== entry.name.toLowerCase(); });
          existing.signups[dayIdx] = daySups;
          updated++;
          break;
        }
      }
    }
    var timeStr = normalizeTime(entry.time);
    var timeCount = daySups.filter(function(s) { return normalizeTime(s.time) === timeStr; }).length;
    var cap = capSlot12;
    if (timeStr === '1:00 PM') cap = capSlot1;
    else if (timeStr === '7:30 PM') cap = capDinner;
    if (timeCount >= cap) { full++; return; }
    // *** BUG FIX: was "dayIndex" (undefined), now correctly "dayIdx" ***
    appendSignupToData(ss, monday, dayIdx, entry);
    if (!existing.signups[dayIdx]) existing.signups[dayIdx] = [];
    existing.signups[dayIdx].push(entry);
    added++;
  });
  rebuildDisplaySheet(sheet, monday);
  return { added: added, updated: updated, full: full };
}

function removeSignup(monday, dayIndex, name, time) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Week_' + monday);
  if (!sheet) return { removed: false };
  var dataSheet = ss.getSheetByName('Week_' + monday + '_data');
  if (dataSheet && dataSheet.getLastRow() > 1) {
    var data = dataSheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] == dayIndex && data[r][1].toString().toLowerCase() === name.toLowerCase()) {
        dataSheet.deleteRow(r + 1);
        break;
      }
    }
  }
  rebuildDisplaySheet(sheet, monday);
  return { removed: true };
}

function setWeekConfig(monday, config, caps, freezeDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Week_' + monday);
  if (!sheet) { sheet = createWeekSheet(ss, monday, config, caps, freezeDate); }
  else {
    for (var i = 0; i < config.length && i < 5; i++) {
      var col = i + 3;
      sheet.getRange(3, col).setValue(config[i].date);
      sheet.getRange(4, col).setValue(config[i].day);
      sheet.getRange(5, col).setValue(config[i].meal);
      sheet.getRange(6, col).setValue(config[i].menu || '');
      sheet.getRange(7, col).setValue(getTimeLabel(config[i].meal));
    }
  }
  saveConfigSheet(ss, monday, config, caps, freezeDate);
  rebuildDisplaySheet(sheet, monday);
  return { status: 'ok' };
}


// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function normalizeTime(val) {
  if (!val) return '';
  var s = val.toString();
  if (s === '12:00 PM' || s === '1:00 PM' || s === '7:30 PM') return s;
  if (s.indexOf('1899') !== -1 || s.indexOf('GMT') !== -1 || val instanceof Date) {
    try {
      var d = new Date(val); var h = d.getHours(); var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM'; var hr = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return hr + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    } catch(e) { return s; }
  }
  return s;
}

function createWeekSheet(ss, monday, config, caps, freezeDate) {
  var sheetName = 'Week_' + monday;
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  sheet = ss.insertSheet(sheetName);
  sheet.getRange('B1').setValue('Delphic Club Lunch/Dinner Sign-Ups').setFontSize(14).setFontWeight('bold');
  sheet.getRange('B3').setValue('Date').setFontWeight('bold');
  sheet.getRange('B4').setValue('Day').setFontWeight('bold');
  sheet.getRange('B5').setValue('Meal').setFontWeight('bold');
  sheet.getRange('B6').setValue('Menu').setFontWeight('bold');
  sheet.getRange('B7').setValue('Time').setFontWeight('bold');
  sheet.getRange('B8').setValue('Headcount').setFontWeight('bold');
  for (var i = 0; i < config.length && i < 5; i++) {
    var col = i + 3;
    sheet.getRange(3, col).setValue(config[i].date);
    sheet.getRange(4, col).setValue(config[i].day);
    sheet.getRange(5, col).setValue(config[i].meal);
    sheet.getRange(6, col).setValue(config[i].menu || '');
    sheet.getRange(6, col).setWrap(true);
    sheet.getRange(7, col).setValue(getTimeLabel(config[i].meal));
    sheet.getRange(8, col).setValue(0);
  }
  sheet.setColumnWidth(1, 30); sheet.setColumnWidth(2, 180);
  for (var j = 3; j <= 7; j++) sheet.setColumnWidth(j, 250);
  sheet.getRange('B3:G8').setBackground('#f3f3f3');
  createDataSheet(ss, monday);
  saveConfigSheet(ss, monday, config, caps, freezeDate);
  rebuildDisplaySheet(sheet, monday);
  return sheet;
}

function createDataSheet(ss, monday) {
  var name = 'Week_' + monday + '_data';
  var ds = ss.getSheetByName(name);
  if (ds) return ds;
  ds = ss.insertSheet(name);
  ds.getRange('A1:M1').setValues([['dayIndex', 'name', 'diet', 'allergies', 'time', 'early', 'notes', 'timestamp', 'gradGasman', 'spotUpStatus', 'spotUpOrigName', 'spotUpClaimedBy', 'servedStatus']]);
  ds.getRange('A1:M1').setFontWeight('bold');
  ds.getRange('E:E').setNumberFormat('@');
  ds.hideSheet();
  return ds;
}

function saveConfigSheet(ss, monday, config, caps, freezeDate) {
  var name = 'Week_' + monday + '_config';
  var cs = ss.getSheetByName(name);
  if (!cs) { cs = ss.insertSheet(name); cs.hideSheet(); }
  cs.clear();
  cs.getRange('A1').setValue(JSON.stringify({ config: config, caps: caps, freezeDate: freezeDate || '' }));
}

function getTimeLabel(meal) {
  if (meal === 'Dinner') return '7:30 PM';
  return '12:00-1:00 PM / 1:00-2:00 PM';
}

function getTimeSlotsForMeal(meal) {
  if (meal === 'Dinner') return ['7:30 PM'];
  return ['12:00 PM', '1:00 PM'];
}

function readSheetData(sheet, monday) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = buildDefaultConfig(monday);
  var freezeDate = '';
  var configSheet = ss.getSheetByName('Week_' + monday + '_config');
  if (configSheet) {
    try {
      var raw = configSheet.getRange('A1').getValue();
      var parsed = JSON.parse(raw);
      if (parsed.config) config = parsed.config;
      if (parsed.freezeDate) freezeDate = parsed.freezeDate;
    } catch (e) {}
  }
  return { monday: monday, config: config, signups: readDataSheet(ss, monday), freezeDate: freezeDate };
}

function readDataSheet(ss, monday) {
  var ds = ss.getSheetByName('Week_' + monday + '_data');
  var signups = {};
  if (ds && ds.getLastRow() > 1) {
    var lastCol = Math.max(ds.getLastColumn(), 13);
    var data = ds.getRange(2, 1, ds.getLastRow() - 1, lastCol).getValues();
    data.forEach(function(row) {
      var dayIdx = parseInt(row[0]);
      if (isNaN(dayIdx)) return;
      if (!signups[dayIdx]) signups[dayIdx] = [];
      signups[dayIdx].push({
        name: row[1] ? row[1].toString() : '',
        diet: row[2] ? row[2].toString() : 'No Dietary Restrictions',
        allergies: row[3] ? row[3].toString() : '',
        time: normalizeTime(row[4]),
        early: row[5] === true || row[5] === 'true' || row[5] === 'TRUE',
        notes: row[6] ? row[6].toString() : '',
        timestamp: row[7] ? row[7].toString() : '',
        gradGasman: row[8] === true || row[8] === 'true' || row[8] === 'TRUE',
        spotUpStatus: row[9] ? row[9].toString() : '',
        spotUpOrigName: row[10] ? row[10].toString() : '',
        spotUpClaimedBy: row[11] ? row[11].toString() : '',
        servedStatus: row[12] ? row[12].toString() : ''
      });
    });
  }
  return signups;
}

function appendSignupToData(ss, monday, dayIndex, entry) {
  var ds = ss.getSheetByName('Week_' + monday + '_data') || createDataSheet(ss, monday);
  ds.appendRow([dayIndex, entry.name, entry.diet, entry.allergies || '', entry.time || '', entry.early || false, entry.notes || '', new Date().toISOString(), entry.gradGasman || false, '', '', '', '']);
}

function rebuildDisplaySheet(sheet, monday, signupsOverride) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var signups = signupsOverride || readDataSheet(ss, monday);
  var config = buildDefaultConfig(monday);
  var configSheet = ss.getSheetByName('Week_' + monday + '_config');
  if (configSheet) {
    try { var parsed = JSON.parse(configSheet.getRange('A1').getValue()); if (parsed.config) config = parsed.config; } catch (e) {}
  }
  var lastRow = sheet.getMaxRows();
  if (lastRow < 60) { sheet.insertRowsAfter(lastRow, 60 - lastRow); lastRow = 60; }
  if (lastRow > 8) { sheet.getRange(9, 2, lastRow - 8, 6).clearContent(); sheet.getRange(9, 2, lastRow - 8, 6).clearFormat(); }
  for (var d = 0; d < 5; d++) sheet.getRange(9, d + 3).setValue('Members attending:').setFontWeight('bold').setFontSize(10);
  for (var dayIdx = 0; dayIdx < 5; dayIdx++) {
    var col = dayIdx + 3;
    var daySups = signups[dayIdx] || [];
    var meal = config[dayIdx] ? config[dayIdx].meal : 'Lunch';
    var slots = getTimeSlotsForMeal(meal);
    var row = 10;
    slots.forEach(function(slot) {
      var slotLabel = slot === '12:00 PM' ? '12:00-1:00 PM' : slot === '1:00 PM' ? '1:00-2:00 PM' : slot;
      sheet.getRange(row, col).setValue(slotLabel).setFontWeight('bold').setFontSize(11).setBackground('#E3F2FD').setFontColor('#1565C0');
      row++;
      var slotMembers = daySups.filter(function(s) { return normalizeTime(s.time) === slot; });
      slotMembers.sort(function(a, b) { return (b.early ? 1 : 0) - (a.early ? 1 : 0); }); // early plate first
      slotMembers.forEach(function(m) {
        var display = m.name;
        var tags = [];
        if (m.diet && m.diet !== 'No Dietary Restrictions') tags.push(m.diet.toLowerCase());
        if (m.allergies) tags.push(m.allergies);
        if (m.early) tags.push('early');
        if (m.gradGasman) tags.push('Grad Gasman');
        if (m.spotUpStatus === 'spotup') tags.push('SPOT UP');
        if (m.spotUpStatus === 'claimed') tags.push('CLAIMED from ' + m.spotUpOrigName);
        if (tags.length > 0) display += ' (' + tags.join(', ') + ')';
        while (sheet.getMaxRows() < row) sheet.insertRowAfter(sheet.getMaxRows());
        var cell = sheet.getRange(row, col);
        cell.setValue(display);
        var colors = CAT_COLORS[m.diet] || CAT_COLORS['No Dietary Restrictions'];
        if (colors.font !== '#000000') cell.setFontColor(colors.font);
        if (colors.bg) cell.setBackground(colors.bg);
        if (m.early) { cell.setBackground('#E3F2FD'); cell.setFontColor('#1565C0'); } // early plate — light blue
        if (m.allergies) { cell.setBackground('#F3E5F5'); cell.setFontColor('#4A148C'); cell.setFontWeight('bold'); } // allergies — purple
        if (m.gradGasman) { cell.setBackground('#FFF8E1'); cell.setFontColor('#8B6914'); cell.setFontWeight('bold'); } // grad gasman — gold (overrides allergies)
        if (m.spotUpStatus === 'spotup') { cell.setBackground('#FFF3E0'); cell.setFontColor('#E65100'); }
        if (m.spotUpStatus === 'claimed') { cell.setBackground('#E8F5E9'); cell.setFontColor('#2E7D32'); }
        if (m.servedStatus === 'served') { cell.setFontLine('line-through'); cell.setFontColor('#999999'); }
        row++;
      });
      row++;
    });
    sheet.getRange(8, col).setValue(daySups.length);
  }
  var bRow = 10;
  sheet.getRange(bRow, 2).setValue('KEY:').setFontWeight('bold').setFontSize(10).setFontColor('#000000');
  bRow++;
  CATEGORIES.forEach(function(cat) {
    var colors = CAT_COLORS[cat];
    var cell = sheet.getRange(bRow, 2);
    cell.setValue(cat).setFontWeight('bold').setFontSize(10).setFontColor(colors.font);
    if (colors.bg) cell.setBackground(colors.bg);
    bRow++;
  });
}

function buildDefaultConfig(monday) {
  var md = new Date(monday + 'T12:00:00');
  return DAYS.map(function(name, i) {
    var d = new Date(md.getTime());
    d.setDate(d.getDate() + i);
    return {
      date: Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      day: name, meal: DEFAULT_MEALS[i], menu: '', enabled: true
    };
  });
}


// ═══════════════════════════════════════════════════════════════
//  EMAIL SPOT-UP NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function setNotifyEmail(email, notify) {
  var sheet = getMembersSheet();
  if (sheet.getLastRow() < 2) return { error: 'Member not found' };
  var data = sheet.getDataRange().getValues();
  var emailLower = email.toLowerCase().trim();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0].toString().toLowerCase().trim() === emailLower) {
      while (sheet.getMaxColumns() < 4) sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(r + 1, 4).setValue(notify ? true : false);
      return { status: 'ok' };
    }
  }
  return { error: 'Member not found' };
}

function getClaimTokensSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ClaimTokens');
  if (!sheet) {
    sheet = ss.insertSheet('ClaimTokens');
    sheet.getRange('A1:H1').setValues([['token', 'monday', 'dayIdx', 'origName', 'time', 'recipientEmail', 'used', 'createdAt']]);
    sheet.getRange('A1:H1').setFontWeight('bold');
    sheet.hideSheet();
  }
  return sheet;
}

function sendSpotUpEmails(monday, dayIdx, origName, time, config) {
  var membersSheet = getMembersSheet();
  if (membersSheet.getLastRow() < 2) return;
  var lastCol = Math.max(membersSheet.getLastColumn(), 4);
  var members = membersSheet.getRange(2, 1, membersSheet.getLastRow() - 1, lastCol).getValues();

  var dayName = config && config[dayIdx] ? (config[dayIdx].day || '') : '';
  var mealType = config && config[dayIdx] ? (config[dayIdx].meal || '') : '';
  var dayMeal = (dayName && mealType) ? dayName + ' ' + mealType : 'a meal';

  var tokensSheet = getClaimTokensSheet();
  var baseUrl = ScriptApp.getService().getUrl();
  var now = new Date().toISOString();
  var subject = '\uD83D\uDD14 Spot Up \u2014 ' + dayMeal + ' at Delphic';

  for (var i = 0; i < members.length; i++) {
    var memberEmail = members[i][0] ? members[i][0].toString().trim() : '';
    var notify = members[i][3] === true || members[i][3] === 'true' || members[i][3] === 'TRUE';
    var memberName = members[i][2] ? members[i][2].toString() : '';
    if (!memberEmail || !notify) continue;

    var token = Utilities.getUuid();
    tokensSheet.appendRow([token, monday, dayIdx, origName, time, memberEmail, false, now]);
    var claimUrl = baseUrl + '?claimToken=' + token;

    MailApp.sendEmail({
      to: memberEmail,
      subject: subject,
      htmlBody: buildSpotUpEmail(origName, dayMeal, time, memberName, claimUrl)
    });
  }
}

function claimViaToken(token) {
  // Acquire a script-level lock so simultaneous clicks serialize — the second
  // caller waits, then reads fresh data and sees the spot is already claimed.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // wait up to 10 s; throws if timed out
  } catch(e) {
    return { error: 'busy', message: 'Server busy — please try again in a moment.' };
  }

  try {
    var sheet = getClaimTokensSheet();
    if (sheet.getLastRow() < 2) return { error: 'not_found', message: 'Invalid link.' };
    // Re-read inside the lock so we always see the latest state
    var data = sheet.getDataRange().getValues();

    for (var r = 1; r < data.length; r++) {
      if (data[r][0].toString() !== token) continue;

      if (data[r][6] === true || data[r][6] === 'TRUE') {
        return { error: 'already_used', message: 'This link has already been used.' };
      }

      var monday = data[r][1].toString();
      var dayIdx = parseInt(data[r][2]);
      var origName = data[r][3].toString();
      var time = data[r][4].toString();
      var recipientEmail = data[r][5].toString();

      var member = checkMember(recipientEmail);
      if (!member.authorized) return { error: 'not_member', message: 'Your email is not on the member list.' };
      var claimerName = member.name || recipientEmail;

      // claimSpotUp checks spotUpStatus === 'spotup' before writing — acts as
      // a second guard in case two different-token callers race past the check above
      var claimResult = claimSpotUp(monday, dayIdx, origName, time, claimerName);
      if (claimResult.error) {
        return { error: 'claim_failed', message: 'This spot was already claimed by someone else.' };
      }

      // Invalidate every token for this spot so all remaining email links stop working
      for (var i = 1; i < data.length; i++) {
        if (data[i][1].toString() === monday &&
            parseInt(data[i][2]) === dayIdx &&
            data[i][3].toString() === origName &&
            data[i][4].toString() === time &&
            !(data[i][6] === true || data[i][6] === 'TRUE')) {
          sheet.getRange(i + 1, 7).setValue(true);
        }
      }

      return { status: 'ok', claimerName: claimerName, origName: origName, monday: monday, dayIdx: dayIdx };
    }
    return { error: 'not_found', message: 'Link not found or expired.' };

  } finally {
    lock.releaseLock();
  }
}


// ═══════════════════════════════════════════════════════════════
//  ONE-TIME UTILITY — run manually from the Apps Script editor
// ═══════════════════════════════════════════════════════════════

/**
 * Run this once from the Apps Script editor (select function → Run)
 * to recolor all existing week display sheets with the latest formatting
 * (early plate = light blue, allergies = purple, grad gasman = gold, etc.)
 */
function rebuildAllWeekSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var rebuilt = 0;
  sheets.forEach(function(sheet) {
    // Only target Week_YYYY-MM-DD display sheets (not _data or _config)
    if (/^Week_\d{4}-\d{2}-\d{2}$/.test(sheet.getName())) {
      var monday = sheet.getName().replace('Week_', '');
      Logger.log('Rebuilding: ' + sheet.getName());
      rebuildDisplaySheet(sheet, monday);
      rebuilt++;
    }
  });
  Logger.log('Done — rebuilt ' + rebuilt + ' week sheet(s).');
}
