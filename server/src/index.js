require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const path = require('path');
const app = express();

app.use(require('./middleware/cors'));
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Too many requests' } });
const strictLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Too many attempts' } });

app.use('/api', apiLimiter, require('./middleware/auth'), require('./routes/api'));
app.use('/groupme', strictLimiter);
app.use('/claim', require('./routes/claim'));
app.use('/health', require('./routes/health'));
app.use('/groupme', require('./routes/groupme'));

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../index.html'));
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../favicon.ico'));
});

app.use(require('./middleware/errorHandler'));

app.listen(config.port, () => {
  console.log(`Delphic Meals API listening on port ${config.port}`);
});
