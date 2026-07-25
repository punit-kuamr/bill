import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MdMenu } from 'react-icons/md';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import CreateInvoice from './pages/CreateInvoice';
import Clients from './pages/Clients';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import RecycleBin from './pages/RecycleBin';
import ClientForm from './pages/ClientForm';
import './App.css';

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="app-container">
        <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        <main className="main-content">
          <div className="mobile-header">
            <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>
              <MdMenu />
            </button>
            <div className="mobile-header-title">InvoiceFlow</div>
          </div>
          <Routes>
            <Route path="/"                  element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"         element={<Dashboard />} />
            <Route path="/invoices"          element={<Invoices />} />
            <Route path="/invoices/new"      element={<CreateInvoice />} />
            <Route path="/invoices/edit/:id" element={<CreateInvoice />} />
            <Route path="/clients"           element={<Clients />} />
            <Route path="/clients/new"       element={<ClientForm />} />
            <Route path="/clients/edit/:id"  element={<ClientForm />} />
            <Route path="/payments"          element={<Payments />} />
            <Route path="/reports"           element={<Reports />} />
            <Route path="/settings"          element={<Settings />} />
            <Route path="/recycle-bin"       element={<RecycleBin />} />
            <Route path="*"                  element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
