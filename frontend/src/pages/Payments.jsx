import React, { useState, useEffect } from 'react';
import { MdCheckCircle, MdSearch, MdClose, MdDownload } from 'react-icons/md';
import { format, parseISO } from 'date-fns';
import { useAppContext } from '../context/AppContext';
import * as XLSX from 'xlsx';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const PAYMENT_METHODS = {
  bank: '🏦 Bank Transfer', upi: '📱 UPI', cash: '💵 Cash',
  cheque: '📝 Cheque', card: '💳 Card', other: '🔄 Other'
};

function Payments() {
  const { invoices, loading, fetchInvoices, markInvoicePaid, markInvoiceUnpaid } = useAppContext();

  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [payModal, setPayModal] = useState(null);
  const [payForm,  setPayForm]  = useState({ paid_date: '', paid_amount: '', payment_method: 'bank', payment_remarks: '' });
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  useEffect(() => { fetchInvoices(); }, []); // eslint-disable-line

  const filtered = invoices.filter(inv => {
    const matchF = filter === 'all' || inv.status === filter;
    const q = search.toLowerCase();
    const matchS = !search || inv.invoice_number?.toLowerCase().includes(q) ||
      (inv.client_name || inv.client_name_display || '').toLowerCase().includes(q);
      
    let matchD = true;
    if (dateFilter.start || dateFilter.end) {
      const dStr = inv.paid_date || inv.invoice_date;
      if (dStr) {
        const d = new Date(dStr);
        if (dateFilter.start && d < new Date(dateFilter.start)) matchD = false;
        if (dateFilter.end) {
          const eD = new Date(dateFilter.end);
          eD.setHours(23, 59, 59, 999);
          if (d > eD) matchD = false;
        }
      } else {
        matchD = false;
      }
    }
    
    return matchF && matchS && matchD;
  });

  const paid   = invoices.filter(i => i.status === 'paid');
  const unpaid = invoices.filter(i => i.status === 'unpaid');

  const openPay = (inv) => {
    setPayModal(inv);
    setPayForm({
      paid_date:      new Date().toISOString().split('T')[0],
      paid_amount:    inv.total,
      payment_method: 'bank',
      payment_remarks: '',
    });
  };

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    try { await markInvoicePaid(payModal.id, payForm); setPayModal(null); } catch {}
  };

  const downloadExcel = () => {
    const data = filtered.map(inv => ({
      'Invoice #': inv.invoice_number,
      'Client': inv.client_name || inv.client_name_display || '',
      'Invoice Date': inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '',
      'Amount': inv.total,
      'Status': inv.status,
      'Payment Date': inv.paid_date ? format(parseISO(inv.paid_date), 'dd MMM yyyy') : '',
      'Method': inv.payment_method ? PAYMENT_METHODS[inv.payment_method] || inv.payment_method : '',
      'Remarks': inv.payment_remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, "Payments.xlsx");
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Track and manage invoice payments</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '28px' }}>
        <div className="stat-card" style={{ '--card-accent': '#10b981' }}>
          <div className="stat-icon" style={{ background: '#d1fae5', color: '#10b981' }}>💰</div>
          <div className="stat-label">Total Received</div>
          <div className="stat-value">{fmt(paid.reduce((s, i) => s + parseFloat(i.total), 0))}</div>
          <div className="stat-sub">{paid.length} paid invoices</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': '#f59e0b' }}>
          <div className="stat-icon" style={{ background: '#fef3c7', color: '#f59e0b' }}>⏳</div>
          <div className="stat-label">Pending</div>
          <div className="stat-value">{fmt(unpaid.reduce((s, i) => s + parseFloat(i.total), 0))}</div>
          <div className="stat-sub">{unpaid.length} unpaid invoices</div>
        </div>
        <div className="stat-card" style={{ '--card-accent': '#6366f1' }}>
          <div className="stat-icon" style={{ background: '#e0e7ff', color: '#6366f1' }}>📊</div>
          <div className="stat-label">Collection Rate</div>
          <div className="stat-value">
            {invoices.length ? Math.round((paid.length / invoices.length) * 100) : 0}%
          </div>
          <div className="stat-sub">of invoices collected</div>
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all','unpaid','paid'].map(f => (
              <button key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '7px 16px', border: '1.5px solid', borderRadius: '99px',
                  fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter',
                  background: filter === f ? 'var(--primary)' : 'white',
                  color: filter === f ? 'white' : 'var(--text-muted)',
                  borderColor: filter === f ? 'var(--primary)' : 'var(--border)',
                }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
          
          <input type="date" className="form-control" style={{ width: '130px', padding: '6px 12px' }} 
                 value={dateFilter.start} onChange={e => setDateFilter(d => ({...d, start: e.target.value}))} title="Start Date" />
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500 }}>to</span>
          <input type="date" className="form-control" style={{ width: '130px', padding: '6px 12px' }} 
                 value={dateFilter.end} onChange={e => setDateFilter(d => ({...d, end: e.target.value}))} title="End Date" />
          
          <button className="btn btn-secondary" onClick={downloadExcel} title="Export to Excel" style={{ padding: '7px 12px', height: '36px' }}>
            <MdDownload /> Export
          </button>
        </div>
        <div className="search-box">
          <MdSearch className="search-icon" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      {loading.invoices ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💳</div>
          <h3>No payments found</h3>
          <p>Create and mark invoices as paid to track payments here.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Invoice Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Payment Date</th>
                <th>Method</th>
                <th>Remarks</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                  <td style={{ fontWeight: 600 }}>{inv.client_name || inv.client_name_display || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                  <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {inv.paid_date ? format(parseISO(inv.paid_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {inv.payment_method ? PAYMENT_METHODS[inv.payment_method] || inv.payment_method : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={inv.payment_remarks}>
                    {inv.payment_remarks || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {inv.status !== 'paid' ? (
                      <button className="btn btn-success btn-sm" onClick={() => openPay(inv)}>
                        <MdCheckCircle /> Mark Paid
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => markInvoiceUnpaid(inv.id)}>
                        Mark Unpaid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayModal(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <span className="modal-title">Record Payment</span>
              <button className="modal-close" onClick={() => setPayModal(null)}><MdClose /></button>
            </div>
            <form onSubmit={handleMarkPaid}>
              <div className="modal-body">
                <div className="alert alert-success">
                  Recording payment for <strong>{payModal.invoice_number}</strong> — {fmt(payModal.total)}
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input className="form-control" type="date" value={payForm.paid_date}
                    onChange={e => setPayForm(f => ({ ...f, paid_date: e.target.value }))} />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Amount (₹)</label>
                    <input className="form-control" type="number" step="0.01" value={payForm.paid_amount}
                      onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Payment Method</label>
                    <select className="form-control" value={payForm.payment_method}
                      onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                      {Object.entries(PAYMENT_METHODS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label className="form-label">Remarks / Reference (Optional)</label>
                  <input className="form-control" type="text" placeholder="Transaction ID, notes..." value={payForm.payment_remarks}
                    onChange={e => setPayForm(f => ({ ...f, payment_remarks: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-success"><MdCheckCircle /> Confirm Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Payments;
