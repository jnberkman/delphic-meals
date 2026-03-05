# CLAUDE.md — Delphic Club Meal Sign-Ups

## Project Overview

A meal sign-up web application for the Delphic Club. Members sign up for weekly meals (lunch/dinner), manage dietary preferences, and handle "spot up" (giving up a meal spot for someone else to claim). Admins configure weekly schedules, manage members, and create special events.

## Architecture

**Frontend**: Single-file static site (`index.html`, ~3700 lines) hosted on **GitHub Pages** at `rmeek-robot.github.io/delphic-meals/`. Contains all HTML, CSS, and vanilla JavaScript in one file — no build step, no framework, no bundler.

**Backend (dual)**:
- **Legacy — Google Apps Script** (`Appscripts/Code.gs`, ~1350 lines): Deployed as a web app. Uses Google Sheets as the database.
- **New — Node.js + Express + PostgreSQL** (`server/`): Deployed on **Railway**. All 27 API actions ported with identical request/response contracts. Optionally syncs mutations back to Google Sheets (fire-and-forget, gracefully no-ops without credentials).

**Frontend auto-detection**: `apiCall()` inspects `SCRIPT_URL` — if it contains `script.google.com`, uses GET with `?payload=` query param; otherwise POSTs JSON to `/api`. Currently `SCRIPT_URL` still points to Apps Script; swap to the Railway URL when ready to cut over.

**Deployment**:
- **Frontend**: Push to `main` → GitHub Pages auto-deploys
- **Apps Script backend**: `clasp push` + `clasp deploy` (or `watch.js` auto-deploy watcher)
- **Express backend**: Push to Railway via `railway up` from `server/`. Migrations run automatically on deploy (`npx knex migrate:latest && node src/index.js`)

## Quick Start

```bash
# Frontend (no build step)
open index.html   # or push to main for GitHub Pages deploy

# Express backend local dev
cd server && npm install && npm run migrate && npm start
```

## File Structure

```
index.html                  # Entire frontend (HTML + CSS + JS)
Appscripts/
  Code.gs                   # Legacy backend — Google Apps Script
  .clasp.json               # clasp config (script ID, file extensions)
  appsscript.json           # Apps Script manifest (timezone, runtime, webapp config)
  watch.js                  # Node.js file watcher: auto clasp push + deploy on save
  .claspignore              # Files clasp should ignore
server/                     # New backend — Node.js + Express + PostgreSQL
  package.json              # Dependencies: express, knex, pg, nodemailer, googleapis, cors, dotenv, uuid
  knexfile.js               # Knex config (reads DATABASE_URL)
  railway.toml              # Railway deployment config (nixpacks, health check, auto-migrate)
  .env.example              # Required environment variables
  migrations/
    001_initial_schema.js   # 8 tables: members, settings, access_requests, week_configs, signups, events, event_signups, claim_tokens
  scripts/
    migrate-from-sheets.js  # One-time data import from Google Sheets to PostgreSQL
  src/
    index.js                # Express entry point
    config.js               # Reads env vars with defaults
    routes/
      api.js                # Action-dispatch router (POST /api + GET /api?payload=)
      claim.js              # Email claim link handler (/claim?token=)
      health.js             # GET /health
    handlers/               # meals.js, spotup.js, members.js, access.js, settings.js, events.js
    db/
      knex.js               # Knex instance
      queries/              # signups.js, members.js, weeks.js, events.js, settings.js, accessRequests.js, claimTokens.js
    services/
      email.js              # Nodemailer wrapper
      emailTemplates.js     # 3 HTML email templates (spot-up notify, claim, access request)
      sheetsSync.js         # Fire-and-forget sync to Google Sheets on mutations
    utils/
      time.js               # Timezone helpers (America/New_York)
      weekHelpers.js        # Monday-date key utilities
    middleware/
      cors.js, errorHandler.js, auth.js (placeholder)
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
- **API communication**: All backend calls go through `apiCall(action, data)` which auto-detects Express vs Apps Script based on `SCRIPT_URL`
- **Auth**: Google OAuth2 redirect-based sign-in (`id_token` implicit flow). Fallback access code: `ACCESS_CODE`
- **Client-side caching**: `getCache()`/`setCache()` with 10-minute TTL for API responses
- **State**: `currentUser` object, week data stored in module-level variables, preferences in `localStorage` (`delphic_prefs`)
- **Constants shared with backend**: `DAYS`, `DEFAULT_MEALS`, `CATEGORIES` are duplicated in both `index.html` and `Code.gs` — keep them in sync

### Backend — Apps Script (Code.gs)

- **Entry points**: `doGet(e)` and `doPost(e)` — both route to `handleRequest(data)` which dispatches by `data.action`
- **Data storage**: Google Sheets — one spreadsheet per purpose (weeks, members, settings, events, claim tokens)
- **Sheet naming**: Week sheets named by Monday date (e.g., `2026-03-02`), with a companion `data_2026-03-02` sheet for raw signups
- **Email**: `MailApp.sendEmail()` for spot-up notifications and access request alerts
- **Runtime**: V8, timezone `America/New_York`

### Backend — Express (server/)

- **Entry point**: `server/src/index.js` — mounts `/api`, `/claim`, `/health` routes
- **Action dispatch**: `server/src/routes/api.js` maps `data.action` to handler functions (same 27 actions as Apps Script)
- **Database**: PostgreSQL via Knex query builder. 8 tables defined in `server/migrations/001_initial_schema.js`
- **Sheets sync**: `server/src/services/sheetsSync.js` — optional fire-and-forget sync to Google Sheets on every mutation. No-ops gracefully if `GOOGLE_SERVICE_ACCOUNT_KEY` is not set
- **Email**: Nodemailer (`server/src/services/email.js`) with HTML templates (`emailTemplates.js`)
- **Claim route**: `GET /claim?token=` with PostgreSQL row-level locking for spot-up claims via email links

### API Actions (both backends)

`ping`, `getWeek`, `addSignups`, `removeSignup`, `setWeekConfig`, `spotUp`, `claimSpotUp`, `unclaimSpotUp`, `cancelSpotUp`, `markServed`, `checkMember`, `getMembers`, `addMember`, `removeMember`, `requestAccess`, `getAccessRequests`, `approveAccessRequest`, `denyAccessRequest`, `getSettings`, `setSettings`, `setNotifyEmail`, `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `addEventSignup`, `removeEventSignup`

