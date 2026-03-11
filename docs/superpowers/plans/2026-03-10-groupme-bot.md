# GroupMe Bot for Spot-Up Claims — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a member spots up on the website, post a GroupMe message; first person to reply "claim" within 2 hours gets the spot.

**Architecture:** New GroupMe service module (fire-and-forget, no-ops without credentials), a callback route for incoming messages, a migration for timestamp tracking, and a hook in the spotUp handler.

**Tech Stack:** Node.js, Express, native `fetch`, PostgreSQL via Knex

**Note:** This project has no test framework. Steps skip TDD accordingly.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/migrations/002_add_spotted_up_at.js` | Add `spotted_up_at` column to signups |
| `server/src/services/groupme.js` | GroupMe API wrapper: post messages, look up real member names |
| `server/src/routes/groupme.js` | Callback route: receive messages, handle "claim" keyword |

### Modified Files
| File | Change |
|------|--------|
| `server/src/config.js` | Add 4 GroupMe env vars |
| `server/src/db/queries/signups.js` | Add `findOldestSpotUpForUpdate()` query |
| `server/src/handlers/spotup.js` | Set `spotted_up_at`, call `groupme.postMessage()` |
| `server/src/index.js` | Mount `/groupme` route |
| `server/.env.example` | Add GroupMe env vars |

---

## Chunk 1: Database & Config

### Task 1: Migration — add spotted_up_at column

**Files:**
- Create: `server/migrations/002_add_spotted_up_at.js`

- [ ] **Step 1: Create migration file**

```javascript
exports.up = function (knex) {
  return knex.schema.alterTable('signups', (t) => {
    t.timestamp('spotted_up_at', { useTz: true }).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('signups', (t) => {
    t.dropColumn('spotted_up_at');
  });
};
```

- [ ] **Step 2: Run migration locally**

Run: `cd server && npm run migrate`
Expected: Migration completes, `spotted_up_at` column added to signups table.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/002_add_spotted_up_at.js
git commit -m "Add spotted_up_at column to signups table"
```

---

### Task 2: Config — add GroupMe env vars

**Files:**
- Modify: `server/src/config.js:1-28`
- Modify: `server/.env.example`

- [ ] **Step 1: Add GroupMe config to config.js**

Add after the `googleClientId` line (line 27), before the closing `};`:

```javascript
  // GroupMe bot
  groupmeBotId: process.env.GROUPME_BOT_ID || '',
  groupmeAccessToken: process.env.GROUPME_ACCESS_TOKEN || '',
  groupmeGroupId: process.env.GROUPME_GROUP_ID || '',
  groupmeCallbackSecret: process.env.GROUPME_CALLBACK_SECRET || ''
```

- [ ] **Step 2: Add env vars to .env.example**

Append to the end of `.env.example`:

```
# GroupMe bot
GROUPME_BOT_ID=              # Bot ID from dev.groupme.com
GROUPME_ACCESS_TOKEN=        # Access token from dev.groupme.com
GROUPME_GROUP_ID=            # Group ID for the Delphic chat
GROUPME_CALLBACK_SECRET=     # Secret token in callback URL path
```

- [ ] **Step 3: Commit**

```bash
git add server/src/config.js server/.env.example
git commit -m "Add GroupMe environment variables to config"
```

---

## Chunk 2: GroupMe Service

### Task 3: GroupMe service — API wrapper

**Files:**
- Create: `server/src/services/groupme.js`

- [ ] **Step 1: Create the service file**

```javascript
const config = require('../config');

const GROUPME_API = 'https://api.groupme.com/v3';

/**
 * Check if GroupMe integration is configured.
 */
function isConfigured() {
  return !!(config.groupmeBotId && config.groupmeAccessToken && config.groupmeGroupId);
}

/**
 * Post a message to the GroupMe group via the bot.
 * Fire-and-forget — logs errors but never throws.
 */
async function postMessage(text) {
  if (!config.groupmeBotId) return;
  try {
    const res = await fetch(`${GROUPME_API}/bots/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: config.groupmeBotId, text })
    });
    if (!res.ok) {
      console.error('GroupMe post error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('GroupMe post error:', e.message);
  }
}

/**
 * Look up a GroupMe user's real name (not group nickname) by user_id.
 * Returns the name string, or null if not found.
 */
