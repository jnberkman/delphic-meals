const config = require('../config');
const SITE_URL = 'https://rmeek-robot.github.io/delphic-meals/';

/**
 * Port of buildClaimResultPage() from Code.gs:64-85.
 */
function buildClaimResultPage(success, title, message, name) {
  const color = success ? '#2E7D32' : '#C62828';
  const icon = success ? '&#10003;' : '&#10007;';
  return `<!DOCTYPE html><html><head><title>${title}</title>` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>*{box-sizing:border-box}body{margin:0;background:#f4f1eb;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}' +
    '.card{background:#fff;border-radius:10px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)}' +
    `.icon{width:56px;height:56px;border-radius:50%;background:${color};color:#fff;font-size:28px;line-height:56px;margin:0 auto 20px}` +
    '.title{font-size:24px;font-weight:700;color:#1a1a2e;margin-bottom:12px}' +
    '.msg{font-size:15px;color:#555;line-height:1.6;margin-bottom:20px}' +
    '.claimer{font-size:13px;color:#888;margin-bottom:24px}' +
    '.btn{display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;font-weight:600}' +
    '.footer{font-size:11px;color:#bbb;margin-top:24px;letter-spacing:.5px;text-transform:uppercase}</style>' +
    '</head><body><div class="card">' +
    `<div class="icon">${icon}</div>` +
    `<div class="title">${title}</div>` +
    `<div class="msg">${message}</div>` +
    (name ? `<div class="claimer">Claimed by: <strong>${name}</strong></div>` : '') +
    `<a href="${SITE_URL}" class="btn">Open Meal Sign-Ups</a>` +
    '<div class="footer">Delphic Club</div>' +
    '</div></body></html>';
}

/**
 * Port of buildSpotUpEmail() from Code.gs:87-105.
 */
function buildSpotUpEmail(origName, dayMeal, time, recipientName, claimUrl) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1eb;font-family:Georgia,serif;">' +
    '<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
    '<div style="background:#1a1a2e;padding:24px 32px;">' +
    '<div style="font-size:20px;font-weight:700;color:#e8d5a3;">Delphic Club</div>' +
    '<div style="font-size:11px;color:#8888aa;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Spot Up Alert</div>' +
    '</div>' +
    '<div style="padding:32px;">' +
    `<p style="margin:0 0 8px;font-size:14px;color:#666;">${greeting}</p>` +
    '<p style="margin:0 0 28px;font-size:16px;color:#222;line-height:1.6;">' +
    `<strong>${origName}</strong> spotted up their <strong>${dayMeal}</strong> spot` +
    (time ? ` (<strong>${time}</strong>)` : '') + '.</p>' +
    '<div style="text-align:center;margin:0 0 28px;">' +
    `<a href="${claimUrl}" style="display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:15px 40px;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:.5px;">Claim This Spot</a>` +
    '</div>' +
    '<p style="margin:0;font-size:12px;color:#aaa;text-align:center;line-height:1.6;">First click claims it \u2014 link is single-use. If already taken you\'ll see a message.</p>' +
    '</div></div></body></html>';
}

/**
 * Port of buildAccessRequestEmail() from Code.gs:779-796.
 */
function buildAccessRequestEmail(requesterName, requesterEmail, adminName, siteUrl) {
  const greeting = adminName ? `Hi ${adminName},` : 'Hi,';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1eb;font-family:Georgia,serif;">' +
    '<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
    '<div style="background:#1a1a2e;padding:24px 32px;">' +
    '<div style="font-size:20px;font-weight:700;color:#e8d5a3;">Delphic Club</div>' +
    '<div style="font-size:11px;color:#8888aa;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Access Request</div>' +
    '</div>' +
    '<div style="padding:32px;">' +
    `<p style="margin:0 0 8px;font-size:14px;color:#666;">${greeting}</p>` +
    '<p style="margin:0 0 20px;font-size:16px;color:#222;line-height:1.6;">' +
    `<strong>${requesterName}</strong> (<a href="mailto:${requesterEmail}" style="color:#1a1a2e;">${requesterEmail}</a>) has requested access to Delphic Meals.</p>` +
    '<p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.6;">Sign in to the site and open the <strong>Admin</strong> tab to approve or deny this request.</p>' +
    '<div style="text-align:center;margin:0 0 28px;">' +
    `<a href="${siteUrl}" style="display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:15px 40px;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:.5px;">Open Admin Tab</a>` +
    '</div>' +
    '</div></div></body></html>';
}

/**
 * Port of buildApprovalEmail() from Code.gs:798-813.
 */
function buildApprovalEmail(recipientName, siteUrl) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1eb;font-family:Georgia,serif;">' +
    '<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);">' +
    '<div style="background:#1a1a2e;padding:24px 32px;">' +
    '<div style="font-size:20px;font-weight:700;color:#e8d5a3;">Delphic Club</div>' +
    '<div style="font-size:11px;color:#8888aa;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Access Approved</div>' +
    '</div>' +
    '<div style="padding:32px;">' +
    `<p style="margin:0 0 8px;font-size:14px;color:#666;">${greeting}</p>` +
    '<p style="margin:0 0 28px;font-size:16px;color:#222;line-height:1.6;">Your access to <strong>Delphic Meals</strong> has been approved. You can now sign in with your Google account.</p>' +
    '<div style="text-align:center;margin:0 0 28px;">' +
    `<a href="${siteUrl}" style="display:inline-block;background:#1a1a2e;color:#e8d5a3;text-decoration:none;padding:15px 40px;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:.5px;">Sign In Now</a>` +
    '</div>' +
    '</div></div></body></html>';
}

module.exports = { buildClaimResultPage, buildSpotUpEmail, buildAccessRequestEmail, buildApprovalEmail };
