const WebSocket = require('ws');
const config = require('../config');
const db = require('../db/knex');
const signupsDb = require('../db/queries/signups');
const weeksDb = require('../db/queries/weeks');
const groupme = require('./groupme');
const sheetsSync = require('./sheetsSync');

let ws = null;
let clientId = null;
let msgId = 0;
let botUserId = null;
let reconnectTimer = null;

function nextId() { return String(++msgId); }

function send(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(Array.isArray(data) ? data : [data]));
}

// --- Claim logic (same as routes/groupme.js) ---

async function getSpotLabel(signup) {
  const monday = typeof signup.monday === 'string'
    ? signup.monday
    : signup.monday.toISOString().split('T')[0];
  const weekCfg = await weeksDb.getConfig(monday);
  const cfg = weekCfg ? weekCfg.config : null;
  const dayInfo = cfg && cfg[signup.day_index] ? cfg[signup.day_index] : {};
  if (dayInfo.day && dayInfo.meal) {
    let datePart = '';
    if (dayInfo.date) {
      const [, mm, dd] = dayInfo.date.split('-');
      datePart = ` (${parseInt(mm)}/${parseInt(dd)})`;
    }
    return `${signup.spot_up_orig_name}'s ${dayInfo.day} ${dayInfo.meal}${datePart}`;
  }
  return `${signup.spot_up_orig_name}'s meal`;
}

async function buildSpotsList() {
  const spots = await signupsDb.findAllAvailableSpotUps();
  if (spots.length === 0) return { list: null, spots: [] };
  const labels = await Promise.all(spots.map(s => getSpotLabel(s)));
  const list = labels.map((label, i) => `${i + 1}. ${label}`).join('\n');
  return { list, spots };
}

async function executeClaimById(spotId, claimerName) {
  const result = await db.transaction(async (trx) => {
    const signup = await signupsDb.findSpotUpByIdForUpdate(trx, spotId);
    if (!signup) return null;

    await trx('signups').where('id', signup.id).update({
      name: claimerName,
      spot_up_status: 'claimed',
      spot_up_orig_name: signup.spot_up_orig_name,
      spot_up_claimed_by: claimerName
    });

    await trx('claim_tokens')
      .where({ monday: signup.monday, day_idx: signup.day_index, orig_name: signup.spot_up_orig_name, time: signup.time, used: false })
      .update({ used: true });

    return signup;
  });

  if (!result) return null;

  const monday = typeof result.monday === 'string'
    ? result.monday
    : result.monday.toISOString().split('T')[0];

  const label = await getSpotLabel(result);
  groupme.postToTopic(`${claimerName} claimed ${label} spot`);
  sheetsSync.syncWeek(monday).catch(e => console.error('Sheets sync error (week):', e.message));
  return result;
}

async function executeClaim(claimerName, claimNum) {
  const spots = await signupsDb.findAllAvailableSpotUps();
  if (spots.length === 0) return;

  let spot;
  if (claimNum !== null) {
    if (claimNum < 1 || claimNum > spots.length) return;
    spot = spots[claimNum - 1];
  } else {
    spot = spots[0];
  }

  await executeClaimById(spot.id, claimerName);
}

async function handleMessage(subject) {
  // Skip bot's own messages
  if (subject.user_id === botUserId) return;
  if (!subject.text) return;

  const text = subject.text.trim();
  const textLower = text.toLowerCase();
  const senderId = subject.sender_id || subject.user_id;

  // "name First Last"
  const nameMatch = text.match(/^name\s+(\S+\s+\S.*)$/i);
  if (nameMatch) {
    const realName = nameMatch[1].trim();
    const saved = await groupme.setNickname(senderId, subject.name, realName);
    groupme.postToTopic(saved ? `${subject.name} → ${realName}` : `Failed to save name — try again`);
    return;
  }

  // "spots"
  if (textLower === 'spots') {
    const { list } = await buildSpotsList();
    if (!list) return;
    groupme.postToTopic(`Available spots:\n${list}\n\n"claim" = first available, "claim #" = specific`);
    return;
  }

  // Parse claim commands
  const claimMatch = text.match(/^claim(?:\s+(.+))?$/i);
  if (!claimMatch) return;

  let claimNum = null;
  let inlineName = null;

  if (claimMatch[1]) {
    const args = claimMatch[1].trim();
    const numMatch = args.match(/^(\d+)(?:\s+(.+))?$/);
    if (numMatch) {
      claimNum = parseInt(numMatch[1], 10);
      if (numMatch[2]) inlineName = numMatch[2].trim();
    } else {
      if (/^\S+\s+\S/.test(args)) {
        inlineName = args;
      } else {
        return;
      }
    }
  }

  if (inlineName) {
    await groupme.setNickname(senderId, subject.name, inlineName);
  }

  const claimerName = inlineName || await groupme.resolveNickname(senderId, subject.name);

  if (!claimerName) {
    groupme.postToTopic(`${subject.name}, include your name: "claim First Last" or "claim # First Last"`);
    return;
  }

  await executeClaim(claimerName, claimNum);
}

