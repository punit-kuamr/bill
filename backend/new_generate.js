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
    if (!d) return '—';
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(dt.getDate()).padStart(2,'0')} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const statusColor = inv.status === 'paid' ? '#22c55e' : inv.status === 'unpaid' ? '#ef4444' : '#d97706';

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Inter',sans-serif;background:#fff;color:#1a2420;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @page{size:A4;margin:10mm;}
  table{width:100%;border-collapse:collapse;}
</style>
</head><body>
<div style="background:white;width:100%;padding:20px;position:relative;">
  <div style="display: flex; justify-content: space-between; border-bottom: 3px solid #8b5cf6; padding-bottom: 20px;">
    <div style="display: flex; gap: 16px;">
      <div style="font-size: 48px; color: #8b5cf6;">
        <div style="font-weight: 900; line-height: 1;">A</div>
        <div style="font-size: 10px; font-weight: 800; color: #8b5cf6; text-align: center; margin-top: 4px;">
          ${co.company_name ? co.company_name.split(' ').map(w=>w[0]).join('') : 'AIS'}
        </div>
      </div>
      <div style="font-size: 12px; color: #333;">
        <div style="font-size: 20px; font-weight: 800; color: #8b5cf6; margin-bottom: 4px;">
          ${co.company_name || 'Ankit Infotech And Solution'}
        </div>
        <div style="margin-bottom: 2px; max-width: 300px; line-height: 1.4;">${co.company_address || ''}</div>
        <div style="display: flex; gap: 16px; margin-top: 6px;">
          ${co.company_gstin ? `<div><strong>GSTIN:</strong> ${co.company_gstin}</div>` : ''}
        </div>
        <div style="display: flex; gap: 16px; margin-top: 2px;">
          ${co.company_email ? `<div><strong>Email:</strong> ${co.company_email}</div>` : ''}
        </div>
        <div style="display: flex; gap: 16px; margin-top: 2px;">
          ${co.company_phone ? `<div><strong>Phone:</strong> ${co.company_phone}</div>` : ''}
        </div>
      </div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 22px; font-weight: 800; color: #8b5cf6; margin-bottom: 8px;">TAX INVOICE</div>
      ${hasQR ? `
        <div style="display: flex; flex-direction: column; align-items: flex-end;">
          <div style="font-size: 10px; font-weight: 700;">Scan & Pay (UPI)</div>
          <img src="${qrDataUrl}" alt="UPI QR" style="width: 80px; height: 80px; margin-top: 4px;" />
          <div style="font-size: 9px; margin-top: 4px;">UPI ID: ${co.upi_id}</div>
        </div>
      ` : ''}
    </div>
  </div>

  <div style="display: flex; gap: 16px; margin-top: 20px; margin-bottom: 20px;">
    <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px;">
      <div style="background: #f8fafc; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #8b5cf6; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; margin: -12px -12px 12px -12px;">
        <span style="background: #8b5cf6; color: white; padding: 2px 4px; border-radius: 4px;">👤</span> BILL TO
      </div>
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">${inv.client_name || '—'}</div>
      <div style="font-size: 11px; color: #333;">
        <div style="margin-bottom: 4px;">${inv.client_address || ''}</div>
        ${inv.client_gstin ? `<div style="margin-top: 2px;"><strong>GSTIN:</strong> ${inv.client_gstin}</div>` : ''}
        ${inv.client_phone ? `<div style="margin-top: 2px;"><strong>Phone:</strong> ${inv.client_phone}</div>` : ''}
        ${inv.client_email ? `<div style="margin-top: 2px;"><strong>Email:</strong> ${inv.client_email}</div>` : ''}
      </div>
    </div>
    <div style="flex: 1; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px;">
      <div style="background: #f8fafc; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #8b5cf6; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e5e7eb; margin: -12px -12px 12px -12px;">
        <span style="background: #8b5cf6; color: white; padding: 2px 4px; border-radius: 4px;">📍</span> SHIP TO
      </div>
      <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">${inv.client_name || '—'}</div>
      <div style="font-size: 11px; color: #333;">
        <div style="margin-bottom: 4px;">${inv.client_address || ''}</div>
      </div>
    </div>
    <div style="flex: 1; padding: 12px; font-size: 11px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="padding: 4px 0; color: #555;">Invoice No.</td>
            <td style="padding: 4px 0; text-align: center;">:</td>
            <td style="padding: 4px 0; font-weight: 700;">${inv.invoice_number}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #555;">Invoice Date</td>
            <td style="padding: 4px 0; text-align: center;">:</td>
            <td style="padding: 4px 0; font-weight: 700;">${formatDate(inv.invoice_date)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #555;">Due Date</td>
            <td style="padding: 4px 0; text-align: center;">:</td>
            <td style="padding: 4px 0; font-weight: 700;">${formatDate(inv.due_date)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #555;">Place of Supply</td>
            <td style="padding: 4px 0; text-align: center;">:</td>
            <td style="padding: 4px 0; font-weight: 700;">${inv.client_state || 'Rajasthan (08)'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #555;">Reverse Charge</td>
            <td style="padding: 4px 0; text-align: center;">:</td>
            <td style="padding: 4px 0; font-weight: 700;">No</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px;">
    <thead>
      <tr style="background: #8b5cf6; color: white;">
        <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Item #/Item description</th>
        <th style="padding: 12px 8px; text-align: center; font-weight: 600;">HSN</th>
        <th style="padding: 12px 8px; text-align: center; font-weight: 600;">Qty.</th>
        <th style="padding: 12px 8px; text-align: center; font-weight: 600;">GST</th>
        <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Taxable Amount</th>
        <th style="padding: 12px 8px; text-align: right; font-weight: 600;">SGST</th>
        <th style="padding: 12px 8px; text-align: right; font-weight: 600;">CGST</th>
        <th style="padding: 12px 8px; text-align: right; font-weight: 600;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((item, i) => \`
        <tr style="background: \${i % 2 === 0 ? '#f8fafc' : 'white'}; border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 8px; font-weight: 600; color: #333;">
            \${i + 1}. \${item.item_name}
            \${item.description ? \`<div style="font-size: 10px; color: #666; font-weight: 400; margin-top: 4px;">\${item.description}</div>\` : ''}
          </td>
          <td style="padding: 12px 8px; text-align: center; color: #555;">\${item.hsn_sac || '—'}</td>
          <td style="padding: 12px 8px; text-align: center; color: #555;">\${item.qty}</td>
          <td style="padding: 12px 8px; text-align: center; color: #555;">\${item.gstRate}%</td>
          <td style="padding: 12px 8px; text-align: right; color: #555;">₹\${fmtCurr(item.amount)}</td>
          <td style="padding: 12px 8px; text-align: right; color: #555;">₹\${fmtCurr(item.sgstAmt)}</td>
          <td style="padding: 12px 8px; text-align: right; color: #555;">₹\${fmtCurr(item.cgstAmt)}</td>
          <td style="padding: 12px 8px; text-align: right; color: #555;">₹\${fmtCurr(item.total)}</td>
        </tr>
      \`).join('')}
    </tbody>
  </table>

  <div style="display: flex; gap: 40px; margin-top: 20px;">
    <div style="flex: 1.3; display: flex; flex-direction: column; gap: 32px;">
      <div>
        <div style="font-size: 14px; font-weight: 700; color: #8b5cf6; margin-bottom: 16px;">Bank & Payment Details</div>
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <table style="flex: 1; font-size: 10px; color: #333; border-collapse: collapse;">
            <tbody>
              <tr><td style="padding: 6px 0; width: 140px; color: #666;">Account Holder Name</td><td style="padding: 6px 0; font-weight: 600;">${co.bank_account_name || co.company_name || '—'}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Account Number</td><td style="padding: 6px 0; font-weight: 600;">${co.bank_account_number || '—'}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">IFSC</td><td style="padding: 6px 0; font-weight: 600;">${co.bank_ifsc || '—'}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Account Type</td><td style="padding: 6px 0; font-weight: 600;">Current</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Bank</td><td style="padding: 6px 0; font-weight: 600;">${co.bank_name || '—'}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">UPI</td><td style="padding: 6px 0; font-weight: 600;">${co.upi_id || '—'}</td></tr>
            </tbody>
          </table>
          ${hasQR ? `
            <div style="display: flex; flex-direction: column; align-items: center; margin-left: 10px;">
              <div style="font-size: 9px; color: #888; margin-bottom: 4px;">UPI - Scan to Pay</div>
              <img src="${qrDataUrl}" alt="UPI QR" style="width: 100px; height: 100px;" />
            </div>
          ` : ''}
        </div>
      </div>
      ${(co.terms_and_conditions || inv.notes) ? `
        <div>
          <div style="font-size: 14px; font-weight: 700; color: #8b5cf6; margin-bottom: 10px;">Terms and Conditions</div>
          <div style="font-size: 10px; color: #555; line-height: 1.6; white-space: pre-wrap;">${co.terms_and_conditions || inv.notes}</div>
        </div>
      ` : ''}
      ${co.additional_notes ? `
        <div>
          <div style="font-size: 14px; font-weight: 700; color: #8b5cf6; margin-bottom: 10px;">Additional Notes</div>
          <div style="font-size: 10px; color: #555; line-height: 1.6; white-space: pre-wrap;">${co.additional_notes}</div>
        </div>
      ` : ''}
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <tbody>
          <tr>
            <td style="padding: 8px 0; color: #333; font-weight: 600;">Sub Total</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">₹${fmtCurr(subtotal)}</td>
          </tr>
          ${discount > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #22c55e; font-weight: 600;">Discount</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #22c55e;">- ₹${fmtCurr(discount)}</td>
            </tr>
          ` : ''}
          ${extraCharges > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #333; font-weight: 600;">Extra Charges</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">₹${fmtCurr(extraCharges)}</td>
            </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #333; font-weight: 600;">Taxable Amount</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">₹${fmtCurr(subtotal - discount + extraCharges)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #333; font-weight: 600;">CGST</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">₹${fmtCurr(totalCGST)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #333; font-weight: 600;">SGST</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600;">₹${fmtCurr(totalSGST)}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 16px 0 4px; border-bottom: 1px solid #e2e8f0;"></td>
          </tr>
          <tr>
            <td style="padding: 12px 0 4px; color: #333; font-weight: 700; font-size: 15px;">Total</td>
            <td style="padding: 12px 0 4px; text-align: right; font-weight: 800; font-size: 18px;">₹${fmtCurr(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top: 8px;">
        <div style="font-size: 10px; color: #999; margin-bottom: 4px;">Invoice Total (in words)</div>
        <div style="font-size: 11px; font-weight: 600; color: #444;">
          ${numberToWords(Math.round(grandTotal))} Rupees Only
        </div>
      </div>
      <div style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tbody>
            <tr>
              <td style="padding: 6px 0; color: #ec4899; font-weight: 600;">Amount Paid</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #ec4899;">₹${fmtCurr(inv.paid_amount || 0)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #111; font-weight: 700; font-size: 13px;">Balance Due</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 800; font-size: 15px;">₹${fmtCurr(grandTotal - (inv.paid_amount || 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <div style="margin-top: 50px; font-size: 10px; color: #666;">
    <div style="font-weight: 600;">
      For any enquiries, email us on <span style="color: #111; font-weight: 700;">${co.company_email || '—'}</span> or call us on
    </div>
    <div style="font-weight: 800; color: #111; font-size: 11px; margin-top: 4px;">
      ${co.company_phone || '—'}
    </div>
  </div>
</div>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
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
