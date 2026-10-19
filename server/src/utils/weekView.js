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

function rosterSignup(signup, kitchen) {
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
  if (kitchen) {
    row.diet = signup.diet;
    row.allergies = signup.allergies;
  }
  return row;
}

function rosterWeek(loaded, kitchen) {
  const signups = {};
  for (const dayIdx of Object.keys(loaded.signups || {})) {
    signups[dayIdx] = (loaded.signups[dayIdx] || []).map(signup => rosterSignup(signup, kitchen));
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
  if (audience && audience.roster) return rosterWeek(loaded, !!(audience && audience.kitchen));
  return boardWeek(loaded);
}

module.exports = { presentWeek };
