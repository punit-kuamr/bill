import React, { useState, useEffect } from 'react';
import {
  MdSearch,
  MdRestore,
  MdDeleteForever,
  MdVisibility,
} from 'react-icons/md';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-toastify';
import { invoiceAPI } from '../services/api';
import InvoicePreview from '../components/InvoicePreview';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

function RecycleBin() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Preview
  const [previewId, setPreviewId] = useState(null);
  
  // Confirmations
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchDeleted = async () => {
    setLoading(true);
    try {
      const res = await invoiceAPI.getRecycleBin();
      setInvoices(res.data);
    } catch (err) {
      toast.error('Failed to load recycle bin: ' + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeleted();
  }, []);

  const handleRestore = async () => {
    if (!confirmRestore) return;
    try {
      await invoiceAPI.restore(confirmRestore.id);
      toast.success('Invoice restored successfully!');
      fetchDeleted();
    } catch (err) {
      toast.error('Failed to restore: ' + err.message);
    }
    setConfirmRestore(null);
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    try {
      await invoiceAPI.permanentDelete(confirmDelete.id);
      toast.success('Invoice permanently deleted!');
      fetchDeleted();
    } catch (err) {
      toast.error('Failed to delete: ' + err.message);
    }
    setConfirmDelete(null);
  };

  const filtered = invoices.filter((inv) => {
    const searchTerm = search.toLowerCase();
    return (
      !search ||
      inv.invoice_number?.toLowerCase().includes(searchTerm) ||
      (inv.client_name || inv.client_name_display || '').toLowerCase().includes(searchTerm)
    );
  });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div className="page-title">
          <h1>Recycle Bin</h1>
          <p>View and manage deleted invoices</p>
        </div>
      </div>

      <div className="search-bar-container">
        <div className="search-input-wrapper">
          <MdSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search deleted invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="search-results-count">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗑️</div>
          <h3>Recycle Bin is Empty</h3>
          <p>No deleted invoices found.</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  // clean up the -deleted part for display if needed
                  const displayNum = inv.invoice_number.replace(/-deleted-\d+$/, '');
                  return (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{displayNum}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                          {inv.client_name_display || inv.client_name || 'No Client'}
                        </div>
                      </td>
                      <td>{format(parseISO(inv.invoice_date), 'dd MMM yyyy')}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(inv.total)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn-icon"
                            onClick={() => setPreviewId(inv.id)}
                            title="Preview"
                          >
                            <MdVisibility />
                          </button>
                          <button
                            className="btn-icon"
                            style={{ color: 'var(--success)' }}
                            onClick={() => setConfirmRestore(inv)}
                            title="Restore"
                          >
                            <MdRestore />
                          </button>
                          <button
                            className="btn-icon delete"
                            onClick={() => setConfirmDelete(inv)}
                            title="Delete Permanently"
                          >
                            <MdDeleteForever />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm Restore Modal */}
      {confirmRestore && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Restore Invoice</h3>
              <button className="btn-icon" onClick={() => setConfirmRestore(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to restore invoice 
                <strong> {confirmRestore.invoice_number.replace(/-deleted-\d+$/, '')}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleRestore}>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Permanent Delete Modal */}
      {confirmDelete && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Delete Permanently</h3>
              <button className="btn-icon" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>
                This will permanently delete invoice 
                <strong> {confirmDelete.invoice_number.replace(/-deleted-\d+$/, '')}</strong>.
              </p>
              <div className="alert alert-danger" style={{ marginTop: 12 }}>
                ⚠️ This action cannot be undone.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handlePermanentDelete}>
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewId && (
        <InvoicePreview invoiceId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}

export default RecycleBin;
