const cors = require('cors');
const config = require('../config');

module.exports = cors({
  origin: config.frontendUrl,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});
