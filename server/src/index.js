require('dotenv').config();
const express = require('express');
const config = require('./config');

const app = express();

app.use(require('./middleware/cors'));
app.use(express.json({ limit: '1mb' }));

app.use('/api', require('./routes/api'));
app.use('/claim', require('./routes/claim'));
app.use('/health', require('./routes/health'));

app.use(require('./middleware/errorHandler'));

app.listen(config.port, () => {
  console.log(`Delphic Meals API listening on port ${config.port}`);
});