// --- WebSocket push connection ---

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  clientId = null;
  msgId = 0;

  ws = new WebSocket('wss://push.groupme.com/faye');

  ws.on('open', () => {
    console.log('Topic listener: WebSocket connected');
    send({
      channel: '/meta/handshake',
      version: '1.0',
      supportedConnectionTypes: ['websocket'],
      id: nextId()
    });
  });

  ws.on('message', (raw) => {
    let messages;
    try {
      messages = JSON.parse(raw);
    } catch (e) {
      return;
    }

    for (const msg of messages) {
      // Handshake response
      if (msg.channel === '/meta/handshake') {
        if (msg.successful) {
          clientId = msg.clientId;
          // Subscribe to user channel
          send({
            channel: '/meta/subscribe',
            clientId,
            subscription: `/user/${botUserId}`,
            id: nextId(),
            ext: {
              access_token: config.groupmeAccessToken,
              timestamp: Math.floor(Date.now() / 1000)
            }
          });
        } else {
          console.error('Topic listener: handshake failed', msg);
        }
        continue;
      }

      // Subscribe response
      if (msg.channel === '/meta/subscribe') {
        if (msg.successful) {
          console.log('Topic listener: subscribed, listening for messages');
          send({
            channel: '/meta/connect',
            clientId,
            connectionType: 'websocket',
            id: nextId()
          });
        } else {
          console.error('Topic listener: subscribe failed', msg);
        }
        continue;
      }

      // Connect response — keep the loop alive
      if (msg.channel === '/meta/connect') {
        if (msg.successful) {
          send({
            channel: '/meta/connect',
            clientId,
            connectionType: 'websocket',
            id: nextId()
          });
        }
        continue;
      }

      // Real message — filter for our topic
      if (msg.data && msg.data.subject) {
        const subject = msg.data.subject;
        console.log(`Topic listener: received ${msg.data.type} from group ${subject.group_id} (want ${config.groupmeTopicId}): "${subject.text}"`);
        if (msg.data.type === 'line.create' && String(subject.group_id) === String(config.groupmeTopicId)) {
          handleMessage(subject).then(() => {
            console.log('Topic listener: message handled successfully');
          }).catch(e => {
            console.error('Topic listener message error:', e.message, e.stack);
          });
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('Topic listener: disconnected, reconnecting in 5s...');
    reconnectTimer = setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('Topic listener: WebSocket error:', err.message);
    try { ws.close(); } catch (_) {}
  });
}

async function initBotUserId() {
  if (!config.groupmeAccessToken) return false;
  try {
    const res = await fetch(`https://api.groupme.com/v3/users/me?token=${config.groupmeAccessToken}`);
    if (res.ok) {
      const data = await res.json();
      botUserId = data.response.user_id || data.response.id;
      console.log(`Topic listener: user_id = ${botUserId}`);
      return true;
    }
  } catch (e) {
    console.error('Topic listener: failed to get user_id:', e.message);
  }
  return false;
}

async function start() {
  if (!config.groupmeTopicId || !config.groupmeAccessToken) {
    console.log('Topic listener: disabled (GROUPME_TOPIC_ID or GROUPME_ACCESS_TOKEN not set)');
    return;
  }

  const ok = await initBotUserId();
  if (!ok) {
    console.error('Topic listener: cannot start without user_id');
    return;
  }

  console.log(`Topic listener: connecting to topic ${config.groupmeTopicId}`);
  connect();
}

module.exports = { start };
