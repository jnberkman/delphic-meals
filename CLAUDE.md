# CLAUDE.md — Delphic Club Meal Sign-Ups

## Project Overview

A meal sign-up web application for the Delphic Club. Members sign up for weekly meals (lunch/dinner), manage dietary preferences, and handle "spot up" (giving up a meal spot for someone else to claim). Admins configure weekly schedules, manage members, and create special events.

## Architecture

**Frontend**: Single-file static site (`server/index.html`, ~3925 lines) served by Express on **Railway** at `meals.delphicclub.org`. Contains all HTML, CSS, and vanilla JavaScript in one file — no build step, no framework, no bundler.

**Backend**: Node.js + Express + PostgreSQL (`server/`), deployed on **Railway**. 28 API actions. Syncs chef-facing week display sheets to Google Sheets (fire-and-forget, no-ops without credentials).

**GroupMe Bot**: Posts spot-up notifications to the club GroupMe chat. Members reply "claim" to claim spots (first reply within 2 hours wins). Uses sender's real GroupMe name (not group nickname). Fire-and-forget — no-ops without `GROUPME_BOT_ID`.

**Legacy backend**: Google Apps Script (`Appscripts/Code.gs`) — still exists but is no longer the active backend. `SCRIPT_URL` in the frontend points to Railway.

**Auth**: Google OAuth2 redirect-based sign-in (`id_token` implicit flow) with silent re-auth (`prompt: 'none'`) for session persistence. Server-side token verification via `google-auth-library` enforces admin access on sensitive actions. Guest access via server-validated access code (`ACCESS_CODE` env var).

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
  package.json              # Dependencies: express, knex, pg, nodemailer, googleapis, cors, dotenv, uuid, express-rate-limit
  knexfile.js               # Knex config (reads DATABASE_URL)
  railway.toml              # Railway deployment config (nixpacks, health check, auto-migrate)
  .env.example              # Required environment variables
  migrations/
    001_initial_schema.js   # 8 tables: members, settings, access_requests, week_configs, signups, events, event_signups, claim_tokens
    002_add_spotted_up_at.js # Add spotted_up_at timestamp to signups (for GroupMe 2-hour claim window)
  scripts/
    migrate-from-sheets.js  # One-time data import from Google Sheets to PostgreSQL
  src/
    index.js                # Express entry point (serves API, frontend, favicon)
    config.js               # Reads env vars with defaults
    routes/
      api.js                # Action-dispatch router (POST /api + GET /api?payload=)
      claim.js              # Email claim link handler (/claim?token=)
      groupme.js            # GroupMe bot callback (POST /groupme/callback/:secret)
      health.js             # GET /health
    handlers/               # meals.js, spotup.js, members.js, access.js, settings.js, events.js
    db/
      knex.js               # Knex instance
      queries/              # signups.js, members.js, weeks.js, events.js, settings.js, accessRequests.js, claimTokens.js
    services/
      email.js              # Nodemailer wrapper
      emailTemplates.js     # 3 HTML email templates (spot-up notify, claim, access request)
      groupme.js            # GroupMe API wrapper (post messages, member name lookup)
      sheetsSync.js         # Fire-and-forget sync of chef-facing week display sheets to Google Sheets
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
- **State**: `currentUser` object, week data stored in module-level variables, preferences in `localStorage` (`delphic_prefs`), Google `id_token` in both `sessionStorage` and `localStorage` (silent re-auth on expiry). Guest access code in `sessionStorage` only (clears on tab close)

### Backend — Express (server/)

- **Entry point**: `server/src/index.js` — mounts `/api`, `/claim`, `/health`, `/groupme` routes, serves frontend and favicon
- **Action dispatch**: `server/src/routes/api.js` maps `data.action` to handler functions (28 actions)
- **Database**: PostgreSQL via Knex query builder. 8 tables defined in `server/migrations/001_initial_schema.js`
- **Auth middleware**: `server/src/middleware/auth.js` — 3-tier auth: PUBLIC actions (no auth), MEMBER actions (Google token or guest access code), ADMIN actions (Google token + `is_admin`). Guest access code sent as `accessCode` in request body
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
| `GROUPME_BOT_ID` | Optional — GroupMe bot ID for spot-up notifications |
| `GROUPME_ACCESS_TOKEN` | Optional — GroupMe API token for member name lookup |
| `GROUPME_GROUP_ID` | Optional — GroupMe group ID for member lookup |
| `GROUPME_CALLBACK_SECRET` | Optional — secret in callback URL for GroupMe message validation |
| `GROUPME_NICKNAME_MAP` | Optional — JSON mapping of GroupMe nicknames to real names (e.g. `{"Nickname":"Real Name"}`) |

## Important Notes

- The entire frontend is a single HTML file — when making changes, be mindful of the file size and keep related code near existing patterns
- Week data uses Monday dates as keys (ISO format: `YYYY-MM-DD`)
- "Spot Up" = a member gives up their meal spot; others can claim it via in-app button, email link, or GroupMe "claim" reply (3 claim methods, all use row-level locking)
- "Ink" (formerly RSVP) = interest/attendance tracking on events
- The Moose tab shows special events with calendar-style pills
- Admin features are gated by `isAdmin` flag from the members table, enforced server-side
- `interestOnly` admin setting controls whether events show full signup or just interest tracking
- **Sheets sync constraint**: Do NOT modify the live Google Sheet directly — the sync service only writes chef-facing display sheets (`Week_YYYY-MM-DD`). Postgres is the source of truth
- **Rate limiting**: `/api` is limited to 100 req/min, `/groupme` to 15 req/15min via `express-rate-limit`
- **Claim token expiry**: Email claim links expire after 24 hours
- **Diet/allergy privacy**: `getWeek` API strips `diet` and `allergies` fields for non-admin callers; frontend also hides them for non-admins
- **Data migration**: `server/scripts/migrate-from-sheets.js` imports existing data from Google Sheets to PostgreSQL (one-time, requires credentials)
- **Constants shared with backend**: `DAYS`, `DEFAULT_MEALS`, `CATEGORIES` are duplicated in both `index.html` and `Code.gs` — keep them in sync if modifying the legacy backend
