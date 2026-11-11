'use strict';

function partySize(signup) {
  const guests = Array.isArray(signup && signup.guests) ? signup.guests : [];
  const named = guests.map(guest => String(guest || '').trim()).filter(Boolean);
  return 1 + named.length;
}

function boardWeek(loaded) {
  const seats = {};
  const signups = loaded.signups || {};
  for (const dayIdx of Object.keys(signups)) {
    const byTime = {};
    for (const signup of signups[dayIdx] || []) {
      const time = signup.time || '';
      byTime[time] = (byTime[time] || 0) + partySize(signup);
    }
    seats[dayIdx] = byTime;
  }
  return {
    monday: loaded.monday,
    config: loaded.config,
    caps: loaded.caps,
    freezeDate: loaded.freezeDate,
    freezeAt: loaded.freezeAt,
    roster: false,
    seats
  };
}

// selfName: the verified member's own name; their rows carry diet/allergies so edits can show them
function rosterSignup(signup, kitchen, selfName) {
  const row = {
    name: signup.name || '',
    time: signup.time,
    early: signup.early,
    notes: signup.notes || '',
    guests: signup.guests,
    timestamp: signup.timestamp,
    gradGasman: signup.gradGasman,
    spotUpStatus: signup.spotUpStatus || '',
    spotUpOrigName: signup.spotUpOrigName || '',
    spotUpClaimedBy: signup.spotUpClaimedBy || '',
    servedStatus: signup.servedStatus || ''
  };
  const own = !!selfName && String(signup.name || '').trim().toLowerCase() === selfName;
  if (kitchen || own) {
    row.diet = signup.diet;
    row.allergies = signup.allergies;
  }
  return row;
}

function rosterWeek(loaded, kitchen, selfName) {
  const signups = {};
  for (const dayIdx of Object.keys(loaded.signups || {})) {
    signups[dayIdx] = (loaded.signups[dayIdx] || []).map(signup => rosterSignup(signup, kitchen, selfName));
  }
  return {
    monday: loaded.monday,
    config: loaded.config,
    caps: loaded.caps,
    freezeDate: loaded.freezeDate,
    freezeAt: loaded.freezeAt,
    roster: true,
    signups
  };
}

function presentWeek(loaded, audience) {
  if (audience && audience.roster) {
    const selfName = audience.self ? String(audience.self).trim().toLowerCase() : '';
    return rosterWeek(loaded, !!audience.kitchen, selfName);
  }
  return boardWeek(loaded);
}

/**
 * The name whose rows carry private fields for this viewer: a verified member's
 * members-list name. With auto-register on, members choose that name themselves,
 * so it proves nothing (same rule as event signups).
 */
function ownRowName(user, settings) {
  if (!user || !user.isMember || !user.memberName) return '';
  if (settings && settings.autoRegister) return '';
  return user.memberName;
}

module.exports = { presentWeek, ownRowName };