## Development Workflow

### Frontend changes
1. Edit `index.html`
2. Commit and push to `main` branch
3. GitHub Pages auto-deploys

### Apps Script backend changes
1. Edit `Appscripts/Code.gs`
2. Deploy via `clasp push` + `clasp deploy` (or use the `watch.js` auto-deploy watcher)
3. The VS Code task "Watch & Deploy Apps Script" runs `watch.js` on folder open

### Express backend changes
1. Edit files in `server/`
2. Local dev: `cd server && npm install && npm run migrate && npm start`
3. Requires `DATABASE_URL` in `server/.env` (see `server/.env.example` for all env vars)
4. Deploy to Railway: `railway up` from `server/` (migrations run automatically on deploy)
5. Available scripts: `npm start`, `npm run migrate`, `npm run migrate:rollback`, `npm run seed`, `npm run import`

### Environment variables (Express backend)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default 3000) |
| `FRONTEND_URL` | CORS allowed origin |
| `BACKEND_URL` | Base URL for email claim links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email sending via Nodemailer |
| `EMAIL_FROM` | Sender address for emails |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Optional — JSON key for Sheets sync |
| `GOOGLE_SPREADSHEET_ID` | Optional — spreadsheet ID for Sheets sync |

### Tooling
- **Frontend**: No build step, no test suite, no linter. Tested manually in-browser.
- **Express backend**: `server/package.json` with dependencies. Knex for migrations. No test suite yet.

## Important Notes

- The entire frontend is a single HTML file — when making changes, be mindful of the file size and keep related code near existing patterns
- **Backend cutover**: To switch from Apps Script to Express, change `SCRIPT_URL` in `index.html` to the Railway URL. The frontend `apiCall()` auto-detects which backend to use
- `SCRIPT_URL` in `index.html` and `DEPLOYMENT_ID` in `watch.js` must point to the same Apps Script deployment (while still using Apps Script)
- The `scriptId` in `.clasp.json` identifies the Apps Script project
- Week data uses Monday dates as keys (ISO format: `YYYY-MM-DD`)
- "Spot Up" = a member gives up their meal spot; others can claim it via in-app button or email link
- "Ink" (formerly RSVP) = interest/attendance tracking on events
- The Moose tab shows special events with calendar-style pills
- Admin features are gated by `isAdmin` flag from the members sheet
- `interestOnly` admin setting controls whether events show full signup or just interest tracking
- **Sheets sync constraint**: Do NOT modify the live Google Sheet directly — the sync service writes to it as a mirror, not as a source of truth (when using Express backend)
- **Data migration**: `server/scripts/migrate-from-sheets.js` imports existing data from Google Sheets to PostgreSQL (one-time, requires credentials)
- **Auth placeholder**: `server/src/middleware/auth.js` is a no-op — server-side Google `id_token` verification not yet implemented
