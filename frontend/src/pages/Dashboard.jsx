import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdTrendingUp, MdReceiptLong,
  MdArrowForward, MdWarning
} from 'react-icons/md';
import { useAppContext } from '../context/AppContext';
import { reportAPI } from '../services/api';
import { format, parseISO } from 'date-fns';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

function Dashboard() {
  const navigate = useNavigate();
  const { stats, invoices, clients, loading, fetchStats } = useAppContext();
  const [monthly, setMonthly] = useState([]);

  useEffect(() => {
    fetchStats();
    reportAPI.monthlyRevenue()
      .then(r => setMonthly(r.data.slice(0, 6).reverse()))
      .catch(() => {});
  }, []); // eslint-disable-line

  const recentInvoices = invoices.slice(0, 5);
  const unpaidInvoices = invoices.filter(i => i.status === 'unpaid').slice(0, 3);

  const statCards = [
    {
      label:  'Total Revenue',
      value:  (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span>{fmt(stats?.total_revenue)}</span>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>({stats?.total_invoices || 0} bills)</span>
        </div>
      ),
      icon:   '💰',
      color:  '#2563eb',
      bg:     '#dbeafe',
      accent: '#2563eb',
      sub:    'All time revenue',
    },
    {
      label:  'Paid Amount',
      value:  (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span>{fmt(stats?.paid_amount)}</span>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>({stats?.paid_count || 0} bills)</span>
        </div>
      ),
      icon:   '✅',
      color:  '#10b981',
      bg:     '#d1fae5',
      accent: '#10b981',
      sub:    'Successfully collected',
    },
    {
      label:  'Pending',
      value:  (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span>{fmt(stats?.unpaid_amount)}</span>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500 }}>({stats?.unpaid_count || 0} bills)</span>
        </div>
      ),
      icon:   '⏳',
      color:  '#f59e0b',
      bg:     '#fef3c7',
      accent: '#f59e0b',
      sub:    'Pending collection',
    },
    {
      label:  'Total Clients',
      value:  stats?.client_count || clients.length || 0,
      icon:   '👥',
      color:  '#6366f1',
      bg:     '#e0e7ff',
      accent: '#6366f1',
      sub:    'Active clients',
    },
  ];

  // Bar chart
  const maxRevenue = monthly.length ? Math.max(...monthly.map(m => parseFloat(m.total_revenue) || 0), 1) : 1;

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back — here's your business overview for{' '}
            {format(new Date(), 'MMMM yyyy')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
          + Create Invoice
        </button>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="stat-card"
            style={{ '--card-accent': card.accent }}
          >
            <div className="stat-icon" style={{ background: card.bg, color: card.color }}>
              {card.icon}
            </div>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
            <div className="stat-sub">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts + Alerts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '24px' }}>
        {/* Revenue Bar Chart */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdTrendingUp style={{ color: 'var(--primary)' }} />
              Monthly Revenue
            </span>
          </div>
          <div className="section-card-body">
            {monthly.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px' }}>
                <div className="empty-state-icon">📈</div>
                <p>No revenue data yet. Create your first invoice!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '180px', paddingTop: '20px' }}>
                {monthly.map((m, i) => {
                  const height = ((parseFloat(m.total_revenue) || 0) / maxRevenue) * 140;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {fmt(m.total_revenue)}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(height, 4)}px`,
                          background: 'linear-gradient(to top, #2563eb, #6366f1)',
                          borderRadius: '6px 6px 0 0',
                          transition: 'height 0.5s ease',
                          minHeight: '4px',
                        }}
                      />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {m.month}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pending Invoices */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdWarning style={{ color: 'var(--warning)' }} />
              Overdue / Unpaid
            </span>
          </div>
          <div className="section-card-body" style={{ padding: '16px' }}>
            {unpaidInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                <p style={{ fontSize: '13px' }}>No unpaid invoices!</p>
              </div>
            ) : (
              unpaidInvoices.map(inv => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px', borderRadius: '10px', marginBottom: '8px',
                    background: '#fff8f0', border: '1px solid #fed7aa', cursor: 'pointer'
                  }}
                  onClick={() => navigate('/invoices')}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {inv.client_name || inv.client_name_display}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {inv.invoice_number}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--warning)' }}>
                    {fmt(inv.total)}
                  </div>
                </div>
              ))
            )}
            {unpaidInvoices.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
                onClick={() => navigate('/invoices')}>
                View all unpaid <MdArrowForward />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="section-card">
        <div className="section-card-header">
          <span className="section-card-title">
            <MdReceiptLong style={{ color: 'var(--primary)' }} />
            Recent Invoices
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/invoices')}>
            View All <MdArrowForward />
          </button>
        </div>
        {loading.invoices ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : recentInvoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <h3>No Invoices Yet</h3>
            <p>Create your first invoice to get started!</p>
            <button className="btn btn-primary" onClick={() => navigate('/invoices/new')}>
              + Create Invoice
            </button>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/invoices')}>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{inv.invoice_number}</td>
                    <td>{inv.client_name || inv.client_name_display || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmt(inv.total)}</td>
                    <td>
                      <span className={`badge badge-${inv.status}`}>
                        {inv.status?.charAt(0).toUpperCase() + inv.status?.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
