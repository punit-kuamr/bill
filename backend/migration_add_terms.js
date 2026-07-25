const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Connecting to database...');
    // Add columns if they don't exist
    await pool.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS additional_notes TEXT DEFAULT '';
    `);
    console.log('Successfully added columns: terms_and_conditions, additional_notes to settings table.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
