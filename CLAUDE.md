# CLAUDE.md — Delphic Club Meal Sign-Ups

## Project Overview

A meal sign-up web application for the Delphic Club. Members sign up for weekly meals (lunch/dinner), manage dietary preferences, and handle "spot up" (giving up a meal spot for someone else to claim). Admins configure weekly schedules, manage members, and create special events.

## Architecture

**Frontend**: Single-file static site (`server/index.html`, ~3700 lines) served by Express on **Railway** at `meals.delphicclub.org`. Contains all HTML, CSS, and vanilla JavaScript in one file — no build step, no framework, no bundler.

**Backend**: Node.js + Express + PostgreSQL (`server/`), deployed on **Railway**. 28 API actions. Syncs chef-facing week display sheets to Google Sheets (fire-and-forget, no-ops without credentials).

**Legacy backend**: Google Apps Script (`Appscripts/Code.gs`) — still exists but is no longer the active backend. `SCRIPT_URL` in the frontend points to Railway.

**Auth**: Google OAuth2 redirect-based sign-in (`id_token` implicit flow). Server-side token verification via `google-auth-library` enforces admin access on sensitive actions. Guest access via server-validated access code (`ACCESS_CODE` env var).

**Deployment**: Push to `main` → Railway auto-deploys via GitHub integration (rootDirectory: `/server`). Migrations run automatically on deploy.

## Quick Start

```bash
# Express backend local dev
cd server && npm install && npm run migrate && npm start
```

## File Structure

```
Appscripts/
  Code.gs                   # Legacy backend — Google Apps Script
  .clasp.json               # clasp config (script ID, file extensions)
  appsscript.json           # Apps Script manifest (timezone, runtime, webapp config)
  watch.js                  # Node.js file watcher: auto clasp push + deploy on save
  .claspignore              # Files clasp should ignore
server/                     # Backend + frontend — Node.js + Express + PostgreSQL
  index.html                # Entire frontend (HTML + CSS + JS), served by Express
  favicon.ico               # Delphic Club favicon (from delphicclub.com)
  package.json              # Dependencies: express, knex, pg, nodemailer, googleapis, cors, dotenv, uuid
  knexfile.js               # Knex config (reads DATABASE_URL)
  railway.toml              # Railway deployment config (nixpacks, health check, auto-migrate)
  .env.example              # Required environment variables
  migrations/
    001_initial_schema.js   # 8 tables: members, settings, access_requests, week_configs, signups, events, event_signups, claim_tokens
  scripts/
    migrate-from-sheets.js  # One-time data import from Google Sheets to PostgreSQL
  src/
    index.js                # Express entry point (serves API, frontend, favicon)
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
      sheetsSync.js         # Fire-and-forget sync of chef-facing week sheets to Google Sheets
    utils/
      time.js               # Timezone helpers (America/New_York)
      weekHelpers.js        # Monday-date key utilities
    middleware/
      cors.js               # CORS config
      errorHandler.js       # Express error handler
      auth.js               # Google id_token verification + admin enforcement
.vscode/
  tasks.json                # VS Code tasks: watch/deploy Apps Script, deploy frontend
  keybindings.json          # VS Code keybindings
```

## Key Conventions

### Frontend (server/index.html)

- **No frameworks** — plain vanilla JS, all in `<script>` tags within `index.html`
- **CSS variables** defined in `:root` for theming (gold accent `--accent`, muted earth tones)
- **Fonts**: Cormorant Garamond (headings), Crimson Pro (body/serif), Jost (UI/sans-serif)
- **Tabs**: Sign Up, View Signups, Calendar (hidden), Events (hidden), Moose, Admin (admin-only)
- **API communication**: All backend calls go through `apiCall(action, data)` which POSTs JSON to `/api` with `Authorization: Bearer <id_token>` header when signed in via Google
- **Auth**: Google OAuth2 redirect-based sign-in. Guest access code validated server-side via `checkAccessCode` action
- **Client-side caching**: `getCache()`/`setCache()` with 10-minute TTL for API responses
- **State**: `currentUser` object, week data stored in module-level variables, preferences in `localStorage` (`delphic_prefs`), Google `id_token` in `sessionStorage`

