// ============================================================
// INVOICE MANAGEMENT SYSTEM - Express Backend
// Author: Ankit Infotech And Solution
// ============================================================

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const { Pool }   = require('pg');
const sgMail     = require('@sendgrid/mail');
const puppeteer  = require('puppeteer');
const QRCode     = require('qrcode');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// DATABASE
// ============================================================
let pool;

const initDB = async () => {
  if (pool) {
    try {
      await pool.end();
    } catch (e) {
      console.error('Error closing old pool:', e.message);
    }
  }

  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'postgres',
    port:     parseInt(process.env.DB_PORT || '5432'),
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected DB pool error:', err.message);
  });

  try {
    await pool.query('SELECT NOW()');
    console.log(`✅ Database connected: ${process.env.DB_HOST || 'localhost'}`);
    try {
      await pool.query(`
        ALTER TABLE settings
          ADD COLUMN IF NOT EXISTS signature_url TEXT DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS company_logo_url TEXT DEFAULT NULL,
          ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT DEFAULT '',
          ADD COLUMN IF NOT EXISTS additional_notes TEXT DEFAULT '',
          ADD COLUMN IF NOT EXISTS footer_message TEXT DEFAULT '';
      `);
    } catch (e) { /* columns may already exist */ }
  } catch (err) {
    console.warn('⚠️  Database not connected:', err.message);
  }
};

initDB();

// ============================================================
// SENDGRID
// ============================================================
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ============================================================
// HELPERS
// ============================================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
};

const generateInvoiceNumber = async (dbClient = pool) => {
  const setRes  = await dbClient.query('SELECT invoice_prefix FROM settings WHERE id=1');
  const prefix  = setRes.rows[0]?.invoice_prefix || 'INV';
  const year    = new Date().getFullYear();
  
  const invRes = await dbClient.query(
    "SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1",
    [`${prefix}-${year}-%`]
  );
  
  const existingNumbers = invRes.rows
    .map(r => parseInt(r.invoice_number.split('-').pop(), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
    
  let next = 1;
  for (let num of existingNumbers) {
    if (num === next) {
      next++;
    } else if (num > next) {
      break;
    }
  }
  
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
};

// ============================================================
// HEALTH
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ============================================================
// CLIENTS ENDPOINTS
// ============================================================

// GET /api/clients
app.get('/api/clients', async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM clients';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`;
    }
    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /clients error:', err.message);
    res.status(500).json({ error: 'Failed to fetch clients', message: err.message });
  }
});

// GET /api/clients/:id
app.get('/api/clients/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client', message: err.message });
  }
});

// POST /api/clients
app.post('/api/clients', async (req, res) => {
  try {
    const { name, email, phone, address, gstin, client_type, address_line1, address_line2, district, city, state, pincode, country, pan, notes, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });
    const result = await pool.query(
      `INSERT INTO clients (name, email, phone, address, gstin, client_type, address_line1, address_line2, district, city, state, pincode, country, pan, notes, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [name, email || null, phone || null, address || null, gstin || null, client_type || null, address_line1 || null, address_line2 || null, district || null, city || null, state || null, pincode || null, country || null, pan || null, notes || null, tags || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create client', message: err.message });
  }
});

// PUT /api/clients/:id
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name, email, phone, address, gstin, client_type, address_line1, address_line2, district, city, state, pincode, country, pan, notes, tags } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });
    const result = await pool.query(
      `UPDATE clients SET name=$1, email=$2, phone=$3, address=$4, gstin=$5, client_type=$6, address_line1=$7, address_line2=$8, district=$9, city=$10, state=$11, pincode=$12, country=$13, pan=$14, notes=$15, tags=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [name, email || null, phone || null, address || null, gstin || null, client_type || null, address_line1 || null, address_line2 || null, district || null, city || null, state || null, pincode || null, country || null, pan || null, notes || null, tags || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client', message: err.message });
  }
});

// DELETE /api/clients/:id
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM clients WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted', client: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete client', message: err.message });
  }
});

// GET /api/clients/:id/invoices
app.get('/api/clients/:id/invoices', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE client_id=$1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client invoices', message: err.message });
  }
});

// ============================================================
// INVOICES ENDPOINTS
// ============================================================

// GET /api/invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const { status, search, client_id, startDate, endDate } = req.query;
    let query  = `SELECT i.*, COALESCE(i.client_name, c.name) AS client_name_display
                  FROM invoices i LEFT JOIN clients c ON i.client_id = c.id`;
    const params = [];
    const conditions = ['i.is_deleted = FALSE'];

    if (status)    { params.push(status);          conditions.push(`i.status = $${params.length}`); }
    if (client_id) { params.push(client_id);        conditions.push(`i.client_id = $${params.length}`); }
    if (startDate && endDate) {
      params.push(startDate, endDate);
      conditions.push(`i.invoice_date >= $${params.length - 1} AND i.invoice_date <= $${params.length}`);
    }
    if (search)    { params.push(`%${search}%`);    conditions.push(`(i.invoice_number ILIKE $${params.length} OR COALESCE(i.client_name, c.name) ILIKE $${params.length})`); }

    if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY i.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /invoices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch invoices', message: err.message });
  }
});
// ============================================================
// NEXT INVOICE NUMBER
// ============================================================
app.get('/api/invoices/next-number', async (req, res) => {
  try {
    const num = await generateInvoiceNumber();
    res.json({ invoice_number: num });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate invoice number', message: err.message });
  }
});

// POST /api/invoices/bulk-import
app.post('/api/invoices/bulk-import', async (req, res) => {
  const client = await pool.connect();
  try {
    const { invoices } = req.body;
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ error: 'No invoices provided' });
    }

    await client.query('BEGIN');
    let importedCount = 0;

    for (const inv of invoices) {
      const clientName = (inv['Client Name'] || inv['Client'] || 'Unknown Client').trim();
      const clientEmail = (inv['Client Email'] || inv['Email'] || '').trim();
      
      let invoiceNumber = (inv['Invoice Number'] || inv['Invoice #'] || '');
      if (!invoiceNumber) {
         invoiceNumber = await generateInvoiceNumber(client);
      }

      // Parse dates properly
      let invoiceDate = inv['Invoice Date'] || inv['Date'] || new Date().toISOString().split('T')[0];
      let dueDate = inv['Due Date'] || new Date().toISOString().split('T')[0];

      const subtotal = parseFloat(inv['Subtotal'] || inv['Amount'] || inv['Total'] || 0) || 0;
      const gstAmount = parseFloat(inv['GST Amount'] || inv['Tax'] || 0) || 0;
      const discount = parseFloat(inv['Discount'] || 0) || 0;
      const total = parseFloat(inv['Total Amount'] || inv['Total'] || (subtotal + gstAmount - discount)) || 0;
      
      let rawStatus = (inv['Status'] || 'paid').toString().toLowerCase();
      if (rawStatus !== 'paid' && rawStatus !== 'unpaid' && rawStatus !== 'draft') {
        rawStatus = 'paid';
      }

      // Check if client exists
      let clientId = null;
      let existingClientResult = null;
      if (clientEmail) {
        existingClientResult = await client.query('SELECT id FROM clients WHERE email = $1', [clientEmail]);
      }
      if (!existingClientResult || existingClientResult.rows.length === 0) {
        existingClientResult = await client.query('SELECT id FROM clients WHERE name = $1', [clientName]);
      }

      if (existingClientResult && existingClientResult.rows.length > 0) {
        clientId = existingClientResult.rows[0].id;
      } else {
        // Create new client
        const newClient = await client.query(
          `INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id`,
          [clientName, clientEmail]
        );
        clientId = newClient.rows[0].id;
      }

      // Check if invoice number already exists
      const existingInv = await client.query('SELECT id FROM invoices WHERE invoice_number = $1', [invoiceNumber]);
      let finalInvoiceNumber = invoiceNumber;
      if (existingInv.rows.length > 0) {
         finalInvoiceNumber = await generateInvoiceNumber(client); 
      }

      // Insert invoice
      const invoiceRes = await client.query(
        `INSERT INTO invoices 
          (invoice_number, client_id, client_name, client_email, invoice_date, due_date, status, subtotal, gst_amount, discount, total, created_at, updated_at) 
         VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING id`,
        [finalInvoiceNumber, clientId, clientName, clientEmail, invoiceDate, dueDate, rawStatus, subtotal, gstAmount, discount, total]
      );
      const invoiceId = invoiceRes.rows[0].id;

      // Insert a generic line item
      await client.query(
        `INSERT INTO invoice_items 
          (invoice_id, item_name, quantity, rate, amount, gst_amount, total)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7)`,
        [invoiceId, 'Imported Invoice Total', 1, subtotal, subtotal, gstAmount, total]
      );

      importedCount++;
    }

    await client.query('COMMIT');
    res.json({ message: 'Import successful', importedCount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Failed to import invoices', message: err.message });
  } finally {
    client.release();
  }
});

