const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const claimTokensDb = require('../db/queries/claimTokens');
const membersDb = require('../db/queries/members');
const templates = require('./emailTemplates');

const SITE_URL = () => config.frontendUrl;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.pass) {
    console.warn('SMTP not configured — emails will be logged but not sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  return transporter;
}

async function sendMail(to, subject, htmlBody) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL DRY-RUN] To: ${to} | Subject: ${subject}`);
    return;
  }
  await t.sendMail({ from: config.emailFrom, to, subject, html: htmlBody });
}

/**
 * Port of sendSpotUpEmails() from Code.gs:1240-1271.
 */
async function sendSpotUpEmails(monday, dayIdx, origName, time, weekConfig) {
  const members = await membersDb.getMembersWithNotify();
  if (!members.length) return;

  const dayName = weekConfig && weekConfig[dayIdx] ? (weekConfig[dayIdx].day || '') : '';
  const mealType = weekConfig && weekConfig[dayIdx] ? (weekConfig[dayIdx].meal || '') : '';
  const dayMeal = (dayName && mealType) ? `${dayName} ${mealType}` : 'a meal';
  const subject = `\uD83D\uDD14 Spot Up \u2014 ${dayMeal} at Delphic`;

  for (const member of members) {
    if (!member.email) continue;

    const token = uuidv4();
    await claimTokensDb.create({
      token,
      monday,
      day_idx: dayIdx,
      orig_name: origName,
      time,
      recipient_email: member.email
    });

    const claimUrl = `${config.backendUrl}/claim?claimToken=${token}`;
    const html = templates.buildSpotUpEmail(origName, dayMeal, time, member.name || '', claimUrl);
    await sendMail(member.email, subject, html);
  }
}

async function sendAccessRequestEmail(requesterName, requesterEmail, adminName, adminEmail) {
  const html = templates.buildAccessRequestEmail(requesterName, requesterEmail, adminName, SITE_URL());
  await sendMail(adminEmail, `Access Request \u2014 ${requesterName} \u2014 Delphic Meals`, html);
}

async function sendApprovalEmail(recipientEmail, recipientName) {
  const html = templates.buildApprovalEmail(recipientName, SITE_URL());
  await sendMail(recipientEmail, 'You\'ve been approved \u2014 Delphic Meals', html);
}

module.exports = { sendSpotUpEmails, sendAccessRequestEmail, sendApprovalEmail };
