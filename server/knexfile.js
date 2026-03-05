require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
  pool: { min: 2, max: 10 }
};