// GET /api/invoices/recycle-bin
app.get('/api/invoices/recycle-bin', async (req, res) => {
  try {
    const query = `SELECT i.*, COALESCE(i.client_name, c.name) AS client_name_display 
                   FROM invoices i LEFT JOIN clients c ON i.client_id = c.id 
                   WHERE i.is_deleted = TRUE ORDER BY i.updated_at DESC`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deleted invoices', message: err.message });
  }
});

// GET /api/invoices/:id
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoiceRes = await pool.query(
      `SELECT i.*, COALESCE(i.client_name, c.name) AS client_name_display, c.gstin AS client_gstin_from_table
       FROM invoices i LEFT JOIN clients c ON i.client_id = c.id WHERE i.id=$1`,
      [req.params.id]
    );
    if (invoiceRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = invoiceRes.rows[0];
    const itemsRes = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id ASC',
      [invoice.id]
    );
    invoice.items = itemsRes.rows;
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice', message: err.message });
  }
});

// POST /api/invoices
app.post('/api/invoices', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let {
      invoice_number, invoice_date, due_date, client_id,
      client_name, client_email, client_phone, client_address, client_gstin,
      description, items = [], discount = 0, extra_charges = 0, status = 'draft', notes, is_roundoff, is_roundup
    } = req.body;

    // Auto-generate invoice number if not provided
    if (!invoice_number) {
      invoice_number = await generateInvoiceNumber();
    }
    if (!invoice_date) invoice_date = new Date().toISOString().split('T')[0];

    // Calculate totals
    let subtotal   = 0;
    let gst_amount = 0;
    for (const item of items) {
      const qty     = parseFloat(item.quantity) || 0;
      const rate    = parseFloat(item.rate)     || 0;
      const gstRate = parseFloat(item.gst_rate) || 0;
      const itemAmt = qty * rate;
      const itemGst = itemAmt * gstRate / 100;
      subtotal   += itemAmt;
      gst_amount += itemGst;
    }
    let total = subtotal + gst_amount - parseFloat(discount) + parseFloat(extra_charges);
    if (is_roundup) {
      total = Math.ceil(total);
    } else if (is_roundoff) {
      total = Math.round(total);
    }

    // Fetch client details if client_id given
    if (client_id && !client_name) {
      const cr = await client.query('SELECT * FROM clients WHERE id=$1', [client_id]);
      if (cr.rows.length) {
        const c = cr.rows[0];
        client_name    = client_name    || c.name;
        client_email   = client_email   || c.email;
        client_phone   = client_phone   || c.phone;
        client_address = client_address || c.address;
        client_gstin   = client_gstin   || c.gstin;
      }
    }

    const invRes = await client.query(
      `INSERT INTO invoices
        (invoice_number, invoice_date, due_date, client_id, client_name, client_email,
         client_phone, client_address, client_gstin, description, subtotal, gst_amount,
         discount, extra_charges, total, status, notes, is_roundoff, is_roundup)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [invoice_number, invoice_date, due_date || null, client_id || null,
       client_name || null, client_email || null, client_phone || null,
       client_address || null, client_gstin || null, description || null,
       subtotal.toFixed(2), gst_amount.toFixed(2),
       parseFloat(discount).toFixed(2), parseFloat(extra_charges).toFixed(2),
       total.toFixed(2), status, notes || null, Boolean(is_roundoff), Boolean(is_roundup)]
    );
    const invoice = invRes.rows[0];

    // Insert items
    for (const item of items) {
      const qty     = parseFloat(item.quantity) || 0;
      const rate    = parseFloat(item.rate)     || 0;
      const gstRate = parseFloat(item.gst_rate) || 0;
      const amount  = qty * rate;
      const itemGst = amount * gstRate / 100;
      const itemTot = amount + itemGst;
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_name, hsn_sac, description, quantity, rate, gst_rate, amount, gst_amount, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [invoice.id, item.item_name, item.hsn_sac || null, item.description || null, qty, rate, gstRate,
         amount.toFixed(2), itemGst.toFixed(2), itemTot.toFixed(2)]
      );
    }

    await client.query('COMMIT');

    // Fetch complete invoice
    const full = await pool.query('SELECT * FROM invoices WHERE id=$1', [invoice.id]);
    const itemsFull = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [invoice.id]);
    const result = { ...full.rows[0], items: itemsFull.rows };
    res.status(201).json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /invoices error:', err.message);
    res.status(500).json({ error: 'Failed to create invoice', message: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/invoices/:id
app.put('/api/invoices/:id', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    let {
      invoice_number, invoice_date, due_date, client_id,
      client_name, client_email, client_phone, client_address, client_gstin,
      description, items = [], discount = 0, extra_charges = 0, status, notes, is_roundoff, is_roundup
    } = req.body;

    // Check invoice exists
    const existing = await dbClient.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    // Calculate totals
    let subtotal = 0, gst_amount = 0;
    for (const item of items) {
      const qty     = parseFloat(item.quantity) || 0;
      const rate    = parseFloat(item.rate)     || 0;
      const gstRate = parseFloat(item.gst_rate) || 0;
      const amt     = qty * rate;
      subtotal   += amt;
      gst_amount += amt * gstRate / 100;
    }
    let total = subtotal + gst_amount - parseFloat(discount) + parseFloat(extra_charges);
    if (is_roundup) {
      total = Math.ceil(total);
    } else if (is_roundoff) {
      total = Math.round(total);
    }

    await dbClient.query(
      `UPDATE invoices SET
        invoice_number=$1, invoice_date=$2, due_date=$3, client_id=$4,
        client_name=$5, client_email=$6, client_phone=$7, client_address=$8, client_gstin=$9,
        description=$10, subtotal=$11, gst_amount=$12, discount=$13, extra_charges=$14,
        total=$15, status=$16, notes=$17, is_roundoff=$18, is_roundup=$19, updated_at=NOW()
       WHERE id=$20`,
      [invoice_number, invoice_date, due_date || null, client_id || null,
       client_name || null, client_email || null, client_phone || null,
       client_address || null, client_gstin || null, description || null,
       subtotal.toFixed(2), gst_amount.toFixed(2),
       parseFloat(discount).toFixed(2), parseFloat(extra_charges).toFixed(2),
       total.toFixed(2), status || existing.rows[0].status, notes || null, Boolean(is_roundoff), Boolean(is_roundup), req.params.id]
    );

    // Replace items
    await dbClient.query('DELETE FROM invoice_items WHERE invoice_id=$1', [req.params.id]);
    for (const item of items) {
      const qty     = parseFloat(item.quantity) || 0;
      const rate    = parseFloat(item.rate)     || 0;
      const gstRate = parseFloat(item.gst_rate) || 0;
      const amount  = qty * rate;
      const itemGst = amount * gstRate / 100;
      await dbClient.query(
        `INSERT INTO invoice_items (invoice_id, item_name, hsn_sac, description, quantity, rate, gst_rate, amount, gst_amount, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.id, item.item_name, item.hsn_sac || null, item.description || null, qty, rate, gstRate,
         amount.toFixed(2), itemGst.toFixed(2), (amount + itemGst).toFixed(2)]
      );
    }

    await dbClient.query('COMMIT');
    const full      = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    const itemsFull = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [req.params.id]);
    res.json({ ...full.rows[0], items: itemsFull.rows });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update invoice', message: err.message });
  } finally {
    dbClient.release();
  }
});

