# Admin "Add Name" on View Signups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only "+ Add name" affordance on each day card in the View Signups tab, with a name input (autocomplete from members), time picker (when needed), and a new `adminAddSignup` API action that bypasses freeze date and capacity caps.

**Architecture:** New admin-only backend action on top of the existing 28-action dispatcher. Frontend rendering hooks into both `renderViewDay` (mobile) and `renderHorizontalView` (desktop) to append an admin-gated block. Members list is lazy-loaded once per session and cached in memory for autocomplete via a `<datalist>`.

**Tech Stack:** Express + PostgreSQL (Knex) backend, vanilla-JS single-HTML-file frontend. No test framework in use — this plan uses manual verification via `curl` and browser.

**Spec:** [docs/superpowers/specs/2026-04-19-admin-add-signup-design.md](../specs/2026-04-19-admin-add-signup-design.md)

---

## Task 1: Backend — `adminAddSignup` action

**Files:**
- Modify: `server/src/handlers/meals.js`
- Modify: `server/src/routes/api.js`
- Modify: `server/src/middleware/auth.js`

- [ ] **Step 1: Add `adminAddSignup` handler to `server/src/handlers/meals.js`**

After the `setWeekConfig` function (around line 116) and before `module.exports`, add:

```javascript
/**
 * Admin-only add of a single signup. Bypasses freeze date and capacity caps.
 * Used when an admin signs someone up on their behalf.
 */
async function adminAddSignup(monday, dayIndex, name, time) {
  if (!name || !String(name).trim()) {
    return { error: 'Name is required' };
  }

  let weekCfg = await weeksDb.getConfig(monday);
  if (!weekCfg) {
    const defaultCfg = buildDefaultConfig(monday);
    await weeksDb.upsertConfig(monday, defaultCfg, DEFAULT_CAPS, '');
    weekCfg = await weeksDb.getConfig(monday);
  }

  const cleanName = String(name).trim();
  const timeStr = normalizeTime(time);

  await signupsDb.deleteByDayAndName(monday, dayIndex, cleanName);

  await signupsDb.insert({
    monday,
    day_index: dayIndex,
    name: cleanName,
    diet: 'No Dietary Restrictions',
    allergies: '',
    time: timeStr,
    early: false,
    notes: '',
    grad_gasman: false
  });

  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return { added: 1, name: cleanName };
}
```

- [ ] **Step 2: Export the new handler**

Update the final line of `server/src/handlers/meals.js`:

```javascript
module.exports = { getWeek, addSignups, removeSignup, setWeekConfig, adminAddSignup };
```

- [ ] **Step 3: Wire up the new action in `server/src/routes/api.js`**

In the `handlers` object, in the Meals section (around line 20, after `setWeekConfig`), add:

```javascript
adminAddSignup:     (d) => mealsHandler.adminAddSignup(d.monday, d.dayIndex, d.name, d.time),
```

- [ ] **Step 4: Add to `ADMIN_ACTIONS` in `server/src/middleware/auth.js`**

In the `ADMIN_ACTIONS` set (lines 31-45), add `'adminAddSignup'`:

```javascript
const ADMIN_ACTIONS = new Set([
  'getMembers',
  'addMember',
  'removeMember',
  'getAccessRequests',
  'approveAccessRequest',
  'denyAccessRequest',
  'setSettings',
  'setWeekConfig',
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'markServed',
  'setNotifyEmail',
  'adminAddSignup',
]);
```

- [ ] **Step 5: Start local server and verify backend**

In one terminal:

```bash
cd server && npm start
```

Server should log `Server listening on :3000` (or whatever `PORT` is set to).

- [ ] **Step 6: Verify unauth request is rejected**

In a separate terminal:

```bash
curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -d '{"action":"adminAddSignup","monday":"2026-04-20","dayIndex":0,"name":"Test Member","time":"12:00 PM"}'
```

Expected output: `{"error":"Authentication required"}`

- [ ] **Step 7: Verify non-admin guest is rejected**

If `ACCESS_CODE` is set in `server/.env`, test guest rejection:

```bash
curl -s -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -d '{"action":"adminAddSignup","monday":"2026-04-20","dayIndex":0,"name":"Test Member","time":"12:00 PM","accessCode":"<your-access-code>"}'
```

Expected output: `{"error":"Authentication required"}` (access code does not grant admin).

If you don't have `ACCESS_CODE` set, skip this step.

- [ ] **Step 8: Stop the server and commit**

Ctrl-C the server, then:

```bash
git add server/src/handlers/meals.js server/src/routes/api.js server/src/middleware/auth.js
git commit -m "Add adminAddSignup action for admin-on-behalf signups

Bypasses freeze date and capacity caps. Admin-gated via ADMIN_ACTIONS.
Inserts with default diet and blank allergies/notes."
```

---

## Task 2: Frontend — admin add-name block renderer + state

**Files:**
- Modify: `server/index.html`

All changes are inside the `<script>` section of the single-page frontend.

- [ ] **Step 1: Add module-level members cache and lazy-load function**

Find the end of the `loadMembers` function (around line 3002). Immediately after the closing `}` of `loadMembers`, insert this new block:

```javascript
// =============================================
//  ADMIN ADD-NAME (View Signups tab)
// =============================================
let adminMembersCache = null;

async function ensureAdminMembersCache() {
  if (adminMembersCache) return adminMembersCache;
  try {
    const result = await apiCall('getMembers');
    adminMembersCache = (result.members || []).filter(m => m.name && m.name.trim());
  } catch (e) {
    adminMembersCache = [];
  }
  const dl = document.getElementById('adminAddMembersList');
  if (dl) {
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    adminMembersCache.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      dl.appendChild(opt);
    });
  }
  return adminMembersCache;
}

function renderAdminAddNameBlock(monday, dayIdx, dayTimes) {
  const blockId = 'adminAdd_' + dayIdx;
  const timeSelect = dayTimes.length > 1
    ? '<select id="' + blockId + '_time" style="font-size:12px;padding:5px 24px 5px 8px;width:auto;">' +
        dayTimes.map(t => '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>').join('') +
      '</select>'
    : '<input type="hidden" id="' + blockId + '_time" value="' + escapeHtml(dayTimes[0] || '12:00 PM') + '">';

  return '<div class="admin-add-block" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);">' +
    '<button id="' + blockId + '_toggle" class="btn btn-secondary" style="font-size:12px;padding:6px 12px;width:auto;" ' +
      'onclick="toggleAdminAddBlock(\'' + monday + '\',' + dayIdx + ')">+ Add name</button>' +
    '<div id="' + blockId + '_form" style="display:none;align-items:center;gap:6px;flex-wrap:wrap;">' +
      '<input type="text" id="' + blockId + '_name" list="adminAddMembersList" placeholder="Name" autocomplete="off" ' +
        'style="font-size:13px;padding:6px 8px;flex:1;min-width:140px;" ' +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();submitAdminAddSignup(\'' + monday + '\',' + dayIdx + ');}">' +
      timeSelect +
      '<button class="btn btn-primary" style="font-size:12px;padding:6px 12px;width:auto;" ' +
        'onclick="submitAdminAddSignup(\'' + monday + '\',' + dayIdx + ')">Add</button>' +
      '<button class="btn btn-secondary" style="font-size:12px;padding:6px 10px;width:auto;" ' +
        'onclick="toggleAdminAddBlock(\'' + monday + '\',' + dayIdx + ')" title="Cancel">&#x2715;</button>' +
    '</div>' +
  '</div>';
}

async function toggleAdminAddBlock(monday, dayIdx) {
  const blockId = 'adminAdd_' + dayIdx;
  const form = document.getElementById(blockId + '_form');
  const btn = document.getElementById(blockId + '_toggle');
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  if (isOpen) {
    form.style.display = 'none';
    if (btn) btn.style.display = '';
  } else {
    form.style.display = 'flex';
    if (btn) btn.style.display = 'none';
    await ensureAdminMembersCache();
    const input = document.getElementById(blockId + '_name');
    if (input) { input.value = ''; input.focus(); }
  }
}

async function submitAdminAddSignup(monday, dayIdx) {
  const blockId = 'adminAdd_' + dayIdx;
  const nameEl = document.getElementById(blockId + '_name');
  const timeEl = document.getElementById(blockId + '_time');
  const name = (nameEl && nameEl.value || '').trim();
  const time = (timeEl && timeEl.value) || '12:00 PM';
  if (!name) { showToast('Enter a name', 'var(--red)'); return; }

  try {
    const result = await apiCall('adminAddSignup', { monday, dayIndex: dayIdx, name, time });
    if (result && result.error) {
      showToast(result.error, 'var(--red)');
      return;
    }
    const dayInfo = (viewEnabledDays || []).find(d => d.configIdx === dayIdx);
    const label = dayInfo ? (dayInfo.day.day + ' ' + dayInfo.day.meal) : 'meal';
    showToast('Added ' + name + ' to ' + label);
    delete weekCache[monday];
    delete weekCacheTs[monday];
    await loadViewData(false);
  } catch (e) {
    // apiCall already toasts on error
  }
}
```