async function getMemberName(senderUserId) {
  if (!config.groupmeAccessToken || !config.groupmeGroupId) return null;
  try {
    const res = await fetch(
      `${GROUPME_API}/groups/${config.groupmeGroupId}?token=${config.groupmeAccessToken}`
    );
    if (!res.ok) {
      console.error('GroupMe group fetch error:', res.status);
      return null;
    }
    const data = await res.json();
    const member = data.response.members.find(m => m.user_id === senderUserId);
    return member ? member.name : null;
  } catch (e) {
    console.error('GroupMe member lookup error:', e.message);
    return null;
  }
}

module.exports = { isConfigured, postMessage, getMemberName };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/groupme.js
git commit -m "Add GroupMe service for posting messages and member lookup"
```

---

## Chunk 3: Signups Query & Callback Route

### Task 4: Signups query — find oldest unclaimed spot-up

**Files:**
- Modify: `server/src/db/queries/signups.js:75-79`

- [ ] **Step 1: Add findOldestSpotUpForUpdate function**

Add before the `module.exports` block (before line 75):

```javascript
/**
 * Find the oldest unclaimed spot-up within 2 hours for GroupMe claiming.
 * Uses SELECT ... FOR UPDATE for concurrency control.
 */
async function findOldestSpotUpForUpdate(trx) {
  return trx('signups')
    .where('spot_up_status', 'spotup')
    .whereNotNull('spotted_up_at')
    .whereRaw("spotted_up_at > NOW() - INTERVAL '2 hours'")
    .orderBy('spotted_up_at', 'asc')
    .forUpdate()
    .first();
}
```

Update the `module.exports` to include the new function:

```javascript
module.exports = {
  getByMonday, getByMondayAndDay, findSignup, findSignupByDayAndName,
  insert, deleteByDayAndName, update, countByTime,
  findSpotUpForUpdate, findClaimedForUpdate, findOldestSpotUpForUpdate
};
```

- [ ] **Step 2: Commit**

```bash
git add server/src/db/queries/signups.js
git commit -m "Add findOldestSpotUpForUpdate query for GroupMe claims"
```

---

### Task 5: GroupMe callback route

**Files:**
- Create: `server/src/routes/groupme.js`

- [ ] **Step 1: Create the route file**

```javascript
const { Router } = require('express');
const router = Router();
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('../services/groupme');
const sheetsSync = require('../services/sheetsSync');

/**
 * POST /groupme/callback/:secret
 * Receives messages from GroupMe. Processes "claim" keyword to award spot-ups.
 */
