import React, { useState, useEffect } from 'react';
import { MdPeople, MdWarning, MdTrendingUp, MdRefresh, MdCheckCircle, MdDownload, MdList, MdKeyboardArrowDown, MdKeyboardArrowUp, MdReceipt, MdInventory, MdAccessTime } from 'react-icons/md';
import { format, parseISO } from 'date-fns';
import { reportAPI, invoiceAPI } from '../services/api';
import { toast } from 'react-toastify';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const TABS = [
  { id: 'monthly',  label: 'Monthly Revenue', icon: <MdTrendingUp /> },
  { id: 'tax',      label: 'Tax Summary',     icon: <MdReceipt /> },
  { id: 'items',    label: 'Item Sales',      icon: <MdInventory /> },
  { id: 'aging',    label: 'Pending Invoices',icon: <MdAccessTime /> },
  { id: 'clients',  label: 'Top Clients',      icon: <MdPeople /> },
  { id: 'all_invoices', label: 'All Invoices', icon: <MdList /> },
  { id: 'unpaid',   label: 'Unpaid Invoices',  icon: <MdWarning /> },
  { id: 'paid',     label: 'Paid Invoices',    icon: <MdCheckCircle /> },
];

function Reports() {
  const [tab,     setTab]     = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [groupBy,   setGroupBy]   = useState('month');
  const [monthly, setMonthly] = useState([]);
  const [clients, setClients] = useState([]);
  const [unpaid,  setUnpaid]  = useState([]);
  const [paid,    setPaid]    = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  
  const [dashboardData, setDashboardData] = useState(null);
  const [taxData, setTaxData] = useState([]);
  const [itemData, setItemData] = useState([]);
  const [agingData, setAgingData] = useState({ bracket30: [], bracket60: [], bracket90: [], bracketOlder: [] });

  // For client history
  const [expandedClient, setExpandedClient] = useState(null);
  const [clientInvoices, setClientInvoices] = useState([]);
  const [loadingClientInvoices, setLoadingClientInvoices] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const params = {};
      const dashboardParams = {};
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
        dashboardParams.startDate = startDate;
        dashboardParams.endDate = endDate;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(start);
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - diffDays);
        dashboardParams.prevStartDate = prevStart.toISOString().split('T')[0];
        dashboardParams.prevEndDate = prevEnd.toISOString().split('T')[0];
      }
      params.groupBy = groupBy;
      
      const [m, c, u, p, a, d, t, i] = await Promise.all([
        reportAPI.monthlyRevenue(params),
        reportAPI.topClients(params),
        reportAPI.unpaidInvoices(params),
        reportAPI.paidInvoices(params),
        invoiceAPI.getAll(params),
        reportAPI.dashboard(dashboardParams),
        reportAPI.taxSummary(params),
        reportAPI.itemSales(params)
      ]);
      setMonthly(m.data);
      setClients(c.data);
      setUnpaid(u.data);
      setPaid(p.data);
      setAllInvoices(a.data);
      setDashboardData(d.data);
      setTaxData(t.data);
      setItemData(i.data);

      // Calculate aging buckets
      const aging = { bracket30: [], bracket60: [], bracket90: [], bracketOlder: [] };
      u.data.forEach(inv => {
        const days = parseInt(inv.days_pending) || 0;
        if (days <= 30) aging.bracket30.push(inv);
        else if (days <= 60) aging.bracket60.push(inv);
        else if (days <= 90) aging.bracket90.push(inv);
        else aging.bracketOlder.push(inv);
      });
      setAgingData(aging);
    } catch (err) {
      toast.error('Failed to load reports. Is the backend running?');
    }
    setLoading(false);
  };

  const toggleClientExpand = async (clientId) => {
    if (expandedClient === clientId) {
      setExpandedClient(null);
      return;
    }
    setExpandedClient(clientId);
    setLoadingClientInvoices(true);
    try {
      const res = await invoiceAPI.getAll({ client_id: clientId });
      setClientInvoices(res.data);
    } catch (err) {
      toast.error('Failed to load client history');
    }
    setLoadingClientInvoices(false);
  };

  useEffect(() => { loadAll(); }, [startDate, endDate, groupBy]); // eslint-disable-line

  const maxRevenue = monthly.length ? Math.max(...monthly.map(m => parseFloat(m.total_revenue) || 0), 1) : 1;

  const handleDownloadCSV = () => {
    let data = [];
    let filename = '';
    let csvRows = [];

    if (tab === 'monthly') {
      data = monthly;
      filename = 'monthly_revenue.csv';
      csvRows.push(['Month', 'Invoices', 'Total Revenue', 'Paid Revenue', 'Pending'].join(','));
      data.forEach(m => {
        const pending = parseFloat(m.total_revenue) - parseFloat(m.paid_revenue);
        csvRows.push([`"${m.month}"`, m.invoice_count, m.total_revenue, m.paid_revenue, pending].join(','));
      });
    } else if (tab === 'clients') {
      data = clients;
      filename = 'top_clients.csv';
      csvRows.push(['Client', 'Email', 'Phone', 'Invoices', 'Total Revenue', 'Paid', 'Pending'].join(','));
      data.forEach(c => {
        csvRows.push([`"${c.name}"`, `"${c.email || ''}"`, `"${c.phone || ''}"`, c.invoice_count, c.total_revenue, c.paid_amount, c.pending_amount].join(','));
      });
    } else if (tab === 'unpaid' || tab === 'aging') {
      data = unpaid;
      filename = 'unpaid_invoices.csv';
      csvRows.push(['Invoice #', 'Client', 'Email', 'Invoice Date', 'Amount', 'Days Pending'].join(','));
      data.forEach(i => {
        const date = i.invoice_date ? format(parseISO(i.invoice_date), 'dd MMM yyyy') : '';
        csvRows.push([`"${i.invoice_number}"`, `"${i.client_name}"`, `"${i.client_email || ''}"`, `"${date}"`, i.total, i.days_pending].join(','));
      });
    } else if (tab === 'paid') {
      data = paid;
      filename = 'paid_invoices.csv';
      csvRows.push(['Invoice #', 'Client', 'Email', 'Invoice Date', 'Amount', 'Days Since Invoiced'].join(','));
      data.forEach(i => {
        const date = i.invoice_date ? format(parseISO(i.invoice_date), 'dd MMM yyyy') : '';
        csvRows.push([`"${i.invoice_number}"`, `"${i.client_name}"`, `"${i.client_email || ''}"`, `"${date}"`, i.total, i.days_since_invoiced].join(','));
      });
    } else if (tab === 'all_invoices') {
      data = allInvoices;
      filename = 'all_invoices_detailed.csv';
      csvRows.push(['Invoice #', 'Client', 'Email', 'Invoice Date', 'Subtotal', 'GST Amount', 'Discount', 'Total Amount', 'Status'].join(','));
      data.forEach(i => {
        const date = i.invoice_date ? format(parseISO(i.invoice_date), 'dd MMM yyyy') : '';
        csvRows.push([`"${i.invoice_number}"`, `"${i.client_name || i.client_name_display || ''}"`, `"${i.client_email || ''}"`, `"${date}"`, i.subtotal || 0, i.gst_amount || 0, i.discount || 0, i.total || 0, i.status].join(','));
      });
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadClientHistoryCSV = (clientName, invoices) => {
    let filename = `${clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_invoices.csv`;
    let csvRows = [];
    csvRows.push(['Invoice #', 'Invoice Date', 'Subtotal', 'GST Amount', 'Discount', 'Total Amount', 'Status'].join(','));
    invoices.forEach(i => {
      const date = i.invoice_date ? format(parseISO(i.invoice_date), 'dd MMM yyyy') : '';
      csvRows.push([`"${i.invoice_number}"`, `"${date}"`, i.subtotal || 0, i.gst_amount || 0, i.discount || 0, i.total || 0, i.status].join(','));
    });
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderGrowthBadge = (current, previous) => {
    const cur = parseFloat(current) || 0;
    const prev = parseFloat(previous) || 0;
    if (prev === 0) return null;
    const percent = ((cur - prev) / prev) * 100;
    if (percent === 0) return null;
    const isPositive = percent > 0;
    return (
      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: isPositive ? 'var(--success-light)' : 'var(--danger-light)', color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
        {isPositive ? '↑' : '↓'} {Math.abs(percent).toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="page-wrapper">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Analytics and business insights</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="date" 
            className="input" 
            style={{ padding: '8px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid var(--border)' }}
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>to</span>
          <input 
            type="date" 
            className="input" 
            style={{ padding: '8px 12px', fontSize: '14px', borderRadius: '6px', border: '1px solid var(--border)' }}
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
          />
          
          <button className="btn btn-secondary" onClick={handleDownloadCSV} disabled={loading || (tab === 'monthly' && !monthly.length) || (tab === 'clients' && !clients.length) || (tab === 'unpaid' && !unpaid.length) || (tab === 'aging' && !unpaid.length) || (tab === 'paid' && !paid.length) || (tab === 'all_invoices' && !allInvoices.length)}>
            <MdDownload /> Export CSV
          </button>
          <button className="btn btn-ghost" onClick={loadAll} disabled={loading}>
            <MdRefresh /> Refresh
          </button>
        </div>
      </div>

      {dashboardData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }} className="no-print">
          <div className="section-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Revenue</div>
              {renderGrowthBadge(dashboardData.current_period?.cur_total_revenue, dashboardData.prev_period?.prev_total_revenue)}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{fmt(dashboardData.total_revenue)}</div>
          </div>
          <div className="section-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Payments Received</div>
              {renderGrowthBadge(dashboardData.current_period?.cur_paid_amount, dashboardData.prev_period?.prev_paid_amount)}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>{fmt(dashboardData.paid_amount)}</div>
          </div>
          <div className="section-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Pending</div>
              {renderGrowthBadge(dashboardData.current_period?.cur_unpaid_amount, dashboardData.prev_period?.prev_unpaid_amount)}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--warning)', marginTop: '4px' }}>{fmt(dashboardData.unpaid_amount)}</div>
          </div>
          <div className="section-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Invoices</div>
              {renderGrowthBadge(dashboardData.current_period?.cur_total_invoices, dashboardData.prev_period?.prev_total_invoices)}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{dashboardData.total_invoices}</div>
          </div>
        </div>
      )}

      {/* Invoice Status Funnel */}
      {dashboardData && (
        <div className="section-card no-print" style={{ marginBottom: '24px', padding: '20px' }}>
          <h4 style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>Invoice Conversion Funnel</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ flex: 1, padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Drafts</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#475569' }}>{dashboardData.draft_count || 0}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{fmt(dashboardData.draft_amount)}</div>
            </div>
            <div style={{ color: '#cbd5e1' }}>➔</div>
            <div style={{ flex: 1, padding: '12px', background: 'var(--warning-light)', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning)' }}>Sent / Unpaid</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--warning)' }}>{dashboardData.unpaid_count}</div>
              <div style={{ fontSize: '12px', color: '#b45309' }}>{fmt(dashboardData.unpaid_amount)}</div>
            </div>
            <div style={{ color: '#cbd5e1' }}>➔</div>
            <div style={{ flex: 1, padding: '12px', background: 'var(--success-light)', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--success)' }}>Paid</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)' }}>{dashboardData.paid_count}</div>
              <div style={{ fontSize: '12px', color: '#15803d' }}>{fmt(dashboardData.paid_amount)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 20px', border: 'none', borderRadius: 0, cursor: 'pointer',
              fontFamily: 'Inter', fontSize: '14px', fontWeight: 600,
              background: 'transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all 0.2s ease',
              marginBottom: '-1px',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : (
        <>
          {/* Monthly Revenue */}
          {tab === 'monthly' && (
            <div>
              {monthly.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📈</div>
                  <h3>No Revenue Data</h3>
                  <p>Create invoices to see monthly revenue trends.</p>
                </div>
              ) : (
                <>
                  {/* Bar Chart */}
                  <div className="section-card" style={{ marginBottom: '24px' }}>
                    <div className="section-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="section-card-title"><MdTrendingUp style={{ color: 'var(--primary)' }} /> Cash Flow</span>
                      <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', height: '28px' }} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                      </select>
                    </div>
                    <div className="section-card-body">
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '220px', paddingTop: '30px' }}>
                        {[...monthly].reverse().map((m, i) => {
                          const heightRev = ((parseFloat(m.total_revenue) || 0) / maxRevenue) * 170;
                          const heightPaid = ((parseFloat(m.paid_revenue) || 0) / maxRevenue) * 170;
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <div style={{ display: 'flex', width: '100%', gap: '2px', alignItems: 'flex-end', height: '170px' }}>
                                <div title={`Billed: ${fmt(m.total_revenue)}`} style={{
                                  flex: 1, height: `${Math.max(heightRev, 4)}px`,
                                  background: 'linear-gradient(to top, var(--primary), #6366f1)',
                                  borderRadius: '4px 4px 0 0', minHeight: '4px',
                                  transition: 'height 0.6s ease',
                                }} />
                                <div title={`Paid: ${fmt(m.paid_revenue)}`} style={{
                                  flex: 1, height: `${Math.max(heightPaid, 4)}px`,
                                  background: 'linear-gradient(to top, var(--success), #34d399)',
                                  borderRadius: '4px 4px 0 0', minHeight: '4px',
                                  transition: 'height 0.6s ease',
                                }} />
                              </div>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {m.month}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px', fontSize: '12px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'var(--primary)', borderRadius: '2px' }}/> Invoices Issued</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'var(--success)', borderRadius: '2px' }}/> Payments Received</div>
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr><th>Month</th><th>Invoices</th><th>Total Revenue</th><th>Paid Revenue</th><th>Pending</th></tr>
                      </thead>
                      <tbody>
                        {monthly.map((m, i) => {
                          const pending = parseFloat(m.total_revenue) - parseFloat(m.paid_revenue);
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 600 }}>{m.month}</td>
                              <td>{m.invoice_count}</td>
                              <td style={{ fontWeight: 700 }}>{fmt(m.total_revenue)}</td>
                              <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmt(m.paid_revenue)}</td>
                              <td style={{ color: pending > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                                {fmt(pending)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tax Summary */}
          {tab === 'tax' && (
            <div>
              {taxData.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🧾</div>
                  <h3>No Tax Data</h3>
                  <p>Create invoices with GST to see the tax summary.</p>
                </div>
              ) : (
                <>
                  <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                    <MdReceipt />
                    <span>
                      Total GST Collected for period: <strong>{fmt(taxData.reduce((s, i) => s + parseFloat(i.total_gst), 0))}</strong>
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr><th>Month</th><th>Invoices</th><th>Taxable Amount (Subtotal)</th><th>GST Collected</th><th>Total Amount</th></tr>
                      </thead>
                      <tbody>
                        {taxData.map((t, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{t.month}</td>
                            <td>{t.invoice_count}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(t.total_subtotal)}</td>
                            <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(t.total_gst)}</td>
                            <td style={{ fontWeight: 700 }}>{fmt(t.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Item Sales */}
          {tab === 'items' && (
            <div>
              {itemData.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📦</div>
                  <h3>No Item Sales</h3>
                  <p>Add items to your invoices to track top selling products/services.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>Item / Service Name</th><th>Qty Sold</th><th>Base Revenue</th><th>GST</th><th>Total Revenue</th></tr>
                    </thead>
                    <tbody>
                      {itemData.map((item, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                          <td>{item.total_quantity}</td>
                          <td style={{ fontWeight: 600 }}>{fmt(item.total_revenue)}</td>
                          <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(item.total_gst)}</td>
                          <td style={{ fontWeight: 700 }}>{fmt(item.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Aging Summary */}
          {tab === 'aging' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="section-card" style={{ padding: '16px', borderTop: '4px solid #10b981' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>1 - 30 Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>{fmt(agingData.bracket30.reduce((s,i) => s + parseFloat(i.total), 0))}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agingData.bracket30.length} invoices</div>
                </div>
                <div className="section-card" style={{ padding: '16px', borderTop: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>31 - 60 Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>{fmt(agingData.bracket60.reduce((s,i) => s + parseFloat(i.total), 0))}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agingData.bracket60.length} invoices</div>
                </div>
                <div className="section-card" style={{ padding: '16px', borderTop: '4px solid #f97316' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>61 - 90 Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f97316', marginTop: '4px' }}>{fmt(agingData.bracket90.reduce((s,i) => s + parseFloat(i.total), 0))}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agingData.bracket90.length} invoices</div>
                </div>
                <div className="section-card" style={{ padding: '16px', borderTop: '4px solid #ef4444' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>90+ Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>{fmt(agingData.bracketOlder.reduce((s,i) => s + parseFloat(i.total), 0))}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agingData.bracketOlder.length} invoices</div>
                </div>
              </div>
              
              <h4 style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>Detailed Breakdown (All Pending)</h4>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr><th>Invoice #</th><th>Client</th><th>Days Overdue</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {unpaid.map(inv => (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                        <td style={{ fontWeight: 600 }}>{inv.client_name}</td>
                        <td>
                          <span className={`badge ${parseInt(inv.days_pending) > 90 ? 'badge-cancelled' : parseInt(inv.days_pending) > 60 ? 'badge-warning' : parseInt(inv.days_pending) > 30 ? 'badge-unpaid' : 'badge-draft'}`}>
                            {inv.days_pending} days
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                      </tr>
                    ))}
                    {unpaid.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No unpaid invoices found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* All Invoices */}
          {tab === 'all_invoices' && (
            <div>
              {allInvoices.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <h3>No Invoices Yet</h3>
                  <p>You haven't created any invoices.</p>
                </div>
              ) : (
                <>
                  <div className="alert alert-info" style={{ marginBottom: '20px' }}>
                    <MdList />
                    <span>
                      <strong>{allInvoices.length} total invoice{allInvoices.length !== 1 ? 's' : ''}</strong> amounting to{' '}
                      <strong>{fmt(allInvoices.reduce((s, i) => s + parseFloat(i.total), 0))}</strong>
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr><th>Invoice #</th><th>Client</th><th>Invoice Date</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {allInvoices.map(inv => {
                          return (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{inv.client_name || inv.client_name_display}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{inv.client_email || ''}</div>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>
                                {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
                              </td>
                              <td style={{ fontWeight: 600 }}>{fmt(inv.subtotal)}</td>
                              <td style={{ fontWeight: 600, color: '#f59e0b' }}>{fmt(inv.gst_amount)}</td>
                              <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                              <td>
                                <span className={`badge badge-${inv.status}`}>
                                  {inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : ''}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Top Clients */}
          {tab === 'clients' && (
            <div>
              {clients.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <h3>No Client Data</h3>
                  <p>Add clients and create invoices to see top clients.</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr><th>#</th><th>Client</th><th>Invoices</th><th>Total Revenue</th><th>Paid</th><th>Pending</th></tr>
                    </thead>
                    <tbody>
                      {clients.map((c, i) => (
                        <React.Fragment key={c.id}>
                          <tr onClick={() => toggleClientExpand(c.id)} style={{ cursor: 'pointer', background: expandedClient === c.id ? 'var(--bg)' : 'transparent' }}>
                            <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {expandedClient === c.id ? <MdKeyboardArrowUp size={18} /> : <MdKeyboardArrowDown size={18} />}
                                #{i + 1}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  width: '36px', height: '36px', borderRadius: '10px',
                                  background: 'linear-gradient(135deg, var(--primary), #6366f1)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'white', fontWeight: 700, fontSize: '14px', flexShrink: 0
                                }}>{c.name?.charAt(0).toUpperCase()}</div>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.email || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td><span className="badge badge-info">{c.invoice_count}</span></td>
                            <td style={{ fontWeight: 700 }}>{fmt(c.total_revenue)}</td>
                            <td style={{ color: 'var(--success)', fontWeight: 600 }}>{fmt(c.paid_amount)}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: parseFloat(c.pending_amount) > 0 ? 'var(--warning)' : 'var(--success)' }}>
                                {fmt(c.pending_amount)}
                              </span>
                            </td>
                          </tr>
                          {expandedClient === c.id && (
                            <tr>
                              <td colSpan="6" style={{ background: 'var(--bg)', padding: '16px' }}>
                                {loadingClientInvoices ? (
                                  <div className="loading-spinner"><div className="spinner" /></div>
                                ) : clientInvoices.length === 0 ? (
                                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No invoice history found.</div>
                                ) : (
                                  <div style={{ padding: '0 40px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                      <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Invoice History for {c.name}</h4>
                                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }} onClick={(e) => { e.stopPropagation(); handleDownloadClientHistoryCSV(c.name, clientInvoices); }}>
                                        <MdDownload style={{ fontSize: '14px' }} /> Export Client Invoices
                                      </button>
                                    </div>
                                    <table className="table" style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', margin: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                      <thead style={{ background: 'var(--bg-light)' }}>
                                        <tr><th>Invoice #</th><th>Date</th><th>Subtotal</th><th>GST</th><th>Total</th><th>Status</th></tr>
                                      </thead>
                                      <tbody>
                                        {clientInvoices.map(inv => (
                                          <tr key={inv.id}>
                                            <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}</td>
                                            <td style={{ fontWeight: 600 }}>{fmt(inv.subtotal)}</td>
                                            <td style={{ fontWeight: 600, color: '#f59e0b' }}>{fmt(inv.gst_amount)}</td>
                                            <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                                            <td>
                                              <span className={`badge badge-${inv.status}`} style={{ fontSize: '11px', padding: '2px 6px' }}>
                                                {inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : ''}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Unpaid Invoices */}
          {tab === 'unpaid' && (
            <div>
              {unpaid.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🎉</div>
                  <h3>All Caught Up!</h3>
                  <p>No unpaid invoices. Great job collecting payments!</p>
                </div>
              ) : (
                <>
                  <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
                    <MdWarning />
                    <span>
                      <strong>{unpaid.length} unpaid invoice{unpaid.length !== 1 ? 's' : ''}</strong> totaling{' '}
                      <strong>{fmt(unpaid.reduce((s, i) => s + parseFloat(i.total), 0))}</strong> pending
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr><th>Invoice #</th><th>Client</th><th>Invoice Date</th><th>Amount</th><th>Days Pending</th></tr>
                      </thead>
                      <tbody>
                        {unpaid.map(inv => {
                          const days = parseInt(inv.days_pending) || 0;
                          return (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{inv.client_name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{inv.client_email || ''}</div>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>
                                {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
                              </td>
                              <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                              <td>
                                <span className={`badge ${days > 30 ? 'badge-cancelled' : days > 15 ? 'badge-unpaid' : 'badge-draft'}`}>
                                  {days} day{days !== 1 ? 's' : ''}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Paid Invoices */}
          {tab === 'paid' && (
            <div>
              {paid.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">💸</div>
                  <h3>No Paid Invoices</h3>
                  <p>You haven't collected any payments yet.</p>
                </div>
              ) : (
                <>
                  <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                    <MdCheckCircle />
                    <span>
                      <strong>{paid.length} paid invoice{paid.length !== 1 ? 's' : ''}</strong> totaling{' '}
                      <strong>{fmt(paid.reduce((s, i) => s + parseFloat(i.total), 0))}</strong> collected
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr><th>Invoice #</th><th>Client</th><th>Invoice Date</th><th>Amount</th><th>Days Since Invoiced</th></tr>
                      </thead>
                      <tbody>
                        {paid.map(inv => {
                          const days = parseInt(inv.days_since_invoiced) || 0;
                          return (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 700, color: 'var(--success)' }}>{inv.invoice_number}</td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{inv.client_name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{inv.client_email || ''}</div>
                              </td>
                              <td style={{ color: 'var(--text-muted)' }}>
                                {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
                              </td>
                              <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                              <td>
                                <span className="badge badge-success">
                                  {days} day{days !== 1 ? 's' : ''}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Reports;