// DELETE /api/invoices/:id (Soft Delete)
app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE invoices SET is_deleted = TRUE, invoice_number = invoice_number || '-deleted-' || id 
       WHERE id=$1 RETURNING *`, 
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice moved to recycle bin', invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete invoice', message: err.message });
  }
});

// POST /api/invoices/:id/restore
app.post('/api/invoices/:id/restore', async (req, res) => {
  try {
    // Generate a fresh invoice number in case the old one was reused
    const newNum = await generateInvoiceNumber();
    const result = await pool.query(
      `UPDATE invoices SET is_deleted = FALSE, invoice_number = $1 WHERE id=$2 RETURNING *`, 
      [newNum, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice restored', invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore invoice', message: err.message });
  }
});

// DELETE /api/invoices/:id/permanent
app.delete('/api/invoices/:id/permanent', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM invoices WHERE id=$1 AND is_deleted = TRUE RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found or not in recycle bin' });
    res.json({ message: 'Invoice permanently deleted', invoice: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete invoice', message: err.message });
  }
});

// POST /api/invoices/:id/duplicate
app.post('/api/invoices/:id/duplicate', async (req, res) => {
  try {
    const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv   = invRes.rows[0];
    const items = (await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1', [inv.id])).rows;

    const newNum = await generateInvoiceNumber();
    const newInv = await pool.query(
      `INSERT INTO invoices (invoice_number, invoice_date, client_id, client_name, client_email,
        client_phone, client_address, client_gstin, description, subtotal, gst_amount,
        discount, extra_charges, total, status, notes)
       VALUES ($1,NOW(),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14) RETURNING *`,
      [newNum, inv.client_id, inv.client_name, inv.client_email, inv.client_phone,
       inv.client_address, inv.client_gstin, inv.description, inv.subtotal, inv.gst_amount,
       inv.discount, inv.extra_charges, inv.total, inv.notes]
    );
    for (const item of items) {
      await pool.query(
        `INSERT INTO invoice_items (invoice_id, item_name, hsn_sac, description, quantity, rate, gst_rate, amount, gst_amount, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [newInv.rows[0].id, item.item_name, item.hsn_sac || null, item.description, item.quantity, item.rate,
         item.gst_rate, item.amount, item.gst_amount, item.total]
      );
    }
    res.status(201).json(newInv.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate invoice', message: err.message });
  }
});

// ============================================================
// PAYMENT ENDPOINTS
// ============================================================

// POST /api/invoices/:id/mark-paid
app.post('/api/invoices/:id/mark-paid', async (req, res) => {
  try {
    const { paid_date, paid_amount, payment_method, payment_remarks } = req.body;
    const inv = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (inv.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const result = await pool.query(
      `UPDATE invoices SET status='paid', paid_date=$1, paid_amount=$2, payment_method=$3, payment_remarks=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [paid_date || new Date().toISOString().split('T')[0],
       paid_amount || inv.rows[0].total,
       payment_method || 'bank',
       payment_remarks || null,
       req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark invoice as paid', message: err.message });
  }
});

// POST /api/invoices/:id/mark-unpaid
app.post('/api/invoices/:id/mark-unpaid', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE invoices SET status='unpaid', paid_date=NULL, paid_amount=0, payment_method=NULL, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark invoice as unpaid', message: err.message });
  }
});

// ============================================================
// REPORTS ENDPOINTS
// ============================================================

// GET /api/reports/dashboard
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    const { startDate, endDate, prevStartDate, prevEndDate } = req.query;
    let mainFilter = '';
    let prevFilter = `WHERE invoice_date >= CURRENT_DATE - 60 AND invoice_date < CURRENT_DATE - 30`;
    let currentPeriodFilter = `WHERE invoice_date >= CURRENT_DATE - 30`;
    
    const params = [];
    if (startDate && endDate) {
      mainFilter = `WHERE invoice_date >= $1 AND invoice_date <= $2`;
      currentPeriodFilter = mainFilter;
      params.push(startDate, endDate);
      
      if (prevStartDate && prevEndDate) {
        prevFilter = `WHERE invoice_date >= $3 AND invoice_date <= $4`;
        params.push(prevStartDate, prevEndDate);
      } else {
        prevFilter = `WHERE 1=0`; // No prev data
      }
    }

    const statsQ2 = await pool.query(`
      SELECT
        COUNT(*)                                                            AS total_invoices,
        COALESCE(SUM(total), 0)                                            AS total_revenue,
        COALESCE(SUM(CASE WHEN status='paid'   THEN total ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN status='unpaid' THEN total ELSE 0 END), 0) AS unpaid_amount,
        COALESCE(SUM(CASE WHEN status='draft' THEN total ELSE 0 END), 0)  AS draft_amount,
        COUNT(CASE WHEN status='paid'   THEN 1 END)                        AS paid_count,
        COUNT(CASE WHEN status='unpaid' THEN 1 END)                        AS unpaid_count,
        COUNT(CASE WHEN status='draft' THEN 1 END)                         AS draft_count
      FROM invoices
      ${mainFilter}
    `, params.slice(0, 2));

    const currentPeriodQ = await pool.query(`
      SELECT
        COUNT(*) AS cur_total_invoices,
        COALESCE(SUM(total), 0) AS cur_total_revenue,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) AS cur_paid_amount,
        COALESCE(SUM(CASE WHEN status='unpaid' THEN total ELSE 0 END), 0) AS cur_unpaid_amount
      FROM invoices
      ${currentPeriodFilter}
    `, params.slice(0, 2));

    const prevPeriodQ = await pool.query(`
      SELECT
        COUNT(*) AS prev_total_invoices,
        COALESCE(SUM(total), 0) AS prev_total_revenue,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) AS prev_paid_amount,
        COALESCE(SUM(CASE WHEN status='unpaid' THEN total ELSE 0 END), 0) AS prev_unpaid_amount
      FROM invoices
      ${prevFilter}
    `, params); // params contains all 4 if provided

    const clientCount = await pool.query('SELECT COUNT(*) AS client_count FROM clients');
    
    const stats = { 
      ...statsQ2.rows[0], 
      current_period: currentPeriodQ.rows[0],
      prev_period: prevPeriodQ.rows[0],
      client_count: clientCount.rows[0].client_count 
    };
    res.json(stats);
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', message: err.message });
  }
});

// GET /api/reports/monthly-revenue
app.get('/api/reports/monthly-revenue', async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;
    let dateFilter = `invoice_date >= NOW() - INTERVAL '12 months'`;
    const params = [];
    if (startDate && endDate) {
      dateFilter = `invoice_date >= $1 AND invoice_date <= $2`;
      params.push(startDate, endDate);
    }

    let truncLevel = 'month';
    let formatString = 'Mon YYYY';
    if (groupBy === 'day') {
      truncLevel = 'day';
      formatString = 'DD Mon YYYY';
    } else if (groupBy === 'week') {
      truncLevel = 'week';
      formatString = 'DD Mon YYYY';
    }

    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('${truncLevel}', invoice_date), '${formatString}') AS month,
        DATE_TRUNC('${truncLevel}', invoice_date)                       AS month_date,
        COUNT(*)                                                AS invoice_count,
        COALESCE(SUM(total), 0)                                AS total_revenue,
        COALESCE(SUM(CASE WHEN status='paid' THEN total ELSE 0 END), 0) AS paid_revenue
      FROM invoices
      WHERE ${dateFilter}
      GROUP BY month, month_date
      ORDER BY month_date DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch monthly revenue', message: err.message });
  }
});

// GET /api/reports/top-clients
app.get('/api/reports/top-clients', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      dateFilter = `AND i.invoice_date >= $1 AND i.invoice_date <= $2`;
      params.push(startDate, endDate);
    }
    const result = await pool.query(`
      SELECT
        c.id, c.name, c.email, c.phone,
        COUNT(i.id)                                                            AS invoice_count,
        COALESCE(SUM(i.total), 0)                                             AS total_revenue,
        COALESCE(SUM(CASE WHEN i.status='paid'   THEN i.total ELSE 0 END), 0) AS paid_amount,
        COALESCE(SUM(CASE WHEN i.status='unpaid' THEN i.total ELSE 0 END), 0) AS pending_amount
      FROM clients c
      LEFT JOIN invoices i ON c.id = i.client_id ${dateFilter}
      GROUP BY c.id, c.name, c.email, c.phone
      ORDER BY total_revenue DESC
      LIMIT 10
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch top clients', message: err.message });
  }
});

