require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL || 'https://meals.delphicclub.org',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',

  // Google Sheets sync
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
  googleSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',

  // Email
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  emailFrom: process.env.EMAIL_FROM || 'Delphic Club <noreply@delphicclub.com>',

  // Guest access code
  accessCode: process.env.ACCESS_CODE || '',

  // Google OAuth client ID (must match frontend)
  googleClientId: process.env.GOOGLE_CLIENT_ID || '343675266881-9qqpec1ftisitj7lhdffmbpooljub4t5.apps.googleusercontent.com',

  // GroupMe bot
  groupmeBotId: process.env.GROUPME_BOT_ID || '',
  groupmeAccessToken: process.env.GROUPME_ACCESS_TOKEN || '',
  groupmeGroupId: process.env.GROUPME_GROUP_ID || '',
  groupmeCallbackSecret: process.env.GROUPME_CALLBACK_SECRET || '',
  groupmeNicknameMap: process.env.GROUPME_NICKNAME_MAP || ''
};