router.post('/callback/:secret', async (req, res) => {
  // Always respond 200 quickly — GroupMe expects it
  res.status(200).end();

  const { secret } = req.params;
  if (!config.groupmeCallbackSecret || secret !== config.groupmeCallbackSecret) return;

  const msg = req.body;
  if (!msg || msg.sender_type === 'bot') return;
  if (!msg.text || msg.text.trim().toLowerCase() !== 'claim') return;

  try {
    // Look up sender's real GroupMe name
    const claimerName = await groupme.getMemberName(msg.sender_id) || msg.name;
    if (!claimerName) return;

    // Find and claim the oldest available spot-up within 2 hours
    const result = await db.transaction(async (trx) => {
      const signup = await signupsDb.findOldestSpotUpForUpdate(trx);
      if (!signup) return null;

      await trx('signups').where('id', signup.id).update({
        name: claimerName,
        spot_up_status: 'claimed',
        spot_up_orig_name: signup.spot_up_orig_name,
        spot_up_claimed_by: claimerName
      });

      // Invalidate all email claim tokens for this spot
      await trx('claim_tokens')
        .where({ monday: signup.monday, day_idx: signup.day_index, orig_name: signup.spot_up_orig_name, time: signup.time, used: false })
        .update({ used: true });

      return signup;
    });

    if (!result) return;

    // Build confirmation message with day/meal context
    const weekCfg = await weeksDb.getConfig(result.monday);
    const cfg = weekCfg ? weekCfg.config : null;
    const dayInfo = cfg && cfg[result.day_index] ? cfg[result.day_index] : {};
    const dayMeal = (dayInfo.day && dayInfo.meal) ? `${dayInfo.day} ${dayInfo.meal}` : 'meal';

    groupme.postMessage(`${claimerName} claimed ${result.spot_up_orig_name}'s ${dayMeal} spot`);
    sheetsSync.syncWeek(result.monday).catch(e => console.error('Sheets sync error (week):', e.message));
  } catch (e) {
    console.error('GroupMe callback error:', e.message);
  }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/groupme.js
git commit -m "Add GroupMe callback route for claim processing"
```

---

## Chunk 4: Hook spotUp Handler & Mount Route

### Task 6: Hook the spotUp handler

**Files:**
- Modify: `server/src/handlers/spotup.js:1-35`

- [ ] **Step 1: Add groupme require at top**

Add after the `emailService` require (after line 6):

```javascript
const groupme = require('../services/groupme');
```

- [ ] **Step 2: Set spotted_up_at and post GroupMe message in spotUp function**

Replace the `signupsDb.update` call and the email section (lines 16-32) with:

```javascript
  await signupsDb.update(signup.id, {
    spot_up_status: 'spotup',
    spot_up_orig_name: name,
    spot_up_claimed_by: '',
    spotted_up_at: new Date()
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));

  // Get week config for day/meal context (used by both email and GroupMe)
  let dayMeal = 'a meal';
  try {
    const weekCfg = await weeksDb.getConfig(monday);
    const config = weekCfg ? weekCfg.config : null;
    const dayName = config && config[dayIndex] ? (config[dayIndex].day || '') : '';
    const mealType = config && config[dayIndex] ? (config[dayIndex].meal || '') : '';
    if (dayName && mealType) dayMeal = `${dayName} ${mealType}`;

    await emailService.sendSpotUpEmails(monday, dayIndex, name, timeNorm, config);
    sheetsSync.syncClaimTokens().catch(e => console.error('Sheets sync error (claim tokens):', e.message));
  } catch (e) {
    console.error('Spot-up email error:', e.message);
  }

  // Post to GroupMe (fire-and-forget)
  groupme.postMessage(`${name} spotted up for ${dayMeal}`);
```

- [ ] **Step 3: Clear spotted_up_at in cancelSpotUp**

In the `cancelSpotUp` function (line 91), add `spotted_up_at: null` to the update object:

```javascript
  await signupsDb.update(signup.id, {
    spot_up_status: '',
    spot_up_orig_name: '',
    spot_up_claimed_by: '',
    spotted_up_at: null
  });
```

- [ ] **Step 4: Reset spotted_up_at in unclaimSpotUp and re-notify GroupMe**

In the `unclaimSpotUp` function (line 70-74), add `spotted_up_at: new Date()` to reset the 2-hour window, and post a GroupMe message:

```javascript
    await trx('signups').where('id', signup.id).update({
      name: signup.spot_up_orig_name,
      spot_up_status: 'spotup',
      spot_up_claimed_by: '',
      spotted_up_at: new Date()
    });

    sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));

    // Re-notify GroupMe that the spot is available again
    const weeksDb = require('../db/queries/weeks');
    const weekCfg = await weeksDb.getConfig(monday);
    const cfg = weekCfg ? weekCfg.config : null;
    const dayInfo = cfg && cfg[dayIndex] ? cfg[dayIndex] : {};
    const dayMeal = (dayInfo.day && dayInfo.meal) ? `${dayInfo.day} ${dayInfo.meal}` : 'a meal';
    groupme.postMessage(`${signup.spot_up_orig_name}'s ${dayMeal} spot is available again`);

    return { status: 'ok' };
```

Note: `weeksDb` is already imported at line 3. The inline require above is just showing it's needed — use the existing import. The `groupme` import is added in Step 1 of this task.

- [ ] **Step 5: Commit**

```bash
git add server/src/handlers/spotup.js
git commit -m "Hook GroupMe bot into spot-up flow"
```

---

### Task 7: Mount route and update env example

**Files:**
- Modify: `server/src/index.js:11-13`

- [ ] **Step 1: Mount the GroupMe route in index.js**

Add after the `/health` route (after line 13):

```javascript
app.use('/groupme', require('./routes/groupme'));
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.js
git commit -m "Mount GroupMe callback route"
```

---

## Chunk 5: Manual Verification

### Task 8: Local smoke test

- [ ] **Step 1: Verify the server starts**

Run: `cd server && npm start`
Expected: `Delphic Meals API listening on port 3000` (no errors about missing GroupMe config — it should no-op silently)

- [ ] **Step 2: Test callback rejects bad secret**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/groupme/callback/wrong-secret -H 'Content-Type: application/json' -d '{"text":"claim","sender_type":"user","sender_id":"123","name":"Test"}'`
Expected: `200` (always returns 200 to GroupMe, but does nothing internally)

- [ ] **Step 3: Test callback ignores bot messages**

Run: `curl -X POST http://localhost:3000/groupme/callback/test-secret -H 'Content-Type: application/json' -d '{"text":"claim","sender_type":"bot","sender_id":"123","name":"Bot"}'`
Expected: `200`, no claim processed

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "GroupMe bot integration for spot-up claims"
```