// GET /api/reports/unpaid-invoices
app.get('/api/reports/unpaid-invoices', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      dateFilter = `AND i.invoice_date >= $1 AND i.invoice_date <= $2`;
      params.push(startDate, endDate);
    }
    const result = await pool.query(`
      SELECT
        i.id, i.invoice_number, i.invoice_date, i.total,
        COALESCE(i.client_name, c.name)  AS client_name,
        COALESCE(i.client_email, c.email) AS client_email,
        CURRENT_DATE - i.invoice_date    AS days_pending
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.status = 'unpaid' ${dateFilter}
      ORDER BY i.invoice_date ASC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch unpaid invoices', message: err.message });
  }
});

// GET /api/reports/paid-invoices
app.get('/api/reports/paid-invoices', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      dateFilter = `AND i.invoice_date >= $1 AND i.invoice_date <= $2`;
      params.push(startDate, endDate);
    }
    const result = await pool.query(`
      SELECT
        i.id, i.invoice_number, i.invoice_date, i.total,
        COALESCE(i.client_name, c.name)  AS client_name,
        COALESCE(i.client_email, c.email) AS client_email,
        CURRENT_DATE - i.invoice_date    AS days_since_invoiced
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.status = 'paid' ${dateFilter}
      ORDER BY i.invoice_date DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch paid invoices', message: err.message });
  }
});

// GET /api/reports/tax-summary
app.get('/api/reports/tax-summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = `invoice_date >= NOW() - INTERVAL '12 months'`;
    const params = [];
    if (startDate && endDate) {
      dateFilter = `invoice_date >= $1 AND invoice_date <= $2`;
      params.push(startDate, endDate);
    }
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', invoice_date), 'Mon YYYY') AS month,
        DATE_TRUNC('month', invoice_date)                       AS month_date,
        COUNT(*)                                                AS invoice_count,
        COALESCE(SUM(subtotal), 0)                             AS total_subtotal,
        COALESCE(SUM(gst_amount), 0)                           AS total_gst,
        COALESCE(SUM(total), 0)                                AS total_amount
      FROM invoices
      WHERE ${dateFilter}
      GROUP BY month, month_date
      ORDER BY month_date DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tax summary', message: err.message });
  }
});

