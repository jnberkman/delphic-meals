# CLAUDE.md — Delphic Club Meal Sign-Ups

## Project Overview

A meal sign-up web application for the Delphic Club. Members sign up for weekly meals (lunch/dinner), manage dietary preferences, and handle "spot up" (giving up a meal spot for someone else to claim). Admins configure weekly schedules, manage members, and create special events.

## Architecture

**Frontend**: Single-file static site (`index.html`, ~3700 lines) hosted on **GitHub Pages** at `rmeek-robot.github.io/delphic-meals/`. Contains all HTML, CSS, and vanilla JavaScript in one file — no build step, no framework, no bundler.

**Backend**: Google Apps Script (`Appscripts/Code.gs`, ~1350 lines) deployed as a web app. Uses Google Sheets as the database. The frontend communicates with the backend via `apiCall()` which POSTs JSON to a hardcoded `SCRIPT_URL`.

**Deployment**: `clasp` (Google Apps Script CLI) is used to push `Code.gs` to Google Apps Script. A watcher script (`Appscripts/watch.js`) auto-pushes and deploys on save.

## File Structure

```
index.html                  # Entire frontend (HTML + CSS + JS)
Appscripts/
  Code.gs                   # Backend — Google Apps Script (all server logic)
  .clasp.json               # clasp config (script ID, file extensions)
  appsscript.json           # Apps Script manifest (timezone, runtime, webapp config)
  watch.js                  # Node.js file watcher: auto clasp push + deploy on save
  .claspignore              # Files clasp should ignore
.vscode/
  tasks.json                # VS Code tasks: watch/deploy Apps Script, deploy frontend
  keybindings.json          # VS Code keybindings
```

## Key Conventions

### Frontend (index.html)

- **No frameworks** — plain vanilla JS, all in `<script>` tags within `index.html`
- **CSS variables** defined in `:root` for theming (gold accent `--accent`, muted earth tones)
- **Fonts**: Cormorant Garamond (headings), Crimson Pro (body/serif), Jost (UI/sans-serif)
- **Tabs**: Sign Up, View Signups, Calendar (hidden), Events (hidden), Moose, Admin (admin-only)
- **API communication**: All backend calls go through `apiCall(action, data)` which POSTs to `SCRIPT_URL`
- **Auth**: Google OAuth2 redirect-based sign-in (`id_token` implicit flow). Fallback access code: `ACCESS_CODE`
- **Client-side caching**: `getCache()`/`setCache()` with 10-minute TTL for API responses
- **State**: `currentUser` object, week data stored in module-level variables, preferences in `localStorage` (`delphic_prefs`)
- **Constants shared with backend**: `DAYS`, `DEFAULT_MEALS`, `CATEGORIES` are duplicated in both files — keep them in sync

### Backend (Code.gs)

- **Entry points**: `doGet(e)` and `doPost(e)` — both route to `handleRequest(data)` which dispatches by `data.action`
- **Data storage**: Google Sheets — one spreadsheet per purpose (weeks, members, settings, events, claim tokens)
- **Sheet naming**: Week sheets named by Monday date (e.g., `2026-03-02`), with a companion `data_2026-03-02` sheet for raw signups
- **Actions** (API endpoints): `getWeek`, `addSignups`, `removeSignup`, `setWeekConfig`, `spotUp`, `claimSpotUp`, `unclaimSpotUp`, `cancelSpotUp`, `markServed`, `checkMember`, `getMembers`, `addMember`, `removeMember`, `requestAccess`, `getAccessRequests`, `approveAccessRequest`, `denyAccessRequest`, `getSettings`, `setSettings`, `setNotifyEmail`, `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `addEventSignup`, `removeEventSignup`
- **Email**: `MailApp.sendEmail()` for spot-up notifications and access request alerts
- **Runtime**: V8, timezone `America/New_York`

## Development Workflow

### Frontend changes
1. Edit `index.html`
2. Commit and push to `main` branch
3. GitHub Pages auto-deploys

### Backend changes
1. Edit `Appscripts/Code.gs`
2. Deploy via `clasp push` + `clasp deploy` (or use the `watch.js` auto-deploy watcher)
3. The VS Code task "Watch & Deploy Apps Script" runs `watch.js` on folder open

### No build/test/lint tooling
There is **no** package.json, no test suite, no linter, and no build step. Changes are tested manually in-browser.

## Important Notes

- The entire frontend is a single HTML file — when making changes, be mindful of the file size and keep related code near existing patterns
- `SCRIPT_URL` in `index.html` and `DEPLOYMENT_ID` in `watch.js` must point to the same Apps Script deployment
- The `scriptId` in `.clasp.json` identifies the Apps Script project
- Week data uses Monday dates as keys (ISO format: `YYYY-MM-DD`)
- "Spot Up" = a member gives up their meal spot; others can claim it via in-app button or email link
- "Ink" (formerly RSVP) = interest/attendance tracking on events
- The Moose tab shows special events with calendar-style pills
- Admin features are gated by `isAdmin` flag from the members sheet
- `interestOnly` admin setting controls whether events show full signup or just interest tracking
