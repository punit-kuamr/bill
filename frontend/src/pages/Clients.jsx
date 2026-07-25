import React, { useState, useEffect } from 'react';
import { MdSearch, MdAdd, MdEdit, MdDelete, MdPerson, MdPhone, MdEmail, MdClose, MdReceipt } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

function Clients() {
  const { clients, loading, fetchClients, deleteClient } = useAppContext();
  const navigate = useNavigate();

  const [search, setSearch]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => { fetchClients(); }, []); // eslint-disable-line

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const openAdd = () => navigate('/clients/new');
  const openEdit = (client) => navigate(`/clients/edit/${client.id}`);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteClient(confirmDelete.id); } catch {}
    setConfirmDelete(null);
  };

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-subtitle">{clients.length} client{clients.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={() => navigate('/invoices/new')}>
            <MdReceipt /> Create Invoice
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <MdAdd /> Add Client
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="toolbar">
        <div className="search-box">
          <MdSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Client Grid */}
      {loading.clients ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <h3>{search ? 'No clients found' : 'No Clients Yet'}</h3>
          <p>{search ? `No clients matching "${search}"` : 'Add your first client to get started!'}</p>
          {!search && <button className="btn btn-primary" onClick={openAdd}><MdAdd /> Add First Client</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filtered.map(client => (
            <div key={client.id} className="card card-body" style={{ position: 'relative' }}>
              {/* Actions */}
              <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '6px' }}>
                <button className="btn-icon primary" title="Edit" onClick={() => openEdit(client)}><MdEdit /></button>
                <button className="btn-icon danger" title="Delete" onClick={() => setConfirmDelete(client)}><MdDelete /></button>
              </div>

              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, var(--primary), #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px', fontWeight: 700, color: 'white', flexShrink: 0
                }}>
                  {client.name?.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, paddingRight: '72px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, wordBreak: 'break-word' }}>{client.name}</h3>
                  {client.gstin && <span className="badge badge-primary" style={{ marginTop: '4px', fontSize: '10px', display: 'inline-block' }}>GST: {client.gstin}</span>}
                </div>
              </div>

              {/* Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {client.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <MdEmail style={{ flexShrink: 0, color: 'var(--primary)' }} />
                    <a href={`mailto:${client.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{client.email}</a>
                  </div>
                )}
                {client.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <MdPhone style={{ flexShrink: 0, color: 'var(--success)' }} />
                    {client.phone}
                  </div>
                )}
                {client.address && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <MdPerson style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-light)' }} />
                    <span>{client.address}</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <button 
                  className="btn btn-outline btn-sm" 
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate('/invoices/new', { state: { clientId: client.id } })}
                >
                  <MdReceipt /> Create Invoice
                </button>
              </div>
            </div>
          ))}
        </div>
      )}



      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <span className="modal-title">Delete Client</span>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}><MdClose /></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-danger">
                Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This action cannot be undone.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete Client</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Clients;
