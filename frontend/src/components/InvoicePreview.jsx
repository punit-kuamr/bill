import React, { useState, useEffect, useRef } from 'react';
import { MdClose, MdPrint, MdDownload, MdEmail } from 'react-icons/md';
import { format, parseISO } from 'date-fns';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'react-toastify';
import { invoiceAPI, emailAPI } from '../services/api';
import { useAppContext } from '../context/AppContext';

const fmtCurr = (n) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+convert(n%100) : '');
    if (n < 100000) return convert(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+convert(n%1000) : '');
    if (n < 10000000) return convert(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+convert(n%100000) : '');
    return convert(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' '+convert(n%10000000) : '');
  }
  return convert(num);
}

function InvoicePreview({ invoiceId, invoiceData: propData, onClose }) {
  const { settings } = useAppContext();
  const [invoice, setInvoice] = useState(propData || null);
  const [loading, setLoading] = useState(!propData);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const printRef = useRef();

  useEffect(() => {
    if (propData) { setInvoice(propData); setLoading(false); return; }
    if (!invoiceId) { onClose(); return; }
    setLoading(true);
    invoiceAPI.getById(invoiceId)
      .then(r => setInvoice(r.data))
      .catch(() => onClose())
      .finally(() => setLoading(false));
  }, [invoiceId, propData, onClose]);

  useEffect(() => {
    const upiId = settings?.upi_id;
    if (!upiId || !invoice) { setQrDataUrl(null); return; }
    const items = invoice.items || [];
    let sub = 0, cgst = 0, sgst = 0;
    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      const gstR = parseFloat(item.gst_rate) || 0;
      const amt = qty * rate;
      cgst += amt * (gstR / 2) / 100;
      sgst += amt * (gstR / 2) / 100;
      sub += amt;
    });
    let grandTotal = sub + cgst + sgst - (parseFloat(invoice.discount) || 0) + (parseFloat(invoice.extra_charges) || 0);
    if (invoice.is_roundup) grandTotal = Math.ceil(grandTotal);
    else if (invoice.is_roundoff) grandTotal = Math.round(grandTotal);
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(settings?.company_name || '')}&am=${grandTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoice.invoice_number || ''}`)}`;
    QRCode.toDataURL(upiUrl, { width: 110, margin: 1, color: { dark: '#111', light: '#ffffff' } })
      .then(url => setQrDataUrl(url))
      .catch(() => setQrDataUrl(null));
  }, [settings?.upi_id, settings?.company_name, invoice]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', handleKeyDown); };
  }, [onClose]);

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice ${invoice?.invoice_number || ''}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Inter',sans-serif;background:#fff;color:#111;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{size:A4;margin:8mm;}table{border-collapse:collapse;}${printCss}</style></head><body>${content}</body></html>`);
    doc.close();
    iframe.contentWindow.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    };
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice_${invoice?.invoice_number || 'Draft'}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (err) { toast.error('Failed to generate PDF'); }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!invoiceId) return toast.error("Please save the invoice first to send via email.");
    if (!emailTo) return toast.error("Please enter an email address.");
    setSendingEmail(true);
    try {
      await emailAPI.sendInvoice({ invoice_id: invoiceId, recipient_email: emailTo });
      toast.success(`Email sent to ${emailTo}`);
      setShowEmailModal(false);
    } catch (err) { toast.error(`Email failed: ${err.message}`); }
    setSendingEmail(false);
  };

  if (loading) return (
    <div style={overlayStyle}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16 }}>
        <div className="spinner" style={{ width:38, height:38, borderTopColor:'#1a3c8f' }} />
        <p style={{ color:'#fff', fontFamily:'Inter,sans-serif', fontSize:14 }}>Loading invoice...</p>
      </div>
    </div>
  );

  if (!invoice) return null;

  const items = invoice.items || [];
  let subtotal = 0, totalCGST = 0, totalSGST = 0;
  const rows = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const gstRate = parseFloat(item.gst_rate) || 0;
    const amount = qty * rate;
    const cgstAmt = amount * (gstRate / 2) / 100;
    const sgstAmt = amount * (gstRate / 2) / 100;
    const total = amount + cgstAmt + sgstAmt;
    subtotal += amount; totalCGST += cgstAmt; totalSGST += sgstAmt;
    return { ...item, qty, rate, amount, gstRate, cgstAmt, sgstAmt, total };
  });

  const discount = parseFloat(invoice.discount) || 0;
  const extraCharges = parseFloat(invoice.extra_charges) || 0;
  let grandTotal = subtotal + totalCGST + totalSGST - discount + extraCharges;
  let roundoff = 0;
  if (invoice.is_roundup) { const r = Math.ceil(grandTotal); roundoff = r - grandTotal; grandTotal = r; }
  else if (invoice.is_roundoff) { const r = Math.round(grandTotal); roundoff = r - grandTotal; grandTotal = r; }

  const co = settings || {};
  const inv = invoice;
  const hasQR = qrDataUrl && co.upi_id;
  const pColor = '#1a3c8f';

  const fmtDate = (d) => {
    if (!d) return 'N/A';
    try { return format(parseISO(d), 'dd MMMM yyyy'); } catch { return d; }
  };

  const cellSt = { padding:'5px 7px', borderRight:'1px solid #dde3f0', borderBottom:'1px solid #dde3f0' };
  const hdrSt = { ...cellSt, background: pColor, color:'white', fontWeight:700, fontSize:10, textAlign:'center' };

  return (
    <div style={overlayStyle}>
      {/* ── TOOLBAR ── */}
      <div style={toolbarStyle}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button type="button" onClick={onClose} style={closeBtnStyle} title="Close"><MdClose style={{ fontSize:18 }} /></button>
          <div style={{ width:1, height:28, background:'#2d3748' }} />
          <span style={{ color:'#e2e8f0', fontFamily:'Inter,sans-serif', fontWeight:700, fontSize:15 }}>
            {inv.invoice_number || 'Draft Preview'}
          </span>
          <span style={statusBadge(inv.status)}>{(inv.status || 'DRAFT').toUpperCase()}</span>
          {!invoiceId && <span style={{ padding:'2px 9px', borderRadius:99, fontSize:10, fontWeight:700, background:'#fef9c3', color:'#713f12' }}>LIVE PREVIEW - NOT SAVED</span>}
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button 
            type="button" 
            disabled={!invoiceId}
            onClick={() => { setEmailTo(inv?.client_email || ''); setShowEmailModal(true); }} 
            style={!invoiceId ? { ...printBtnStyle, background: '#cbd5e1', boxShadow: 'none', cursor: 'not-allowed' } : printBtnStyle}>
            <MdEmail style={{ fontSize:16 }} /> Send
          </button>
          <button 
            type="button" 
            disabled={!invoiceId}
            onClick={handleDownload} 
            style={!invoiceId ? { ...printBtnStyle, background: '#cbd5e1', boxShadow: 'none', cursor: 'not-allowed' } : printBtnStyle}>
            <MdDownload style={{ fontSize:16 }} /> Download PDF
          </button>
          <button type="button" onClick={handlePrint} style={printBtnStyle}>
            <MdPrint style={{ fontSize:16 }} /> Print
          </button>
        </div>
      </div>

      {/* ── PAPER ── */}
      <div style={canvasStyle}>
        <div ref={printRef} style={paperStyle}>

          {/* HEADER */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, paddingBottom:10, borderBottom:`2.5px solid ${pColor}` }}>
            {/* Left: logo box + company info */}
            <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
              {co.company_logo_url ? (
                <div style={{ width:68, height:68, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <img src={co.company_logo_url} alt="Logo" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
                </div>
              ) : (
                <div style={{ width:68, height:68, background:pColor, borderRadius:6, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <div style={{ fontSize:34, fontWeight:900, color:'white', lineHeight:1 }}>{(co.company_name || 'A').charAt(0).toUpperCase()}</div>
                  <div style={{ fontSize:6, color:'rgba(255,255,255,0.85)', textAlign:'center', padding:'2px 3px', lineHeight:1.3, whiteSpace:'pre-line' }}>{(co.company_name || 'Company').split(' ').slice(0,3).join('\n')}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:pColor, marginBottom:4 }}>{co.company_name || 'Your Company'}</div>
                <div style={{ fontSize:9.5, color:'#333', lineHeight:1.75 }}>
                  {co.company_address && <div>{co.company_address}</div>}
                  {co.company_gstin && <div><b>GSTIN:</b> {co.company_gstin}</div>}
                  {co.company_email && <div><b>Email:</b> {co.company_email}</div>}
                  {co.company_phone && <div><b>Phone:</b> {co.company_phone}</div>}
                </div>
              </div>
            </div>

            {/* Right: TAX INVOICE + meta + QR */}
            <div style={{ textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              <div style={{ fontSize:21, fontWeight:900, color:pColor, letterSpacing:1 }}>TAX INVOICE</div>
              <table style={{ fontSize:9.5, borderCollapse:'collapse', textAlign:'left' }}>
                <tbody>
                  <tr><td style={{ padding:'1.5px 6px', color:'#666' }}>Invoice No.</td><td style={{ padding:'1.5px 4px' }}>:</td><td style={{ padding:'1.5px 6px', fontWeight:700 }}>{inv.invoice_number || 'N/A'}</td></tr>
                  <tr><td style={{ padding:'1.5px 6px', color:'#666' }}>Invoice Date</td><td style={{ padding:'1.5px 4px' }}>:</td><td style={{ padding:'1.5px 6px', fontWeight:700 }}>{fmtDate(inv.invoice_date)}</td></tr>
                  <tr><td style={{ padding:'1.5px 6px', color:'#666' }}>Due Date</td><td style={{ padding:'1.5px 4px' }}>:</td><td style={{ padding:'1.5px 6px', fontWeight:700 }}>{fmtDate(inv.due_date)}</td></tr>
                  <tr><td style={{ padding:'1.5px 6px', color:'#666' }}>Place of Supply</td><td style={{ padding:'1.5px 4px' }}>:</td><td style={{ padding:'1.5px 6px', fontWeight:700 }}>{inv.client_state || 'Rajasthan (08)'}</td></tr>
                  <tr><td style={{ padding:'1.5px 6px', color:'#666' }}>Reverse Charge</td><td style={{ padding:'1.5px 4px' }}>:</td><td style={{ padding:'1.5px 6px', fontWeight:700 }}>No</td></tr>
                </tbody>
              </table>

            </div>
          </div>

          {/* BILL TO / SHIP TO */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <div style={{ flex:1, border:'1px solid #dde3f0', borderRadius:4, overflow:'hidden' }}>
              <div style={{ background:pColor, color:'white', fontSize:9.5, fontWeight:700, padding:'3px 9px' }}>BILL TO</div>
              <div style={{ padding:'7px 9px', fontSize:9.5, lineHeight:1.7 }}>
                <div style={{ fontWeight:800, fontSize:10.5, color:'#111', marginBottom:2 }}>{inv.client_name || 'N/A'}</div>
                <div style={{ color:'#333', whiteSpace:'pre-wrap' }}>{inv.client_address || 'N/A'}</div>
                {inv.client_gstin && <div><b>GSTIN:</b> {inv.client_gstin}</div>}
                {inv.client_phone && <div><b>Phone:</b> {inv.client_phone}</div>}
                {inv.client_email && <div><b>Email:</b> {inv.client_email}</div>}
              </div>
            </div>
            <div style={{ flex:1, border:'1px solid #dde3f0', borderRadius:4, overflow:'hidden' }}>
              <div style={{ background:pColor, color:'white', fontSize:9.5, fontWeight:700, padding:'3px 9px' }}>SHIP TO</div>
              <div style={{ padding:'7px 9px', fontSize:9.5, lineHeight:1.7 }}>
                <div style={{ fontWeight:800, fontSize:10.5, color:'#111', marginBottom:2 }}>{inv.ship_to_name || inv.client_name || 'N/A'}</div>
                <div style={{ color:'#333', whiteSpace:'pre-wrap' }}>{inv.ship_to_address || inv.client_address || 'N/A'}</div>
                {inv.ship_to_gstin && <div><b>GSTIN:</b> {inv.ship_to_gstin}</div>}
              </div>
            </div>
          </div>

          {/* ITEMS TABLE */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:9.5, marginBottom:8, border:'1px solid #dde3f0' }}>
            <thead>
              <tr>
                <th style={{ ...hdrSt, width:'3%' }}>#</th>
                <th style={{ ...hdrSt, textAlign:'left' }}>ITEM DESCRIPTION</th>
                <th style={{ ...hdrSt }}>HSN/SAC</th>
                <th style={{ ...hdrSt }}>QTY</th>
                <th style={{ ...hdrSt, textAlign:'right' }}>RATE (Rs.)</th>
                <th style={{ ...hdrSt, textAlign:'right' }}>CGST (Rs.)</th>
                <th style={{ ...hdrSt, textAlign:'right' }}>SGST (Rs.)</th>
                <th style={{ ...hdrSt, textAlign:'right', borderRight:'none' }}>AMOUNT (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#f5f7ff' : '#fff' }}>
                  <td style={{ ...cellSt, textAlign:'center', color:'#666' }}>{i + 1}</td>
                  <td style={{ ...cellSt, textAlign:'left' }}>
                    <div style={{ fontWeight:700, color:'#111' }}>{item.item_name}</div>
                    {item.description && <div style={{ fontSize:8.5, color:'#777', marginTop:1 }}>{item.description}</div>}
                  </td>
                  <td style={{ ...cellSt, textAlign:'center', color:'#444' }}>{item.hsn_sac || 'N/A'}</td>
                  <td style={{ ...cellSt, textAlign:'center', color:'#444' }}>{item.qty}</td>
                  <td style={{ ...cellSt, textAlign:'right', color:'#444' }}>{fmtCurr(item.rate)}</td>
                  <td style={{ ...cellSt, textAlign:'right', color:'#444' }}>{fmtCurr(item.cgstAmt)}</td>
                  <td style={{ ...cellSt, textAlign:'right', color:'#444' }}>{fmtCurr(item.sgstAmt)}</td>
                  <td style={{ ...cellSt, textAlign:'right', fontWeight:700, color:'#111', borderRight:'none' }}>{fmtCurr(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOTALS ROW */}
          <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
            {/* Amount in words */}
            <div style={{ flex:1.5, fontSize:9.5, lineHeight:1.65 }}>
              <div style={{ fontWeight:700, color:pColor, marginBottom:3, fontSize:10 }}>Amount In Words</div>
              <div style={{ fontStyle:'italic', color:'#111', fontWeight:600 }}>{numberToWords(Math.round(grandTotal))} Rupees Only</div>
            </div>
            {/* Summary table */}
            <div style={{ flex:1.1 }}>
              <table style={{ width:'100%', fontSize:9.5, borderCollapse:'collapse', border:'1px solid #dde3f0' }}>
                <tbody>
                  <tr style={{ borderBottom:'1px solid #dde3f0' }}>
                    <td style={{ padding:'4px 8px', color:'#555' }}>Subtotal</td>
                    <td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700 }}>Rs.{fmtCurr(subtotal)}</td>
                  </tr>
                  <tr style={{ borderBottom:'1px solid #dde3f0' }}>
                    <td style={{ padding:'4px 8px', color:'#555' }}>CGST (9%)</td>
                    <td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700 }}>Rs.{fmtCurr(totalCGST)}</td>
                  </tr>
                  <tr style={{ borderBottom:'1px solid #dde3f0' }}>
                    <td style={{ padding:'4px 8px', color:'#555' }}>SGST (9%)</td>
                    <td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700 }}>Rs.{fmtCurr(totalSGST)}</td>
                  </tr>
                  {discount > 0 && <tr style={{ borderBottom:'1px solid #dde3f0' }}><td style={{ padding:'4px 8px', color:'#22c55e' }}>Discount</td><td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700, color:'#22c55e' }}>- Rs.{fmtCurr(discount)}</td></tr>}
                  {extraCharges > 0 && <tr style={{ borderBottom:'1px solid #dde3f0' }}><td style={{ padding:'4px 8px', color:'#555' }}>Extra Charges</td><td style={{ padding:'4px 8px', textAlign:'right', fontWeight:700 }}>Rs.{fmtCurr(extraCharges)}</td></tr>}
                  <tr style={{ background:pColor }}>
                    <td style={{ padding:'6px 8px', color:'white', fontWeight:800, fontSize:10.5 }}>GRAND TOTAL</td>
                    <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:900, fontSize:13, color:'white' }}>Rs. {fmtCurr(grandTotal)}</td>
                  </tr>
                  {roundoff !== 0 && <tr style={{ borderBottom:'1px solid #dde3f0' }}><td style={{ padding:'3px 8px', color:'#555', fontSize:9 }}>Rounded Off</td><td style={{ padding:'3px 8px', textAlign:'right', fontWeight:700, fontSize:9 }}>{roundoff > 0 ? '+' : ''}Rs.{fmtCurr(Math.abs(roundoff))}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* TERMS & CONDITIONS + PAYMENT SUMMARY */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <div style={{ flex:1, border:'1px solid #dde3f0', borderRadius:4, overflow:'hidden' }}>
              <div style={{ background:'#edf0fb', borderBottom:'1px solid #dde3f0', padding:'3px 9px', fontSize:9.5, fontWeight:700, color:pColor }}>Terms &amp; Conditions</div>
              <div style={{ padding:'6px 9px', fontSize:9, color:'#444', lineHeight:1.75 }}>
                <ol style={{ margin:0, paddingLeft:14 }}>
                  {(co.terms_and_conditions || inv.notes || '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged on overdue payments.\n3. All disputes are subject to Jaipur Jurisdiction.').split('\n').map((line, idx) => (
                    <li key={idx} style={{ marginBottom:2 }}>{line.replace(/^\d+\.\s*/, '')}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div style={{ flex:1, border:'1px solid #dde3f0', borderRadius:4, overflow:'hidden' }}>
              <div style={{ background:'#edf0fb', borderBottom:'1px solid #dde3f0', padding:'3px 9px', fontSize:9.5, fontWeight:700, color:pColor }}>Payment Summary</div>
              <div style={{ display:'flex', alignItems:'center', padding:'4px 9px', gap:12 }}>
                {hasQR && (
                  <div style={{ flexShrink:0, textAlign:'center' }}>
                    <div style={{ fontSize:8.5, fontWeight:700, color:pColor, marginBottom:2 }}>Scan &amp; Pay</div>
                    <img src={qrDataUrl} alt="UPI QR" style={{ width:60, height:60, display:'block', margin:'0 auto' }} />
                    <div style={{ fontSize:7.5, color:'#555', marginTop:2 }}>{co.upi_id}</div>
                  </div>
                )}
                <table style={{ width:'100%', fontSize:9.5, borderCollapse:'collapse' }}>
                  <tbody>
                    <tr style={{ borderBottom:'1px solid #dde3f0' }}>
                      <td style={{ padding:'5px 9px', color:'#555' }}>Total Invoice Value</td>
                      <td style={{ padding:'5px 9px', textAlign:'right', fontWeight:700 }}>Rs.{fmtCurr(grandTotal)}</td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #dde3f0' }}>
                      <td style={{ padding:'5px 9px', color:'#22c55e', fontWeight:600 }}>Amount Paid</td>
                      <td style={{ padding:'5px 9px', textAlign:'right', fontWeight:700, color:'#22c55e' }}>Rs.{fmtCurr(inv.paid_amount || 0)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding:'5px 9px', color:'#ef4444', fontWeight:700 }}>Balance Due</td>
                      <td style={{ padding:'5px 9px', textAlign:'right', fontWeight:800, fontSize:11, color:'#ef4444' }}>Rs.{fmtCurr(grandTotal - (inv.paid_amount || 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* BANK DETAILS */}
          {(co.bank_name || co.bank_account_number || co.bank_ifsc) && (
            <div style={{ border:'1px solid #dde3f0', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
              <div style={{ background:'#edf0fb', borderBottom:'1px solid #dde3f0', padding:'3px 9px', fontSize:9.5, fontWeight:700, color:pColor }}>Bank Details</div>
              <div style={{ padding:'6px 9px', display:'flex', gap:28, fontSize:9.5, color:'#333', lineHeight:1.75 }}>
                <table style={{ borderCollapse:'collapse' }}>
                  <tbody>
                    <tr><td style={{ paddingRight:6, fontWeight:600 }}>Bank Name</td><td style={{ paddingRight:6 }}>:</td><td>{co.bank_name || 'N/A'}</td></tr>
                    <tr><td style={{ fontWeight:600 }}>A/c Number</td><td>:</td><td>{co.bank_account_number || 'N/A'}</td></tr>
                  </tbody>
                </table>
                <table style={{ borderCollapse:'collapse' }}>
                  <tbody>
                    <tr><td style={{ paddingRight:6, fontWeight:600 }}>Account Name</td><td style={{ paddingRight:6 }}>:</td><td>{co.bank_account_name || co.company_name || 'N/A'}</td></tr>
                    <tr><td style={{ fontWeight:600 }}>IFSC Code</td><td>:</td><td>{co.bank_ifsc || 'N/A'}</td></tr>
                  </tbody>
                </table>
                {co.upi_id && (
                  <table style={{ borderCollapse:'collapse' }}>
                    <tbody>
                      <tr><td style={{ paddingRight:6, fontWeight:600 }}>Branch</td><td style={{ paddingRight:6 }}>:</td><td>{co.bank_branch || 'N/A'}</td></tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* FOOTER: SIGNATURE + THANK YOU */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:8, paddingTop:7, borderTop:`1px solid #dde3f0` }}>
            <div style={{ fontSize:9.5, color:'#555', fontStyle:'italic' }}>
              {co.additional_notes || 'Thank you for your business!'}
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ height:42, width:130, borderBottom:'1px dashed #999', marginBottom:4, position:'relative' }}>
                {co.signature_url ? (
                  <img src={co.signature_url} alt="Signature" style={{ position:'absolute', bottom:4, left:0, right:0, margin:'0 auto', maxHeight:38, display:'block' }} />
                ) : (
                  <div style={{ position:'absolute', bottom:4, left:0, width:'100%', fontSize:17, fontFamily:'cursive', color:pColor, textAlign:'center' }}>
                    {co.company_name ? co.company_name.split(' ').map(w => w[0]).join('') : 'Sign'}
                  </div>
                )}
              </div>
              <div style={{ fontSize:9.5, fontWeight:700, color:'#333' }}>Authorized Signatory</div>
              <div style={{ fontSize:8.5, color:'#888', marginTop:1 }}>for {co.company_name || 'Company'}</div>
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:10, fontSize:8.5, color:'#bbb', borderTop:'1px solid #f0f0f0', paddingTop:6 }}>
            {co.footer_message || 'This is a computer generated invoice'}
          </div>

        </div>
      </div>

      {/* EMAIL MODAL */}
      {showEmailModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1200 }}>
          <div style={{ background:'white', padding:'24px', borderRadius:'8px', width:'400px', maxWidth:'90%' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <h3 style={{ margin:0, fontFamily:'Inter,sans-serif' }}>Send Invoice</h3>
              <button type="button" onClick={() => setShowEmailModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><MdClose size={20} /></button>
            </div>
            <form onSubmit={handleSend}>
              <div style={{ marginBottom:'16px' }}>
                <label style={{ display:'block', marginBottom:'8px', fontSize:'13px', fontFamily:'Inter,sans-serif' }}>Recipient Email</label>
                <input type="email" required value={emailTo} onChange={(e) => setEmailTo(e.target.value)} style={{ width:'100%', padding:'8px 12px', border:'1px solid #ccc', borderRadius:'4px', boxSizing:'border-box', fontFamily:'Inter,sans-serif' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px' }}>
                <button type="button" onClick={() => setShowEmailModal(false)} style={{ padding:'8px 16px', background:'#f1f5f9', border:'none', borderRadius:'4px', cursor:'pointer', fontFamily:'Inter,sans-serif' }}>Cancel</button>
                <button type="submit" disabled={sendingEmail} style={{ padding:'8px 16px', background:'#3b82f6', color:'white', border:'none', borderRadius:'4px', cursor:sendingEmail ? 'not-allowed' : 'pointer', fontFamily:'Inter,sans-serif' }}>
                  {sendingEmail ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = { position:'fixed', inset:0, zIndex:1050, background:'#2d2d2d' };
const toolbarStyle = {
  position:'fixed', top:0, left:0, right:0, zIndex:1100, background:'#1a2420', height:56, padding:'0 24px',
  display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 2px 16px rgba(0,0,0,0.5)',
};
const canvasStyle = {
  marginTop:56, height:'calc(100vh - 56px)', overflowY:'auto', display:'flex', flexDirection:'column',
  alignItems:'center', padding:'28px 20px 50px', background:'#eef2f7',
};
const paperStyle = {
  background:'white', width:860, maxWidth:'100%', padding:'24px 28px',
  boxShadow:'0 6px 32px rgba(0,0,0,0.13)', borderRadius:0, position:'relative', marginBottom:32,
  fontFamily:'Inter, sans-serif',
};
const closeBtnStyle = {
  width:34, height:34, borderRadius:8, border:'1px solid #2d3748', background:'transparent',
  color:'#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
};
const printBtnStyle = {
  display:'inline-flex', alignItems:'center', gap:7, padding:'8px 20px', borderRadius:8, border:'none',
  background:'#1a4731', color:'white', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:13,
  fontWeight:600, boxShadow:'0 2px 10px rgba(26,71,49,0.45)',
};
const statusBadge = (status) => ({
  padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700,
  background: status==='paid' ? '#dcfce7' : status==='unpaid' ? '#fef9c3' : '#f0ede4',
  color: status==='paid' ? '#166534' : status==='unpaid' ? '#713f12' : '#5a6b58',
});

const printCss = `
  table{width:100%;border-collapse:collapse;font-size:10px;}
  th{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-weight:700;}
  img{max-width:100%;}
  .no-print{display:none;}
`;

export default InvoicePreview;
