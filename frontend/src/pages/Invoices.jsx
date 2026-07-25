import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  MdSearch,
  MdAdd,
  MdEdit,
  MdDelete,
  MdEmail,
  MdDownload,
  MdUpload,
  MdCheckCircle,
  MdCancel,
  MdClose,
  MdCopyAll,
  MdVisibility,
} from 'react-icons/md';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';

import { useAppContext } from '../context/AppContext';
import { invoiceAPI, emailAPI } from '../services/api';
import InvoicePreview from '../components/InvoicePreview';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = ['all', 'draft', 'unpaid', 'paid', 'cancelled'];

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function Invoices() {
  const navigate = useNavigate();
  const {
    invoices,
    loading,
    fetchInvoices,
    deleteInvoice,
    markInvoicePaid,
    markInvoiceUnpaid,
  } = useAppContext();

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  // Mark-as-paid modal
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({
    paid_date: '',
    paid_amount: '',
    payment_method: 'bank',
    payment_remarks: '',
  });

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Email modal
  const [emailModal, setEmailModal] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);

  // Preview
  const [previewId, setPreviewId] = useState(null);

  // Bulk Upload
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // ---------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------

  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------

  const filtered = invoices.filter((inv) => {
    const matchStatus = status === 'all' || inv.status === status;

    const searchTerm = search.toLowerCase();
    const matchSearch =
      !search ||
      inv.invoice_number?.toLowerCase().includes(searchTerm) ||
      (inv.client_name || inv.client_name_display || '')
        .toLowerCase()
        .includes(searchTerm);

    return matchStatus && matchSearch;
  });

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = s === 'all' ? invoices.length : invoices.filter((i) => i.status === s).length;
    return acc;
  }, {});

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  const openPayModal = (inv) => {
    setPayModal(inv);
    setPayForm({
      paid_date: new Date().toISOString().split('T')[0],
      paid_amount: inv.total,
      payment_method: 'bank',
      payment_remarks: '',
    });
  };

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    if (!payModal) return;

    try {
      await markInvoicePaid(payModal.id, payForm);
      setPayModal(null);
    } catch {
      // errors are surfaced by the context layer
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;

    try {
      await deleteInvoice(confirmDelete.id);
    } catch {
      // errors are surfaced by the context layer
    }
    setConfirmDelete(null);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailModal) return;

    setSending(true);
    try {
      await emailAPI.sendInvoice({
        invoice_id: emailModal.id,
        recipient_email: emailTo,
      });
      toast.success(`📧 Invoice sent to ${emailTo}`);
      setEmailModal(null);
    } catch (err) {
      toast.error(`Email failed: ${err.message}`);
    }
    setSending(false);
  };

  const handleDownloadPDF = (inv) => {
    const url = invoiceAPI.downloadPDF(inv.id);
    window.open(url, '_blank');
  };

  const handleDuplicate = async (inv) => {
    try {
      await invoiceAPI.duplicate(inv.id);
      await fetchInvoices();
      toast.success('Invoice duplicated!');
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      if (!json || json.length === 0) {
        throw new Error('The file is empty or formatted incorrectly.');
      }

      const res = await invoiceAPI.bulkImport({ invoices: json });
      toast.success(`Successfully imported ${res.data.importedCount} invoices!`);
      fetchInvoices();
    } catch (err) {
      toast.error(`Import failed: ${err.message || 'Check your file format'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  return (
    <div className="page-wrapper">
      <PageHeader
        count={invoices.length}
        onCreate={() => navigate('/invoices/new')}
        onUpload={() => fileInputRef.current?.click()}
        uploading={uploading}
      />
      
      <input 
        type="file" 
        accept=".xlsx, .xls, .csv" 
        style={{ display: 'none' }} 
        ref={fileInputRef}
        onChange={handleFileUpload} 
      />

      <StatusTabs
        statusCounts={statusCounts}
        activeStatus={status}
        onChange={setStatus}
      />

      <SearchBar
        search={search}
        onSearchChange={setSearch}
        resultCount={filtered.length}
      />

      {loading.invoices ? (
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          search={search}
          status={status}
          onCreate={() => navigate('/invoices/new')}
        />
      ) : (
        <InvoiceTable
          invoices={filtered}
          onPreview={setPreviewId}
          onMarkPaid={openPayModal}
          onMarkUnpaid={markInvoiceUnpaid}
          onEdit={(id) => navigate(`/invoices/edit/${id}`)}
          onEmail={(inv) => {
            setEmailModal(inv);
            setEmailTo(inv.client_email || '');
          }}
          onDownload={handleDownloadPDF}
          onDuplicate={handleDuplicate}
          onDelete={setConfirmDelete}
        />
      )}

      {payModal && (
        <MarkPaidModal
          invoice={payModal}
          form={payForm}
          setForm={setPayForm}
          onClose={() => setPayModal(null)}
          onSubmit={handleMarkPaid}
        />
      )}

      {emailModal && (
        <EmailModal
          invoice={emailModal}
          email={emailTo}
          setEmail={setEmailTo}
          sending={sending}
          onClose={() => setEmailModal(null)}
          onSubmit={handleSendEmail}
        />
      )}

      {previewId && (
        <InvoicePreview invoiceId={previewId} onClose={() => setPreviewId(null)} />
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          invoice={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader({ count, onCreate, onUpload, uploading }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Invoices</h1>
        <p className="page-subtitle">
          {count} invoice{count !== 1 ? 's' : ''} total
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-secondary" onClick={onUpload} disabled={uploading}>
          <MdUpload /> {uploading ? 'Uploading...' : 'Upload Invoices'}
        </button>
        <button className="btn btn-primary" onClick={onCreate}>
          <MdAdd /> Create Invoice
        </button>
      </div>
    </div>
  );
}

function StatusTabs({ statusCounts, activeStatus, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {STATUS_OPTIONS.map((s) => {
        const isActive = activeStatus === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              padding: '7px 16px',
              borderRadius: '99px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              background: isActive ? 'var(--primary)' : 'white',
              color: isActive ? 'white' : 'var(--text-muted)',
              border: '1.5px solid',
              borderColor: isActive ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.2s ease',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span
              style={{
                marginLeft: '6px',
                padding: '1px 7px',
                borderRadius: '99px',
                fontSize: '11px',
                background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg)',
              }}
            >
              {statusCounts[s]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchBar({ search, onSearchChange, resultCount }) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <MdSearch className="search-icon" />
        <input
          type="text"
          placeholder="Search by invoice # or client..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      {search && (
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function EmptyState({ search, status, onCreate }) {
  const isFiltered = Boolean(search) || status !== 'all';

  return (
    <div className="empty-state">
      <div className="empty-state-icon">📋</div>
      <h3>{isFiltered ? 'No invoices found' : 'No Invoices Yet'}</h3>
      <p>
        {search
          ? `No invoices matching "${search}"`
          : 'Create your first invoice to get started!'}
      </p>
      {!isFiltered && (
        <button className="btn btn-primary" onClick={onCreate}>
          <MdAdd /> Create First Invoice
        </button>
      )}
    </div>
  );
}

function InvoiceTable({
  invoices,
  onPreview,
  onMarkPaid,
  onMarkUnpaid,
  onEdit,
  onEmail,
  onDownload,
  onDuplicate,
  onDelete,
}) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Client</th>
            <th>Date</th>
            <th>Subtotal</th>
            <th>GST</th>
            <th>Total</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                  {inv.invoice_number}
                </span>
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>
                  {inv.client_name || inv.client_name_display || '—'}
                </div>
                {inv.client_email && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {inv.client_email}
                  </div>
                )}
              </td>
              <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {inv.invoice_date ? format(parseISO(inv.invoice_date), 'dd MMM yyyy') : '—'}
              </td>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(inv.subtotal)}</td>
              <td style={{ fontWeight: 600, color: '#f59e0b', whiteSpace: 'nowrap' }}>{fmt(inv.gst_amount)}</td>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(inv.total)}</td>
              <td>
                <span className={`badge badge-${inv.status}`}>
                  {inv.status === 'paid' ? '✅ ' : inv.status === 'unpaid' ? '⏳ ' : ''}
                  {inv.status?.charAt(0).toUpperCase() + inv.status?.slice(1)}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    className="btn-icon primary"
                    title="Preview Invoice"
                    onClick={() => onPreview(inv.id)}
                    style={{
                      background: 'var(--primary-light)',
                      borderColor: 'var(--primary)',
                      color: 'var(--primary)',
                    }}
                  >
                    <MdVisibility />
                  </button>

                  {inv.status !== 'paid' ? (
                    <button className="btn-icon success" title="Mark Paid" onClick={() => onMarkPaid(inv)}>
                      <MdCheckCircle />
                    </button>
                  ) : (
                    <button className="btn-icon" title="Mark Unpaid" onClick={() => onMarkUnpaid(inv.id)}>
                      <MdCancel />
                    </button>
                  )}

                  <button className="btn-icon primary" title="Edit" onClick={() => onEdit(inv.id)}>
                    <MdEdit />
                  </button>

                  <button className="btn-icon" title="Send Email" onClick={() => onEmail(inv)}>
                    <MdEmail />
                  </button>

                  <button className="btn-icon" title="Download PDF" onClick={() => onDownload(inv)}>
                    <MdDownload />
                  </button>

                  <button className="btn-icon" title="Duplicate" onClick={() => onDuplicate(inv)}>
                    <MdCopyAll />
                  </button>

                  <button className="btn-icon danger" title="Delete" onClick={() => onDelete(inv)}>
                    <MdDelete />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkPaidModal({ invoice, form, setForm, onClose, onSubmit }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <span className="modal-title">Record Payment</span>
          <button className="modal-close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="alert alert-info">
              Marking <strong>{invoice.invoice_number}</strong> as paid ({fmt(invoice.total)})
            </div>

            <div className="form-group">
              <label className="form-label">Payment Date</label>
              <input
                className="form-control"
                type="date"
                value={form.paid_date}
                onChange={(e) => setForm((f) => ({ ...f, paid_date: e.target.value }))}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount Received (₹)</label>
                <input
                  className="form-control"
                  type="number"
                  step="0.01"
                  value={form.paid_amount}
                  onChange={(e) => setForm((f) => ({ ...f, paid_amount: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select
                  className="form-control"
                  value={form.payment_method}
                  onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="bank">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Remarks / Reference (Optional)</label>
              <input
                className="form-control"
                type="text"
                placeholder="Transaction ID, notes..."
                value={form.payment_remarks}
                onChange={(e) => setForm((f) => ({ ...f, payment_remarks: e.target.value }))}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-success">
              <MdCheckCircle /> Mark as Paid
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailModal({ invoice, email, setEmail, sending, onClose, onSubmit }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <span className="modal-title">Send Invoice by Email</span>
          <button className="modal-close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Send <strong>{invoice.invoice_number}</strong> ({fmt(invoice.total)}) to:
            </p>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                Recipient Email <span className="required">*</span>
              </label>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              <MdEmail /> {sending ? 'Sending...' : 'Send Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ invoice, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <span className="modal-title">Delete Invoice</span>
          <button className="modal-close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className="modal-body">
          <div className="alert alert-danger">
            Delete <strong>{invoice.invoice_number}</strong>? This cannot be undone.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Delete Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

export default Invoices;