### Backend — Express (server/)

- **Entry point**: `server/src/index.js` — mounts `/api`, `/claim`, `/health` routes, serves frontend and favicon
- **Action dispatch**: `server/src/routes/api.js` maps `data.action` to handler functions (28 actions)
- **Database**: PostgreSQL via Knex query builder. 8 tables defined in `server/migrations/001_initial_schema.js`
- **Auth middleware**: `server/src/middleware/auth.js` — verifies Google `id_token` via `google-auth-library`. Public actions (ping, checkAccessCode, checkMember, requestAccess, getSettings, getWeek, getEvents) pass through. Admin actions require verified token + `is_admin` flag in members table
- **Sheets sync**: `server/src/services/sheetsSync.js` — only syncs chef-facing week display sheets (`Week_YYYY-MM-DD`). All other sync functions (members, settings, events, etc.) are no-ops. Gracefully no-ops if `GOOGLE_SERVICE_ACCOUNT_KEY` is not set
- **Email**: Nodemailer (`server/src/services/email.js`) with HTML templates (`emailTemplates.js`)
- **Claim route**: `GET /claim?token=` with PostgreSQL row-level locking for spot-up claims via email links

### API Actions

`ping`, `checkAccessCode`, `getWeek`, `addSignups`, `removeSignup`, `setWeekConfig`, `spotUp`, `claimSpotUp`, `unclaimSpotUp`, `cancelSpotUp`, `markServed`, `checkMember`, `getMembers`, `addMember`, `removeMember`, `requestAccess`, `getAccessRequests`, `approveAccessRequest`, `denyAccessRequest`, `getSettings`, `setSettings`, `setNotifyEmail`, `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`, `addEventSignup`, `removeEventSignup`

## Development Workflow

### Frontend changes
1. Edit `server/index.html`
2. Commit and push to `main` branch
3. Railway auto-deploys

### Express backend changes
1. Edit files in `server/`
2. Local dev: `cd server && npm install && npm run migrate && npm start`
3. Requires `DATABASE_URL` in `server/.env` (see `server/.env.example` for all env vars)
4. Push to `main` → Railway auto-deploys (connected via GitHub integration)
5. Available scripts: `npm start`, `npm run migrate`, `npm run migrate:rollback`, `npm run seed`, `npm run import`

### Environment variables (Express backend)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default 3000) |
| `FRONTEND_URL` | CORS allowed origin |
| `BACKEND_URL` | Base URL for email claim links |
| `ACCESS_CODE` | Guest access code (validated server-side) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (default in config.js) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email sending via Nodemailer |
| `EMAIL_FROM` | Sender address for emails |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Optional — base64-encoded JSON key for Sheets sync |
| `GOOGLE_SPREADSHEET_ID` | Optional — spreadsheet ID for Sheets sync |

## Important Notes

- The entire frontend is a single HTML file — when making changes, be mindful of the file size and keep related code near existing patterns
- Week data uses Monday dates as keys (ISO format: `YYYY-MM-DD`)
- "Spot Up" = a member gives up their meal spot; others can claim it via in-app button or email link
- "Ink" (formerly RSVP) = interest/attendance tracking on events
- The Moose tab shows special events with calendar-style pills
- Admin features are gated by `isAdmin` flag from the members table, enforced server-side
- `interestOnly` admin setting controls whether events show full signup or just interest tracking
- **Sheets sync constraint**: Do NOT modify the live Google Sheet directly — the sync service writes chef-facing week sheets as a mirror, not as a source of truth
- **Data migration**: `server/scripts/migrate-from-sheets.js` imports existing data from Google Sheets to PostgreSQL (one-time, requires credentials)
- **Constants shared with backend**: `DAYS`, `DEFAULT_MEALS`, `CATEGORIES` are duplicated in both `index.html` and `Code.gs` — keep them in sync if modifying the legacy backend
