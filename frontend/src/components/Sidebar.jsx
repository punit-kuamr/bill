import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  MdDashboard, MdReceipt, MdAddBox, MdPeople,
  MdPayment, MdBarChart, MdSettings, MdDeleteOutline
} from 'react-icons/md';
import { useAppContext } from '../context/AppContext';
import './Sidebar.css';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: <MdDashboard />, section: 'OVERVIEW' },
  { path: '/invoices', label: 'Invoices', icon: <MdReceipt />, section: 'MANAGE' },
  { path: '/invoices/new', label: 'Create Invoice', icon: <MdAddBox />, section: null },
  { path: '/clients', label: 'Clients', icon: <MdPeople />, section: null },
  { path: '/payments', label: 'Payments', icon: <MdPayment />, section: null },
  { path: '/recycle-bin', label: 'Recycle Bin', icon: <MdDeleteOutline />, section: null },
  { path: '/reports', label: 'Reports', icon: <MdBarChart />, section: 'ANALYTICS' },
  { path: '/settings', label: 'Settings', icon: <MdSettings />, section: 'SYSTEM' },
];

function Sidebar() {
  const location = useLocation();
  const { stats, settings } = useAppContext();

  const unpaidCount = stats?.unpaid_count || 0;

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-logo">
          <div className="brand-icon">📊</div>
          <div className="brand-text">
            <h2>InvoiceFlow</h2>
            <span>Invoice Manager</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item, idx) => {
          const prevItem = navItems[idx - 1];
          const showSection = item.section && (!prevItem || prevItem.section !== item.section);

          return (
            <React.Fragment key={item.path}>
              {showSection && (
                <div className="nav-section-label">{item.section}</div>
              )}
              <NavLink
                to={item.path}
                className={({ isActive }) => {
                  // For "Create Invoice", only active on exact path
                  if (item.path === '/invoices/new') {
                    return location.pathname === '/invoices/new' ? 'nav-item active' : 'nav-item';
                  }
                  // For invoices list, active only when not on new/edit
                  if (item.path === '/invoices') {
                    const onInvoices = location.pathname === '/invoices' ||
                      (location.pathname.startsWith('/invoices') && !location.pathname.includes('/new') && !location.pathname.includes('/edit'));
                    return onInvoices ? 'nav-item active' : 'nav-item';
                  }
                  return isActive ? 'nav-item active' : 'nav-item';
                }}
                end={item.path === '/dashboard'}
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-text">{item.label}</span>
                {item.path === '/invoices' && unpaidCount > 0 && (
                  <span className="nav-badge">{unpaidCount}</span>
                )}
              </NavLink>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">
            {(settings?.company_name || 'A').charAt(0).toUpperCase()}
          </div>
          <div className="user-info">
            <h4>{settings?.company_name || 'Ankit Infotech'}</h4>
            <p>GSTIN: {settings?.company_gstin || '08BHQPB3266F1ZB'}</p>
          </div>
        </div>
        <div className="version-tag">InvoiceFlow v1.0 </div>
      </div>
    </aside>
  );
}

export default Sidebar;