// GET /api/reports/item-sales
app.get('/api/reports/item-sales', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];
    if (startDate && endDate) {
      dateFilter = `AND i.invoice_date >= $1 AND i.invoice_date <= $2`;
      params.push(startDate, endDate);
    }
    const result = await pool.query(`
      SELECT
        ii.item_name,
        SUM(ii.quantity) AS total_quantity,
        SUM(ii.amount) AS total_revenue,
        SUM(ii.gst_amount) AS total_gst,
        SUM(ii.total) AS total_amount
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE 1=1 ${dateFilter}
      GROUP BY ii.item_name
      ORDER BY total_revenue DESC
      LIMIT 50
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch item sales', message: err.message });
  }
});
// ============================================================
// SETTINGS ENDPOINTS
// ============================================================

// GET /api/settings/env
app.get('/api/settings/env', (req, res) => {
  res.json({
    DB_HOST: process.env.DB_HOST || '',
    DB_PORT: process.env.DB_PORT || '',
    DB_NAME: process.env.DB_NAME || '',
    DB_USER: process.env.DB_USER || '',
    DB_PASSWORD: process.env.DB_PASSWORD || '',
    DB_SSL: process.env.DB_SSL || 'false',
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || ''
  });
});

// POST /api/settings/env
app.post('/api/settings/env', async (req, res) => {
  try {
    const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL, SENDGRID_API_KEY, SENDGRID_FROM_EMAIL } = req.body;
    
    // Update process.env
    if (DB_HOST !== undefined) process.env.DB_HOST = DB_HOST;
    if (DB_PORT !== undefined) process.env.DB_PORT = DB_PORT;
    if (DB_NAME !== undefined) process.env.DB_NAME = DB_NAME;
    if (DB_USER !== undefined) process.env.DB_USER = DB_USER;
    if (DB_PASSWORD !== undefined) process.env.DB_PASSWORD = DB_PASSWORD;
    if (DB_SSL !== undefined) process.env.DB_SSL = String(DB_SSL);
    if (SENDGRID_API_KEY !== undefined) {
      process.env.SENDGRID_API_KEY = SENDGRID_API_KEY;
      if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);
    }
    if (SENDGRID_FROM_EMAIL !== undefined) process.env.SENDGRID_FROM_EMAIL = SENDGRID_FROM_EMAIL;

    // Update .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const setEnvVar = (content, key, value) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      } else {
        return content + (content.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
      }
    };

    if (DB_HOST !== undefined) envContent = setEnvVar(envContent, 'DB_HOST', DB_HOST);
    if (DB_PORT !== undefined) envContent = setEnvVar(envContent, 'DB_PORT', DB_PORT);
    if (DB_NAME !== undefined) envContent = setEnvVar(envContent, 'DB_NAME', DB_NAME);
    if (DB_USER !== undefined) envContent = setEnvVar(envContent, 'DB_USER', DB_USER);
    if (DB_PASSWORD !== undefined) envContent = setEnvVar(envContent, 'DB_PASSWORD', DB_PASSWORD);
    if (DB_SSL !== undefined) envContent = setEnvVar(envContent, 'DB_SSL', DB_SSL);
    if (SENDGRID_API_KEY !== undefined) envContent = setEnvVar(envContent, 'SENDGRID_API_KEY', SENDGRID_API_KEY);
    if (SENDGRID_FROM_EMAIL !== undefined) envContent = setEnvVar(envContent, 'SENDGRID_FROM_EMAIL', SENDGRID_FROM_EMAIL);

    fs.writeFileSync(envPath, envContent.trim() + '\n');

    // Re-initialize database connection
    await initDB();

    // Verify connection worked
    try {
      await pool.query('SELECT NOW()');
      res.json({ message: 'Environment variables updated and database connected successfully.' });
    } catch (dbErr) {
      res.status(500).json({ error: 'Settings saved, but database connection failed', message: dbErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update environment variables', message: err.message });
  }
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    if (result.rows.length === 0) {
      await pool.query('INSERT INTO settings (id) VALUES (1)');
      return res.json({ id: 1, company_name: 'Ankit Infotech And Solution', company_gstin: '08BHQPB3266F1ZB' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings', message: err.message });
  }
});

// PUT /api/settings
app.put('/api/settings', async (req, res) => {
  try {
    const {
      company_name, company_gstin, company_address, company_phone,
      company_email, company_website, invoice_prefix, default_gst_rate, default_due_days,
      bank_name, bank_account_name, bank_account_number, bank_ifsc, bank_branch, upi_id,
      terms_and_conditions, additional_notes, footer_message
    } = req.body;
    const result = await pool.query(
      `UPDATE settings SET
        company_name=$1, company_gstin=$2, company_address=$3, company_phone=$4,
        company_email=$5, company_website=$6, invoice_prefix=$7,
        default_gst_rate=$8, default_due_days=$9,
        bank_name=$10, bank_account_name=$11, bank_account_number=$12,
        bank_ifsc=$13, bank_branch=$14, upi_id=$15,
        terms_and_conditions=$16, additional_notes=$17, footer_message=$18,
        updated_at=NOW()
       WHERE id=1 RETURNING *`,
      [company_name, company_gstin, company_address, company_phone,
       company_email, company_website, invoice_prefix || 'INV',
       default_gst_rate || 18, default_due_days || 30,
       bank_name || '', bank_account_name || '', bank_account_number || '',
       bank_ifsc || '', bank_branch || '', upi_id || '',
       terms_and_conditions || '', additional_notes || '', footer_message || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings', message: err.message });
  }
});

// POST /api/settings/upload  — saves a base64 image (logo or signature) to DB
app.post('/api/settings/upload', async (req, res) => {
  try {
    const { field, dataUrl } = req.body;
    const allowed = ['company_logo_url', 'signature_url'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image data' });
    // Limit size ~2MB base64
    if (dataUrl.length > 2 * 1024 * 1024 * 1.4) return res.status(400).json({ error: 'Image too large. Max 2MB.' });
    await pool.query(`UPDATE settings SET ${field}=$1, updated_at=NOW() WHERE id=1`, [dataUrl]);
    const result = await pool.query('SELECT * FROM settings WHERE id=1');
    res.json({ success: true, settings: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload image', message: err.message });
  }
});

// DELETE /api/settings/upload — removes a logo or signature
app.delete('/api/settings/upload', async (req, res) => {
  try {
    const { field } = req.body;
    const allowed = ['company_logo_url', 'signature_url'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    await pool.query(`UPDATE settings SET ${field}=NULL, updated_at=NOW() WHERE id=1`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove image', message: err.message });
  }
});

// ============================================================
// EMAIL ENDPOINTS
// ============================================================

// â”€â”€ Number to Words (same as frontend) â”€â”€
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000)     return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+convert(n%100) : '');
    if (n < 100000)   return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+convert(n%10000000) : '');
  }
  return convert(num);
}

const fmtCurr = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

// Generate PDF buffer for an invoice â€” renders the SAME HTML as InvoicePreview.jsx
const generateInvoicePDF = async (invoiceId) => {
  const invRes  = await pool.query('SELECT * FROM invoices WHERE id=$1', [invoiceId]);
  const itemRes = await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [invoiceId]);
  const setRes  = await pool.query('SELECT * FROM settings WHERE id=1');

  const inv      = invRes.rows[0];
  const items    = itemRes.rows;
  const settings = setRes.rows[0] || {};
  const co       = settings;

  let subtotal = 0, totalCGST = 0, totalSGST = 0;
  const rows = items.map(item => {
    const qty     = parseFloat(item.quantity) || 0;
    const rate    = parseFloat(item.rate)     || 0;
    const gstRate = parseFloat(item.gst_rate) || 0;
    const amount  = qty * rate;
    const cgstR   = gstRate / 2;
    const sgstR   = gstRate / 2;
    const cgstAmt = amount * cgstR / 100;
    const sgstAmt = amount * sgstR / 100;
    const total   = amount + cgstAmt + sgstAmt;
    subtotal  += amount;
    totalCGST += cgstAmt;
    totalSGST += sgstAmt;
    return { ...item, qty, rate, amount, gstRate, cgstR, sgstR, cgstAmt, sgstAmt, total };
  });

  const discount     = parseFloat(inv.discount)      || 0;
  const extraCharges = parseFloat(inv.extra_charges)  || 0;
  let grandTotal   = subtotal + totalCGST + totalSGST - discount + extraCharges;
  
  let roundoff = 0;
  if (inv.is_roundup) {
    const rounded = Math.ceil(grandTotal);
    roundoff = rounded - grandTotal;
    grandTotal = rounded;
  } else if (inv.is_roundoff) {
    const rounded = Math.round(grandTotal);
    roundoff = rounded - grandTotal;
    grandTotal = rounded;
  }

  const hasBankDetails = co.bank_name || co.bank_account_number || co.bank_ifsc;

  let qrDataUrl = null;
  const upiId = co.upi_id;
  if (upiId) {
    try {
      const upiUrl = [
        `upi://pay`,
        `?pa=${encodeURIComponent(upiId)}`,
        `&pn=${encodeURIComponent(co.company_name || '')}`,
        `&am=${grandTotal.toFixed(2)}`,
        `&cu=INR`,
        `&tn=${encodeURIComponent(`Invoice ${inv.invoice_number || ''}`)}`,
      ].join('');
      qrDataUrl = await QRCode.toDataURL(upiUrl, { width: 130, margin: 1, color: { dark: '#1a2420', light: '#ffffff' } });
    } catch (e) { }
  }
  const hasQR = qrDataUrl && upiId;

  const formatDate = (d) => {
    if (!d) return 'â€”';
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(dt.getDate()).padStart(2,'0')} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const statusColor = inv.status === 'paid' ? '#22c55e' : inv.status === 'unpaid' ? '#ef4444' : '#d97706';
  const pColor = '#1a3c8f';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;background:#fff;color:#111;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:8mm;}
  table{width:100%;border-collapse:collapse;}
  th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
