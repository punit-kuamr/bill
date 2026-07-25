-- ============================================================
-- INVOICE MANAGEMENT SYSTEM - PostgreSQL Schema for Supabase
-- Run this entire script in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(50),
  address     TEXT,
  gstin       VARCHAR(20),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  invoice_number  VARCHAR(50) UNIQUE NOT NULL,
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name     VARCHAR(255),
  client_email    VARCHAR(255),
  client_phone    VARCHAR(50),
  client_address  TEXT,
  client_gstin    VARCHAR(20),
  description     TEXT,
  subtotal        NUMERIC(12,2) DEFAULT 0,
  gst_amount      NUMERIC(12,2) DEFAULT 0,
  discount        NUMERIC(12,2) DEFAULT 0,
  extra_charges   NUMERIC(12,2) DEFAULT 0,
  total           NUMERIC(12,2) DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','unpaid','paid','cancelled')),
  paid_date       DATE,
  paid_amount     NUMERIC(12,2) DEFAULT 0,
  payment_method  VARCHAR(50),
  payment_remarks TEXT,
  is_roundoff     BOOLEAN DEFAULT FALSE,
  is_roundup      BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: invoice_items
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INTEGER REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  item_name   VARCHAR(255) NOT NULL,
  hsn_sac     VARCHAR(50),
  description TEXT,
  quantity    NUMERIC(10,2) DEFAULT 1,
  rate        NUMERIC(12,2) DEFAULT 0,
  gst_rate    NUMERIC(5,2) DEFAULT 18,
  amount      NUMERIC(12,2) DEFAULT 0,
  gst_amount  NUMERIC(12,2) DEFAULT 0,
  total       NUMERIC(12,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: settings
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id                    SERIAL PRIMARY KEY,
  company_name          VARCHAR(255) DEFAULT 'Ankit Infotech And Solution',
  company_gstin         VARCHAR(20)  DEFAULT '08BHQPB3266F1ZB',
  company_address       TEXT         DEFAULT '',
  company_phone         VARCHAR(50)  DEFAULT '',
  company_email         VARCHAR(255) DEFAULT 'ankitinfotechsolutions@gmail.com',
  company_website       VARCHAR(255) DEFAULT '',
  invoice_prefix        VARCHAR(20)  DEFAULT 'INV',
  invoice_next_number   INTEGER      DEFAULT 1,
  sendgrid_api_key      TEXT         DEFAULT '',
  sendgrid_from_email   VARCHAR(255) DEFAULT 'ankitinfotechsolutions@gmail.com',
  default_gst_rate      NUMERIC(5,2) DEFAULT 18,
  default_due_days      INTEGER      DEFAULT 30,
  currency              VARCHAR(10)  DEFAULT 'INR',
  bank_name             VARCHAR(255) DEFAULT '',
  bank_account_name     VARCHAR(255) DEFAULT '',
  bank_account_number   VARCHAR(255) DEFAULT '',
  bank_ifsc             VARCHAR(50)  DEFAULT '',
  bank_branch           VARCHAR(255) DEFAULT '',
  upi_id                VARCHAR(255) DEFAULT '',
  terms_and_conditions  TEXT         DEFAULT '',
  additional_notes      TEXT         DEFAULT '',
  created_at            TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FUNCTION: auto update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trigger_clients_updated_at ON clients;
CREATE TRIGGER trigger_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_invoices_updated_at ON invoices;
CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_settings_updated_at ON settings;
CREATE TRIGGER trigger_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS
-- ============================================================

-- Invoice summary view (joins invoice with client)
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
LEFT JOIN clients c ON i.client_id = c.id;

-- Client payment summary
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
LEFT JOIN invoices i ON c.id = i.client_id
GROUP BY c.id, c.name, c.email, c.phone;

-- Monthly revenue view
CREATE OR REPLACE VIEW monthly_revenue AS
SELECT
  TO_CHAR(invoice_date, 'Mon YYYY') AS month,
  DATE_TRUNC('month', invoice_date) AS month_date,
  COUNT(*)                           AS invoice_count,
  SUM(total)                         AS total_revenue,
  SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS paid_revenue
FROM invoices
WHERE invoice_date >= NOW() - INTERVAL '12 months'
GROUP BY month, month_date
ORDER BY month_date DESC;

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_client_id   ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status       ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date         ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_clients_name          ON clients(name);

-- ============================================================
-- SAMPLE DATA (Optional - remove in production)
-- ============================================================
-- INSERT INTO clients (name, email, phone, address, gstin) VALUES
--   ('ABC Corporation', 'contact@abc.com', '+91-9876543210', '123 Business St, Mumbai', '07AABCU9603R1Z0'),
--   ('XYZ Pvt Ltd', 'info@xyz.com', '+91-9123456789', '456 Tech Park, Bangalore', '29AABCX1234R1Z5');

-- ============================================================
-- Done! All tables, views, and triggers created.
-- ============================================================