Note: the members list is populated into the `<datalist>` using DOM methods (`createElement`/`appendChild`) rather than string injection, avoiding any XSS risk from stored member names.

- [ ] **Step 2: Add a shared `<datalist>` to the View Signups tab markup**

Locate the `<div id="tab-view"` section. Find the `<div id="viewContent"` element. Immediately BEFORE that div, insert:

```html
<datalist id="adminAddMembersList"></datalist>
```

This datalist lives once in the DOM and is populated lazily by `ensureAdminMembersCache`.

- [ ] **Step 3: Clear `adminMembersCache` on sign-out**

Find where sign-out clears `delphic_id_token` from `sessionStorage`. Search the file for:

```
delphic_id_token
```

Locate the sign-out function (likely named `signOut`, `signout`, or `logout`). In that function, before `currentUser = null` or similar reset logic, add:

```javascript
adminMembersCache = null;
```

If the sign-out logic has multiple branches, add it to each. It's safe to add even if the cache wasn't populated.

- [ ] **Step 4: Commit**

```bash
git add server/index.html
git commit -m "Add admin add-name renderer, cache, and submit handler

Lazy-loads members list on first expand. Shared datalist for autocomplete.
Submit bypasses freeze/caps via adminAddSignup, refreshes view, toasts."
```

---

## Task 3: Frontend — wire into `renderViewDay` (mobile)

**Files:**
- Modify: `server/index.html`

- [ ] **Step 1: Append admin block to `renderViewDay`**

Locate the `renderViewDay` function (around line 1868). Find the closing of the card, currently:

```javascript
  if (!spotUpEnabled) {
    html += '<div style="margin-top:18px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:center;font-family:\'Crimson Pro\',serif;font-size:15px;color:var(--text-dim);font-style:italic;">Put spot ups in chat</div>';
  }
  html += '</div>';
  document.getElementById('viewContent').innerHTML = html;
}
```

Immediately before the line `html += '</div>';` (the closing div of the card), add:

```javascript
  if (currentUser && currentUser.isAdmin) {
    html += renderAdminAddNameBlock(viewMonday, i, times);
  }
```

Full replacement context for clarity — the tail of `renderViewDay` becomes:

```javascript
  if (!spotUpEnabled) {
    html += '<div style="margin-top:18px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:center;font-family:\'Crimson Pro\',serif;font-size:15px;color:var(--text-dim);font-style:italic;">Put spot ups in chat</div>';
  }
  if (currentUser && currentUser.isAdmin) {
    html += renderAdminAddNameBlock(viewMonday, i, times);
  }
  html += '</div>';
  document.getElementById('viewContent').innerHTML = html;
}
```

- [ ] **Step 2: Manual verification (mobile / narrow window)**

Start the server:

```bash
cd server && npm start
```

Open `http://localhost:3000` in a browser, resize the window narrower than 900px (or use devtools responsive mode).

Sign in as an admin user. Go to the View Signups tab. Pick a week that has at least one configured day.

Expected:
- A **+ Add name** button appears at the bottom of the day card.
- Click it. The button hides; a name input, (conditional) time dropdown, **Add** button, and **✕** appear.
- Start typing a member name. The browser's native autocomplete should suggest members.
- Click ✕ — the form collapses and the button reappears.

Sign out, sign in as a **non-admin** member. The admin block should NOT appear.

- [ ] **Step 3: Commit**

```bash
git add server/index.html
git commit -m "Render admin add-name block in mobile renderViewDay"
```

---

## Task 4: Frontend — wire into `renderHorizontalView` (desktop)

**Files:**
- Modify: `server/index.html`

- [ ] **Step 1: Append admin block to each column in `renderHorizontalView`**

Locate `renderHorizontalView` (around line 1978). Find the tail of the per-column rendering:

```javascript
    html += '</div></div>'; // body + col
  });

  html += '</div>';
  document.getElementById('viewContent').innerHTML = html;
}
```

The `</div></div>` closes the column body and the column itself. We need the admin block inside the column body but after all slot rendering. Replace `html += '</div></div>'; // body + col` with:

```javascript
    html += '</div>'; // close body
    if (isAdmin) {
      html += '<div class="view-day-col-admin" style="padding:8px 10px;">' +
        renderAdminAddNameBlock(viewMonday, i, times) +
        '</div>';
    }
    html += '</div>'; // close col
```

The `isAdmin` variable is already defined earlier in `renderHorizontalView` at line 1982 (`const isAdmin = !!(currentUser && currentUser.isAdmin);`), so no new binding is needed.

