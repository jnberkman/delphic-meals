# GroupMe Bot for Spot-Up Claims — Design Spec

## Overview

When a member spots up on the website, a GroupMe bot posts a notification to the club's group chat. Members can reply "claim" to claim the spot. The first person to reply within 2 hours gets it, using their GroupMe account name (not group nickname/alias).

## Flow

1. Member spots up on website → bot posts: **"John spotted up for Tuesday Dinner"**
2. Someone replies **"claim"** within 2 hours → bot claims oldest unclaimed spot-up, posts: **"Jane claimed John's Tuesday Dinner spot"**
3. If no unclaimed spot-ups exist within 2 hours, "claim" messages are silently ignored
4. All non-"claim" messages are silently ignored

## Architecture

### New Files

**`server/src/services/groupme.js`** — GroupMe API wrapper
- `postMessage(text)` — POST to `https://api.groupme.com/v3/bots/post` with bot ID
- `getMemberName(senderUserId)` — GET `/groups/{group_id}` members, find real name by `user_id` (not nickname)
- Gracefully no-ops if `GROUPME_BOT_ID` is not set (same pattern as sheetsSync)

**`server/src/routes/groupme.js`** — `POST /groupme/callback/:secret`
- Validates `:secret` param against `GROUPME_CALLBACK_SECRET` env var (rejects if mismatch)
- Receives all messages pushed by GroupMe for the group
- Ignores messages where `sender_type === 'bot'` (prevents self-loops)
- Ignores messages that don't match "claim" (case-insensitive)
- Queries DB for oldest unclaimed spot-up within 2-hour window
- If found: claims it using sender's real GroupMe name, posts confirmation
- If not found: silently ignores

**`server/migrations/002_add_spotted_up_at.js`** — adds `spotted_up_at` timestamp column to `signups` table

### Modified Files

**`server/src/handlers/spotup.js`** — set `spotted_up_at = NOW()` alongside `spot_up_status = 'spotup'`, then call `groupme.postMessage()` fire-and-forget. On cancel/unclaim, clear `spotted_up_at`.

**`server/src/index.js`** — mount the `/groupme` route

### Claim Query

```sql
SELECT * FROM signups
WHERE spot_up_status = 'spotup'
  AND spotted_up_at > NOW() - INTERVAL '2 hours'
ORDER BY spotted_up_at ASC
LIMIT 1
FOR UPDATE
```

Row-level locking (`FOR UPDATE`) prevents double-claims across all three claim methods (web, email, GroupMe).

### Integration with Existing Claim Flow

- Email claim links still work in parallel
- In-app claiming still works
- All three methods use the same row-level DB locking
- GroupMe claim updates the same columns: `name`, `spot_up_status`, `spot_up_claimed_by`

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GROUPME_BOT_ID` | For posting messages to the group |
| `GROUPME_ACCESS_TOKEN` | For reading group members to get real names |
| `GROUPME_GROUP_ID` | Group ID for member lookup |
| `GROUPME_CALLBACK_SECRET` | Secret token in callback URL path for basic auth |

## GroupMe Bot Setup (One-Time)

1. Go to https://dev.groupme.com/bots
2. Create a bot attached to the Delphic group
3. Set callback URL to `https://meals.delphicclub.org/groupme/callback/<secret>` (secret stored as `GROUPME_CALLBACK_SECRET` env var)
4. Save the bot ID → set as `GROUPME_BOT_ID` env var
5. Get an access token from https://dev.groupme.com → set as `GROUPME_ACCESS_TOKEN`
6. Get group ID from GroupMe API or URL → set as `GROUPME_GROUP_ID`

## Edge Cases

- **Multiple spots available**: FIFO — oldest spot-up gets claimed first
- **Spot claimed via web/email before GroupMe**: "claim" silently ignored (no matching row)
- **GROUPME_BOT_ID not set**: All GroupMe functions no-op silently (no errors)
- **GroupMe API failure**: Log error, don't break the spot-up flow (fire-and-forget)
- **2-hour window expires**: "claim" silently ignored
- **Spot-up cancelled before claim**: "claim" silently ignored (status no longer 'spotup')