</style>
</head><body>
<div style="background:white;width:100%;padding:20px 24px;font-family:'Inter',sans-serif;">

  <!-- HEADER -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:10px;border-bottom:2.5px solid ${pColor};">
    <!-- Left: logo + company -->
    <div style="display:flex;gap:12px;align-items:flex-start;">
      ${co.company_logo_url ? `
        <div style="width:68px;height:68px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <img src="${co.company_logo_url}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;"/>
        </div>
      ` : `
        <div style="width:68px;height:68px;background:${pColor};border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
          <div style="font-size:34px;font-weight:900;color:white;line-height:1;">${(co.company_name || 'A').charAt(0).toUpperCase()}</div>
          <div style="font-size:6px;color:rgba(255,255,255,0.85);text-align:center;padding:2px 3px;line-height:1.3;white-space:pre-line;">${(co.company_name || 'Company').split(' ').slice(0,3).join('\n')}</div>
        </div>
      `}
      <div>
        <div style="font-size:16px;font-weight:800;color:${pColor};margin-bottom:4px;">${co.company_name || 'Your Company'}</div>
        <div style="font-size:9.5px;color:#333;line-height:1.75;">
          ${co.company_address ? `<div>${co.company_address}</div>` : ''}
          ${co.company_gstin ? `<div><b>GSTIN:</b> ${co.company_gstin}</div>` : ''}
          ${co.company_email ? `<div><b>Email:</b> ${co.company_email}</div>` : ''}
          ${co.company_phone ? `<div><b>Phone:</b> ${co.company_phone}</div>` : ''}
        </div>
      </div>
    </div>
    <!-- Right: TAX INVOICE + meta + QR -->
    <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
      <div style="font-size:21px;font-weight:900;color:${pColor};letter-spacing:1px;">TAX INVOICE</div>
      <table style="font-size:9.5px;border-collapse:collapse;text-align:left;">
        <tbody>
          <tr><td style="padding:1.5px 6px;color:#666;">Invoice No.</td><td style="padding:1.5px 4px;">:</td><td style="padding:1.5px 6px;font-weight:700;">${inv.invoice_number || 'N/A'}</td></tr>
          <tr><td style="padding:1.5px 6px;color:#666;">Invoice Date</td><td style="padding:1.5px 4px;">:</td><td style="padding:1.5px 6px;font-weight:700;">${formatDate(inv.invoice_date)}</td></tr>
          <tr><td style="padding:1.5px 6px;color:#666;">Due Date</td><td style="padding:1.5px 4px;">:</td><td style="padding:1.5px 6px;font-weight:700;">${formatDate(inv.due_date)}</td></tr>
          <tr><td style="padding:1.5px 6px;color:#666;">Place of Supply</td><td style="padding:1.5px 4px;">:</td><td style="padding:1.5px 6px;font-weight:700;">${inv.client_state || 'Rajasthan (08)'}</td></tr>
          <tr><td style="padding:1.5px 6px;color:#666;">Reverse Charge</td><td style="padding:1.5px 4px;">:</td><td style="padding:1.5px 6px;font-weight:700;">No</td></tr>
        </tbody>
      </table>

    </div>
  </div>

  <!-- BILL TO / SHIP TO -->
  <div style="display:flex;gap:8px;margin-bottom:8px;">
    <div style="flex:1;border:1px solid #dde3f0;border-radius:4px;overflow:hidden;">
      <div style="background:${pColor};color:white;font-size:9.5px;font-weight:700;padding:3px 9px;">BILL TO</div>
      <div style="padding:7px 9px;font-size:9.5px;line-height:1.7;">
        <div style="font-weight:800;font-size:10.5px;color:#111;margin-bottom:2px;">${inv.client_name || 'N/A'}</div>
        <div style="color:#333;white-space:pre-wrap;">${inv.client_address || 'N/A'}</div>
        ${inv.client_gstin ? `<div><b>GSTIN:</b> ${inv.client_gstin}</div>` : ''}
        ${inv.client_phone ? `<div><b>Phone:</b> ${inv.client_phone}</div>` : ''}
        ${inv.client_email ? `<div><b>Email:</b> ${inv.client_email}</div>` : ''}
      </div>
    </div>
    <div style="flex:1;border:1px solid #dde3f0;border-radius:4px;overflow:hidden;">
      <div style="background:${pColor};color:white;font-size:9.5px;font-weight:700;padding:3px 9px;">SHIP TO</div>
      <div style="padding:7px 9px;font-size:9.5px;line-height:1.7;">
        <div style="font-weight:800;font-size:10.5px;color:#111;margin-bottom:2px;">${inv.ship_to_name || inv.client_name || 'N/A'}</div>
        <div style="color:#333;white-space:pre-wrap;">${inv.ship_to_address || inv.client_address || 'N/A'}</div>
        ${inv.ship_to_gstin ? `<div><b>GSTIN:</b> ${inv.ship_to_gstin}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- ITEMS TABLE -->
  <table style="width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:8px;border:1px solid #dde3f0;">
    <thead>
      <tr style="background:${pColor};color:white;">
        <th style="padding:6px 7px;text-align:center;font-weight:700;width:3%;border-right:1px solid rgba(255,255,255,0.2);">#</th>
        <th style="padding:6px 7px;text-align:left;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">ITEM DESCRIPTION</th>
        <th style="padding:6px 7px;text-align:center;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">HSN/SAC</th>
        <th style="padding:6px 7px;text-align:center;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">QTY</th>
        <th style="padding:6px 7px;text-align:right;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">RATE (Rs.)</th>
        <th style="padding:6px 7px;text-align:right;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">CGST (Rs.)</th>
        <th style="padding:6px 7px;text-align:right;font-weight:700;border-right:1px solid rgba(255,255,255,0.2);">SGST (Rs.)</th>
        <th style="padding:6px 7px;text-align:right;font-weight:700;">AMOUNT (Rs.)</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((item, i) => `
        <tr style="background:${i % 2 === 0 ? '#f5f7ff' : '#fff'};border-bottom:1px solid #dde3f0;">
          <td style="padding:5px 7px;text-align:center;color:#666;border-right:1px solid #dde3f0;">${i + 1}</td>
          <td style="padding:5px 7px;border-right:1px solid #dde3f0;">
            <div style="font-weight:700;color:#111;">${item.item_name}</div>
            ${item.description ? `<div style="font-size:8.5px;color:#777;margin-top:1px;">${item.description}</div>` : ''}
          </td>
          <td style="padding:5px 7px;text-align:center;color:#444;border-right:1px solid #dde3f0;">${item.hsn_sac || 'N/A'}</td>
          <td style="padding:5px 7px;text-align:center;color:#444;border-right:1px solid #dde3f0;">${item.qty}</td>
          <td style="padding:5px 7px;text-align:right;color:#444;border-right:1px solid #dde3f0;">${fmtCurr(item.rate)}</td>
          <td style="padding:5px 7px;text-align:right;color:#444;border-right:1px solid #dde3f0;">${fmtCurr(item.cgstAmt)}</td>
          <td style="padding:5px 7px;text-align:right;color:#444;border-right:1px solid #dde3f0;">${fmtCurr(item.sgstAmt)}</td>
          <td style="padding:5px 7px;text-align:right;font-weight:700;color:#111;">${fmtCurr(item.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- TOTALS ROW -->
  <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">
    <!-- Amount in words -->
    <div style="flex:1.5;font-size:9.5px;line-height:1.65;">
      <div style="font-weight:700;color:${pColor};margin-bottom:3px;font-size:10px;">Amount In Words</div>
      <div style="font-style:italic;color:#111;font-weight:600;">${numberToWords(Math.round(grandTotal))} Rupees Only</div>
    </div>
    <!-- Summary table -->
    <div style="flex:1.1;">
      <table style="width:100%;font-size:9.5px;border-collapse:collapse;border:1px solid #dde3f0;">
        <tbody>
          <tr style="border-bottom:1px solid #dde3f0;"><td style="padding:4px 8px;color:#555;">Subtotal</td><td style="padding:4px 8px;text-align:right;font-weight:700;">Rs.${fmtCurr(subtotal)}</td></tr>
          <tr style="border-bottom:1px solid #dde3f0;"><td style="padding:4px 8px;color:#555;">CGST (9%)</td><td style="padding:4px 8px;text-align:right;font-weight:700;">Rs.${fmtCurr(totalCGST)}</td></tr>
          <tr style="border-bottom:1px solid #dde3f0;"><td style="padding:4px 8px;color:#555;">SGST (9%)</td><td style="padding:4px 8px;text-align:right;font-weight:700;">Rs.${fmtCurr(totalSGST)}</td></tr>
          ${discount > 0 ? `<tr style="border-bottom:1px solid #dde3f0;"><td style="padding:4px 8px;color:#22c55e;">Discount</td><td style="padding:4px 8px;text-align:right;font-weight:700;color:#22c55e;">- Rs.${fmtCurr(discount)}</td></tr>` : ''}
          ${extraCharges > 0 ? `<tr style="border-bottom:1px solid #dde3f0;"><td style="padding:4px 8px;color:#555;">Extra Charges</td><td style="padding:4px 8px;text-align:right;font-weight:700;">Rs.${fmtCurr(extraCharges)}</td></tr>` : ''}
          <tr style="background:${pColor};"><td style="padding:6px 8px;color:white;font-weight:800;font-size:10.5px;">GRAND TOTAL</td><td style="padding:6px 8px;text-align:right;font-weight:900;font-size:13px;color:white;">Rs. ${fmtCurr(grandTotal)}</td></tr>
          ${roundoff !== 0 ? `<tr style="border-bottom:1px solid #dde3f0;"><td style="padding:3px 8px;color:#555;font-size:9px;">Rounded Off</td><td style="padding:3px 8px;text-align:right;font-weight:700;font-size:9px;">${roundoff > 0 ? '+' : ''}Rs.${fmtCurr(Math.abs(roundoff))}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  </div>

  <!-- TERMS & CONDITIONS + PAYMENT SUMMARY -->
  <div style="display:flex;gap:8px;margin-bottom:8px;">
    <div style="flex:1;border:1px solid #dde3f0;border-radius:4px;overflow:hidden;">
      <div style="background:#edf0fb;border-bottom:1px solid #dde3f0;padding:3px 9px;font-size:9.5px;font-weight:700;color:${pColor};">Terms &amp; Conditions</div>
      <div style="padding:6px 9px;font-size:9px;color:#444;line-height:1.75;">
        <ol style="margin:0;padding-left:14px;">
          ${(co.terms_and_conditions || inv.notes || '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged on overdue payments.\n3. All disputes are subject to Jaipur Jurisdiction.').split('\n').map((line) =>
            `<li style="margin-bottom:2px;">${line.replace(/^\d+\.\s*/, '')}</li>`
          ).join('')}
        </ol>
      </div>
    </div>
    <div style="flex:1;border:1px solid #dde3f0;border-radius:4px;overflow:hidden;">
      <div style="background:#edf0fb;border-bottom:1px solid #dde3f0;padding:3px 9px;font-size:9.5px;font-weight:700;color:${pColor};">Payment Summary</div>
      <div style="display:flex;align-items:center;padding:4px 9px;gap:12px;">
        ${hasQR ? `
          <div style="flex-shrink:0;text-align:center;">
            <div style="font-size:8.5px;font-weight:700;color:${pColor};margin-bottom:2px;">Scan &amp; Pay</div>
            <img src="${qrDataUrl}" alt="UPI QR" style="width:60px;height:60px;display:block;margin:0 auto;"/>
            <div style="font-size:7.5px;color:#555;margin-top:2px;">${co.upi_id}</div>
          </div>
        ` : ''}
        <table style="width:100%;font-size:9.5px;border-collapse:collapse;">
          <tbody>
            <tr style="border-bottom:1px solid #dde3f0;"><td style="padding:5px 9px;color:#555;">Total Invoice Value</td><td style="padding:5px 9px;text-align:right;font-weight:700;">Rs.${fmtCurr(grandTotal)}</td></tr>
            <tr style="border-bottom:1px solid #dde3f0;"><td style="padding:5px 9px;color:#22c55e;font-weight:600;">Amount Paid</td><td style="padding:5px 9px;text-align:right;font-weight:700;color:#22c55e;">Rs.${fmtCurr(inv.paid_amount || 0)}</td></tr>
            <tr><td style="padding:5px 9px;color:#ef4444;font-weight:700;">Balance Due</td><td style="padding:5px 9px;text-align:right;font-weight:800;font-size:11px;color:#ef4444;">Rs.${fmtCurr(grandTotal - (inv.paid_amount || 0))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- BANK DETAILS -->
  ${hasBankDetails ? `
  <div style="border:1px solid #dde3f0;border-radius:4px;overflow:hidden;margin-bottom:8px;">
    <div style="background:#edf0fb;border-bottom:1px solid #dde3f0;padding:3px 9px;font-size:9.5px;font-weight:700;color:${pColor};">Bank Details</div>
    <div style="padding:6px 9px;display:flex;gap:28px;font-size:9.5px;color:#333;line-height:1.75;">
      <table style="border-collapse:collapse;">
        <tbody>
          <tr><td style="padding-right:6px;font-weight:600;">Bank Name</td><td style="padding-right:6px;">:</td><td>${co.bank_name || 'N/A'}</td></tr>
          <tr><td style="font-weight:600;">A/c Number</td><td>:</td><td>${co.bank_account_number || 'N/A'}</td></tr>
        </tbody>
      </table>
      <table style="border-collapse:collapse;">
        <tbody>
          <tr><td style="padding-right:6px;font-weight:600;">Account Name</td><td style="padding-right:6px;">:</td><td>${co.bank_account_name || co.company_name || 'N/A'}</td></tr>
          <tr><td style="font-weight:600;">IFSC Code</td><td>:</td><td>${co.bank_ifsc || 'N/A'}</td></tr>
        </tbody>
      </table>
      ${co.upi_id ? `
      <table style="border-collapse:collapse;">
        <tbody>
          <tr><td style="padding-right:6px;font-weight:600;">Branch</td><td style="padding-right:6px;">:</td><td>${co.bank_branch || 'N/A'}</td></tr>
          <tr><td style="font-weight:600;">UPI ID</td><td>:</td><td>${co.upi_id}</td></tr>
        </tbody>
      </table>` : ''}
    </div>
  </div>
  ` : ''}

  <!-- FOOTER: SIGNATURE + THANK YOU -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;padding-top:7px;border-top:1px solid #dde3f0;">
    <div style="font-size:9.5px;color:#555;font-style:italic;">${co.additional_notes || 'Thank you for your business!'}</div>
    <div style="text-align:center;">
      <div style="height:42px;width:130px;border-bottom:1px dashed #999;margin-bottom:4px;position:relative;">
        ${co.signature_url ? `
          <img src="${co.signature_url}" alt="Signature" style="position:absolute;bottom:4px;left:0;right:0;margin:0 auto;max-height:38px;display:block;"/>
        ` : `
          <div style="position:absolute;bottom:4px;left:0;width:100%;font-size:17px;font-family:cursive;color:${pColor};text-align:center;">
            ${co.company_name ? co.company_name.split(' ').map(w => w[0]).join('') : 'Sign'}
          </div>
        `}
      </div>
      <div style="font-size:9.5px;font-weight:700;color:#333;">Authorized Signatory</div>
      <div style="font-size:8.5px;color:#888;margin-top:1px;">for ${co.company_name || 'Company'}</div>
    </div>
  </div>

  <div style="text-align:center;margin-top:10px;font-size:8.5px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:6px;">
    ${co.footer_message || 'This is a computer generated invoice'}
  </div>

</div>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};

// POST /api/emails/send-invoice
app.post('/api/emails/send-invoice', async (req, res) => {
  try {
    const { invoice_id, recipient_email } = req.body;
    if (!invoice_id || !recipient_email) {
      return res.status(400).json({ error: 'invoice_id and recipient_email are required' });
    }

    const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [invoice_id]);
    if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv    = invRes.rows[0];
    const setRes = await pool.query('SELECT * FROM settings WHERE id=1');
    const settings = setRes.rows[0] || {};

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ error: 'SendGrid API key not configured. Please add SENDGRID_API_KEY to .env' });
    }

    const pdfBuffer = await generateInvoicePDF(invoice_id);
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'ankitinfotechsolutions@gmail.com';
    const companyName = settings.company_name || 'Ankit Infotech And Solution';

    const msg = {
      to:      recipient_email,
      from:    { email: fromEmail, name: companyName },
      subject: `Invoice ${inv.invoice_number} from ${companyName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#0066cc;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h1 style="margin:0;font-size:24px">${companyName}</h1>
            <p style="margin:5px 0 0;opacity:0.9">Invoice ${inv.invoice_number}</p>
          </div>
          <div style="background:#fff;border:1px solid #e0e0e0;padding:30px;border-radius:0 0 8px 8px">
            <p>Dear ${inv.client_name || 'Valued Customer'},</p>
            <p>Please find your invoice attached. Here's a summary:</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0">
              <tr style="background:#f0f4ff">
                <td style="padding:10px;border:1px solid #ddd"><strong>Invoice Number</strong></td>
                <td style="padding:10px;border:1px solid #ddd">${inv.invoice_number}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #ddd"><strong>Date</strong></td>
                <td style="padding:10px;border:1px solid #ddd">${new Date(inv.invoice_date).toLocaleDateString('en-IN')}</td>
              </tr>
              <tr style="background:#f0f4ff">
                <td style="padding:10px;border:1px solid #ddd"><strong>Total Amount</strong></td>
                <td style="padding:10px;border:1px solid #ddd;color:#0066cc;font-weight:bold">â‚¹${parseFloat(inv.total).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #ddd"><strong>Status</strong></td>
                <td style="padding:10px;border:1px solid #ddd">${inv.status.toUpperCase()}</td>
              </tr>
            </table>
            <p>The invoice PDF is attached to this email. Please review and process the payment at your earliest convenience.</p>
            <p>For any queries, please contact us at <a href="mailto:${fromEmail}">${fromEmail}</a></p>
            <p style="margin-top:30px">Thank you for your business!</p>
            <p><strong>${companyName}</strong></p>
          </div>
        </div>`,
      attachments: [{
        content:     pdfBuffer.toString('base64'),
        filename:    `Invoice-${inv.invoice_number}.pdf`,
        type:        'application/pdf',
        disposition: 'attachment',
      }],
    };

    await sgMail.send(msg);
    res.json({ message: 'Invoice sent successfully', invoice_number: inv.invoice_number });
  } catch (err) {
    console.error('Email error:', err.message);
    if (err.response && err.response.body) {
      console.error('SendGrid response:', JSON.stringify(err.response.body, null, 2));
    }
    const detailMsg = err.response?.body?.errors?.[0]?.message || err.message;
    res.status(500).json({ error: 'Failed to send email', message: detailMsg });
  }
});

// POST /api/emails/send-reminder
app.post('/api/emails/send-reminder', async (req, res) => {
  try {
    const { invoice_id, recipient_email, days_overdue } = req.body;
    if (!invoice_id || !recipient_email) {
      return res.status(400).json({ error: 'invoice_id and recipient_email are required' });
    }

    const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [invoice_id]);
    if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    const inv    = invRes.rows[0];
    const setRes = await pool.query('SELECT * FROM settings WHERE id=1');
    const settings = setRes.rows[0] || {};

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(400).json({ error: 'SendGrid API key not configured' });
    }

    const fromEmail   = process.env.SENDGRID_FROM_EMAIL || 'ankitinfotechsolutions@gmail.com';
    const companyName = settings.company_name || 'Ankit Infotech And Solution';

    const msg = {
      to:      recipient_email,
      from:    { email: fromEmail, name: companyName },
      subject: `Payment Reminder: Invoice ${inv.invoice_number} is Overdue`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:#e63946;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
            <h1 style="margin:0;font-size:24px">âš ï¸ Payment Reminder</h1>
          </div>
          <div style="background:#fff;border:1px solid #e0e0e0;padding:30px;border-radius:0 0 8px 8px">
            <p>Dear ${inv.client_name || 'Valued Customer'},</p>
            <p>This is a friendly reminder that your payment for Invoice <strong>${inv.invoice_number}</strong> is ${days_overdue ? `${days_overdue} days` : ''} overdue.</p>
            <div style="background:#fff8f8;border-left:4px solid #e63946;padding:15px;margin:20px 0">
              <p style="margin:0"><strong>Amount Due: â‚¹${parseFloat(inv.total).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></p>
              <p style="margin:5px 0 0;color:#666">Invoice: ${inv.invoice_number} | Date: ${new Date(inv.invoice_date).toLocaleDateString('en-IN')}</p>
            </div>
            <p>Please process the payment at the earliest to avoid any inconvenience.</p>
            <p>If you have already made the payment, please disregard this reminder.</p>
            <p>Contact: <a href="mailto:${fromEmail}">${fromEmail}</a></p>
            <p><strong>${companyName}</strong></p>
          </div>
        </div>`,
    };

    await sgMail.send(msg);
    res.json({ message: 'Reminder sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send reminder', message: err.message });
  }
});

// ============================================================
// PDF DOWNLOAD ENDPOINT
// ============================================================
app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const invRes = await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id]);
    if (invRes.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });

    const pdfBuffer = await generateInvoicePDF(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${invRes.rows[0].invoice_number}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate PDF', message: err.message });
  }
});