- [ ] **Step 2: Manual verification (desktop / wide window)**

Resize the browser wider than 900px (or refresh at wide size). On the View Signups tab, as admin:

Expected:
- Each day column shows a **+ Add name** button at the bottom.
- Clicking it expands the inline form just like in mobile.
- Submitting adds the person — toast appears, list refreshes, new name shows up in the list.
- Inputs in one column do NOT collide with another column (each has a unique `blockId` derived from `dayIdx`).

Sign out, sign in as non-admin. Admin blocks should not render.

- [ ] **Step 3: Commit**

```bash
git add server/index.html
git commit -m "Render admin add-name block in desktop renderHorizontalView"
```

---

## Task 5: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Happy path — basic add**

As admin, on the View Signups tab:
1. Pick a week with at least one enabled day.
2. Note the current count on that day (e.g. "3/45 signed up").
3. Click **+ Add name**, type `QA Test User`, click Add.
4. Expected: toast "Added QA Test User to [Day] [Meal]", count increments, name appears in the list.

- [ ] **Step 2: Autocomplete pulls from members**

Click **+ Add name**, begin typing a member's first name. Expected: datalist dropdown shows matching member names.

- [ ] **Step 3: Freeze-date bypass**

1. Go to Admin tab → week config for the current week, set the freeze date to a past date/time, save.
2. Return to View Signups, try to add a name via the admin block.
3. Expected: succeeds (toast + count increments), even though the freeze is in the past.
4. As a counter-test, try a regular sign-up via the Sign Up tab as a non-admin — should be blocked by freeze.

- [ ] **Step 4: Capacity bypass**

1. Go to Admin tab, temporarily set the cap for a slot to `1`.
2. In View Signups, add two names to that slot via the admin block.
3. Expected: both succeed. The slot will display `2/1` — this is acceptable (UI shows the overage).
4. Restore the cap when done.

- [ ] **Step 5: Time-slot selection (multi-slot day)**

On a day with multiple time slots (e.g., lunch 12:00 / 1:00):
1. Click + Add name.
2. The time dropdown should show all configured slot times.
3. Pick the second slot, submit a name, verify it appears under that slot in the list.

- [ ] **Step 6: Empty name rejection**

Click + Add name, leave name blank, click Add. Expected: toast "Enter a name", no request sent.

- [ ] **Step 7: Non-admin cannot see or call the action**

1. Sign in as a non-admin member. View Signups tab shows no **+ Add name** button anywhere.
2. From devtools console, try: `await apiCall('adminAddSignup', { monday: '2026-04-20', dayIndex: 0, name: 'Hacker', time: '12:00 PM' })`
3. Expected: `{ error: 'Admin access required' }`.

- [ ] **Step 8: Sign-out clears cache**

As admin, expand the add block at least once (populates `adminMembersCache`). Sign out, sign in as a different admin. Expand the add block — should re-fetch members (check network tab for a new `getMembers` call).

- [ ] **Step 9: No regressions on non-admin view**

As non-admin member, verify:
- View Signups still renders correctly.
- Spot-up flow still works.
- Regular sign-ups still work.

- [ ] **Step 10: Final commit if any fixes were needed**

If any bugs surfaced during verification, fix them and commit separately. Otherwise this task has no commit.

---

## Self-Review Notes

**Spec coverage check:** All spec requirements mapped to tasks:
- Admin-only UI on View Signups → Task 3 (mobile), Task 4 (desktop)
- Autocomplete from members by name → Task 2 (cache + datalist)
- Time dropdown when 2+ slots → Task 2 (`renderAdminAddNameBlock` conditional)
- Bypass freeze and caps → Task 1 (handler omits those checks)
- New `adminAddSignup` action in `ADMIN_ACTIONS` → Task 1
- Default diet "No Dietary Restrictions", blank allergies/notes → Task 1 handler
- Upsert on name+day → Task 1 handler
- Sheets-sync fire-and-forget → Task 1 handler
- Toast confirmation → Task 2 `submitAdminAddSignup`
- Cache cleared on sign-out → Task 2 Step 3
- Edge case: empty name → Task 2 client + Task 1 server both reject
- Edge case: non-admin attempts action → Task 1 (middleware)

**Type/naming consistency:** `adminAddSignup` used consistently in handler, route, auth, and frontend apiCall. `adminMembersCache`, `renderAdminAddNameBlock`, `toggleAdminAddBlock`, `submitAdminAddSignup`, `ensureAdminMembersCache` referenced consistently across tasks. `blockId = 'adminAdd_' + dayIdx` consistent in generation and lookup.
