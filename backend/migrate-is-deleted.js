require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'postgres',
  port:     parseInt(process.env.DB_PORT || '5432'),
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  try {
    console.log('Adding is_deleted column to invoices...');
    await pool.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
    console.log('Updating invoice_summary view...');
    await pool.query(`
      CREATE OR REPLACE VIEW invoice_summary AS
      SELECT
        i.id,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.client_id,
        COALESCE(i.client_name, c.name)    AS client_name,
        COALESCE(i.client_email, c.email)  AS client_email,
        i.subtotal,
        i.gst_amount,
        i.discount,
        i.extra_charges,
        i.total,
        i.status,
        i.paid_date,
        i.paid_amount,
        i.payment_method,
        i.description,
        i.notes,
        i.created_at,
        i.updated_at
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.is_deleted = FALSE;
    `);
    
    console.log('Updating client_payment_summary view...');
    await pool.query(`
      CREATE OR REPLACE VIEW client_payment_summary AS
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        COUNT(i.id)              AS invoice_count,
        COALESCE(SUM(i.total), 0)           AS total_revenue,
        COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN i.status IN ('unpaid','draft') THEN i.total ELSE 0 END), 0) AS pending_amount
      FROM clients c
      LEFT JOIN invoices i ON c.id = i.client_id AND i.is_deleted = FALSE
      GROUP BY c.id, c.name, c.email, c.phone;
    `);
    
    console.log('Updating monthly_revenue view...');
    await pool.query(`
      CREATE OR REPLACE VIEW monthly_revenue AS
      SELECT
        TO_CHAR(invoice_date, 'Mon YYYY') AS month,
        DATE_TRUNC('month', invoice_date) AS month_date,
        COUNT(*)                           AS invoice_count,
        SUM(total)                         AS total_revenue,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS paid_revenue
      FROM invoices
      WHERE invoice_date >= NOW() - INTERVAL '12 months' AND is_deleted = FALSE
      GROUP BY month, month_date
      ORDER BY month_date DESC;
    `);
    
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

run();