// ============================================================
// ROOT â€” API info page
// ============================================================
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>InvoiceFlow API</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:20px;padding:40px;max-width:560px;width:100%;box-shadow:0 25px 50px rgba(0,0,0,0.5)}
    .logo{font-size:48px;margin-bottom:12px;text-align:center}
    h1{font-size:28px;font-weight:800;color:#fff;text-align:center;margin-bottom:4px}
    .sub{text-align:center;color:#64748b;font-size:14px;margin-bottom:32px}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600}
    .pill-green{background:#064e3b;color:#34d399}
    .pill-blue{background:#1e3a5f;color:#60a5fa}
    .status-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #1e293b}
    .status-row:last-child{border-bottom:none}
    .label{color:#94a3b8;font-size:14px}
    .value{color:#f1f5f9;font-size:14px;font-weight:600;font-family:monospace}
    .section{background:#0f172a;border-radius:12px;padding:16px;margin-bottom:20px}
    .endpoints{display:flex;flex-direction:column;gap:8px}
    .ep{display:flex;align-items:center;gap:10px;font-size:13px}
    .method{padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;min-width:44px;text-align:center}
    .get{background:#064e3b;color:#34d399}
    .post{background:#1e3a5f;color:#60a5fa}
    .path{color:#94a3b8;font-family:monospace}
    .btn{display:block;text-align:center;padding:12px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;font-weight:600;margin-top:20px;transition:background 0.2s}
    .btn:hover{background:#1d4ed8}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ðŸ“Š</div>
    <h1>InvoiceFlow API</h1>
    <p class="sub">Ankit Infotech And Solution â€” Invoice Management System</p>

    <div class="section">
      <div class="status-row">
        <span class="label">Status</span>
        <span class="pill pill-green">â— Running</span>
      </div>
      <div class="status-row">
        <span class="label">Environment</span>
        <span class="value">${process.env.NODE_ENV || 'development'}</span>
      </div>
      <div class="status-row">
        <span class="label">Port</span>
        <span class="value">${PORT}</span>
      </div>
      <div class="status-row">
        <span class="label">Database</span>
        <span class="value">${process.env.DB_HOST ? process.env.DB_HOST : 'âš ï¸ Not configured (.env)'}</span>
      </div>
      <div class="status-row">
        <span class="label">Time</span>
        <span class="value">${new Date().toISOString()}</span>
      </div>
    </div>

    <p style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Available Endpoints</p>
    <div class="section endpoints">
      <div class="ep"><span class="method get">GET</span><span class="path">/api/health</span></div>
      <div class="ep"><span class="method get">GET</span><span class="path">/api/clients</span></div>
      <div class="ep"><span class="method post">POST</span><span class="path">/api/clients</span></div>
      <div class="ep"><span class="method get">GET</span><span class="path">/api/invoices</span></div>
      <div class="ep"><span class="method post">POST</span><span class="path">/api/invoices</span></div>
      <div class="ep"><span class="method post">POST</span><span class="path">/api/invoices/:id/mark-paid</span></div>
      <div class="ep"><span class="method get">GET</span><span class="path">/api/reports/dashboard</span></div>
      <div class="ep"><span class="method post">POST</span><span class="path">/api/emails/send-invoice</span></div>
    </div>

    <a class="btn" href="/api/health">Check Health â†’</a>
  </div>
</body>
</html>`);
});

// ============================================================
// 404 handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ============================================================
// Global error handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`\nðŸš€ Invoice System API running on http://localhost:${PORT}`);
  console.log(`ðŸ“‹ Health check: http://localhost:${PORT}/api/health`);
  console.log(`ðŸ“ Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
