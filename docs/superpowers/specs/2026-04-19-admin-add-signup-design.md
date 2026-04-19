# Admin "Add Name" on View Signups — Design

## Summary

An admin-only quick-add affordance on the View Signups tab. Admins click **+ Add name** on a day card, type a name (autocomplete from the members list, free-text allowed for guests), optionally pick a time slot, and submit. Adds a signup on the member's behalf, bypassing the week's freeze date and capacity caps.

## Goals

- Let admins add someone to a meal without having to log in as that person or re-open the week config.
- Keep it in-context with existing signups, so admins see what's there before adding.
- Don't degrade the member-facing `addSignups` action — admin overrides live on a separate endpoint.

## Non-goals

- No diet/allergies/notes/early/grad-gasman inputs — admins can fix those later via other means if needed, or the member can update their own signup.
- No bulk add.
- No GroupMe/email notification on admin-add (not a spot-up).
- Not available to non-admin members.

## User flow

1. Admin opens View Signups tab and selects a week.
2. On each day card (both mobile single-day view and desktop horizontal view), an admin-only **+ Add name** button appears at the bottom of the signup list.
3. Clicking expands an inline form:
   - Name input with `<datalist>` autocomplete populated from the members list (name field only).
   - Time dropdown — shown only if the day has 2+ time slots; hidden for single-slot days.
   - **Add** button + **✕** cancel.
4. On submit:
   - Request goes to `adminAddSignup` API action.
   - Toast: "Added [Name] to [Day] [Meal]".
   - Week cache cleared; `loadViewData` reloads so the new signup appears.
5. On success with an empty input, the form remains collapsed (no-op).

## Backend

### New action: `adminAddSignup`

- Added to `ADMIN_ACTIONS` in `server/src/middleware/auth.js`.
- Handler in `server/src/handlers/meals.js`.
- Wired in `server/src/routes/api.js`.

**Input:** `{ monday, dayIndex, name, time }`

**Behavior:**
- Ensures week config exists (same pattern as `addSignups`).
- **Skips** the freeze-date check.
- **Skips** the capacity cap check.
- Upserts: deletes any existing signup for that `name + day` first, then inserts.
- Inserts with defaults:
  - `diet: 'No Dietary Restrictions'`
  - `allergies: ''`
  - `notes: ''`
  - `early: false`
  - `grad_gasman: false`
  - `time: normalizeTime(time)` (defaults to the day's first time if not supplied)
- Fires sheets-sync for the week (fire-and-forget), matching existing pattern.

**Return:** `{ added: 1 }` on success, or `{ error: '...' }` on failure (e.g. missing name).

**Why a separate action?** The member-facing `addSignups` must never bypass caps/freeze, even if a malicious client sends a flag. Separating the admin override into its own `ADMIN_ACTIONS`-gated endpoint keeps auth boundaries explicit and makes the intent obvious in logs.

## Frontend (`server/index.html`)

### Rendering

- Modify `renderViewDay` (mobile) and `renderHorizontalView` (desktop) to append an admin-only block after the signup list for each day. Gate on `currentUser?.isAdmin`.
- Block starts collapsed showing just the **+ Add name** button.
- Expanded state shows: name input, time dropdown (conditional), Add button, ✕ cancel.

### Member autocomplete

- Module-level `adminMembersCache` variable holds the members list after first fetch.
- On first admin expand of the block, call `apiCall('getMembers')` once and cache the result.
- Render a `<datalist id="adminAddMembersList">` once per rendered view, populated from the cache, containing `member.name` values only (not emails).
- Name input uses `list="adminAddMembersList"` for native browser autocomplete.

### Submit

- Click handler calls `apiCall('adminAddSignup', { monday, dayIndex, name, time })`.
- On success: clear `weekCache[monday]` and `weekCacheTs[monday]`, call `loadViewData(false)` to refresh, show toast via existing `showToast`.
- Collapse the form.

### Auth cache

- `adminMembersCache` is cleared on sign-out (wherever `currentUser` is cleared).

## Files touched

- `server/src/middleware/auth.js` — add `'adminAddSignup'` to `ADMIN_ACTIONS`.
- `server/src/handlers/meals.js` — new `adminAddSignup` handler; add to module exports.
- `server/src/routes/api.js` — route new action to handler.
- `server/index.html` — admin block rendering in `renderViewDay` and `renderHorizontalView`; handler functions; `adminMembersCache`; hook up `<datalist>`.

## Edge cases

- **Duplicate name on same day:** existing upsert behavior — silently replaces (acceptable; admin action).
- **Empty name submitted:** toast "Please enter a name", do not submit.
- **Day has no configured times:** fall back to a default ("12:00 PM"); matches existing `normalizeTime` behavior.
- **Sign-out while expanded:** `adminMembersCache` cleared; admin block hidden on re-render because `currentUser?.isAdmin` is false.
- **Non-admin somehow sends `adminAddSignup`:** middleware returns `{ error: 'Admin access required' }`.
