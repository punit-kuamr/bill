import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  MdAdd, MdDelete, MdSave, MdArrowBack, MdCalculate,
  MdVisibility, MdNotes, MdRemove, MdShare, MdEmail,
  MdDownload, MdLink, MdCheck, MdClose
} from 'react-icons/md';
import { useAppContext } from '../context/AppContext';
import { invoiceAPI, emailAPI } from '../services/api';
import InvoicePreview from '../components/InvoicePreview';
import { toast } from 'react-toastify';
import { Country, State, City as CityLib } from 'country-state-city';

const GST_RATES  = [0, 5, 12, 18, 28];
const EMPTY_ITEM = { item_name: '', hsn_sac: '', description: '', quantity: 1, rate: '', gst_rate: 18 };



function CreateInvoice() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { id }    = useParams();
  const isEdit    = Boolean(id);
  const { clients, createInvoice, updateInvoice, createClient } = useAppContext();

  const savedId = isEdit ? id : null;

  const shareRef = useRef(null);

  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date:   new Date().toISOString().split('T')[0],
    due_date:       '',
    client_id:      '',
    client_name:    '',
    client_email:   '',
    client_phone:   '',
    client_address: '',
    client_gstin:   '',
    description:    '',
    notes:          '',
    discount:       0,
    extra_charges:  0,
    status:         'unpaid',
    // Ship To
    ship_same_as_bill: true,
    ship_to_name:    '',
    ship_to_address: '',
    ship_to_phone:   '',
    ship_to_gstin:   '',
    // Discount
    discount_percent: '',
    // Extra Charges
    extra_charges_label:  '',
    is_roundoff:          false,
  });
  const [items,   setItems]   = useState([{ ...EMPTY_ITEM }]);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Auto-sync Ship To when "Same as Bill To" is checked
  useEffect(() => {
    if (form.ship_same_as_bill) {
      setForm(f => ({
        ...f,
        ship_to_name:    f.client_name,
        ship_to_address: f.client_address,
        ship_to_phone:   f.client_phone,
        ship_to_gstin:   f.client_gstin,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ship_same_as_bill, form.client_name, form.client_address, form.client_phone, form.client_gstin]);

  // Load next invoice number
  useEffect(() => {
    if (!isEdit) {
      invoiceAPI.nextNumber()
        .then(r => setForm(f => ({ ...f, invoice_number: r.data.invoice_number })))
        .catch(() => setForm(f => ({ ...f, invoice_number: `INV-${new Date().getFullYear()}-0001` })));
    }
  }, [isEdit]);

  // Load invoice for editing
  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      invoiceAPI.getById(id)
        .then(r => {
          const inv = r.data;
          setForm({
            invoice_number: inv.invoice_number || '',
            invoice_date:   inv.invoice_date?.split('T')[0] || '',
            due_date:       inv.due_date?.split('T')[0] || '',
            client_id:      inv.client_id || '',
            client_name:    inv.client_name || '',
            client_email:   inv.client_email || '',
            client_phone:   inv.client_phone || '',
            client_address: inv.client_address || '',
            client_gstin:   inv.client_gstin || '',
            description:    inv.description || '',
            notes:          inv.notes || '',
            discount:       inv.discount || 0,
            extra_charges:  inv.extra_charges || 0,
            status:         inv.status || 'unpaid',
          });
          setItems(inv.items?.length ? inv.items.map(i => ({
            item_name:   i.item_name,
            hsn_sac:     i.hsn_sac || '',
            description: i.description || '',
            quantity:    i.quantity,
            rate:        i.rate,
            gst_rate:    i.gst_rate,
          })) : [{ ...EMPTY_ITEM }]);
        })
        .catch(() => navigate('/invoices'))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit, navigate]);

  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = React.useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // When client selected, auto-fill fields
  const handleClientSelect = (cid) => {
    setClientDropdownOpen(false);
    const client = clients.find(c => String(c.id) === String(cid));
    if (client) {
      const addressParts = [
        client.address_line1,
        client.address_line2,
        client.district,
        [client.city, client.state, client.pincode].filter(Boolean).join(' '),
        client.country
      ].filter(Boolean);
      
      let fullAddress = addressParts.join('\n');
      if (!fullAddress) fullAddress = client.address || '';
      
      if (client.pan) {
        fullAddress += (fullAddress ? '\n' : '') + `PAN: ${client.pan}`;
      }

      setForm(f => ({
        ...f,
        client_id:      client.id,
        client_name:    client.name    || '',
        client_email:   client.email   || '',
        client_phone:   client.phone   || '',
        client_address: fullAddress,
        client_gstin:   client.gstin   || '',
      }));
    } else {
      setForm(f => ({ ...f, client_id: '', client_name: '', client_email: '', client_phone: '', client_address: '', client_gstin: '' }));
    }
  };

  useEffect(() => {
    if (location.state?.clientId && clients.length > 0 && !form.client_id && !isEdit) {
      handleClientSelect(location.state.clientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.clientId, clients]);

  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const initialNewClientForm = {
    name: '', email: '', phone: '', address_line1: '', address_line2: '', district: '',
    city: '', state: '', pincode: '', country: '', gstin: '', pan: '', notes: '', tags: '', client_type: 'Individual'
  };
  const [newClientForm, setNewClientForm] = useState(initialNewClientForm);
  const [addingClient, setAddingClient] = useState(false);

  // Cascading dropdown states for inline Add Client
  const [availableStates, setAvailableStates] = useState([]);
  const [availableCities, setAvailableCities] = useState([]);
  const [selectedCountryIso, setSelectedCountryIso] = useState('');

  // Update cascading states when newClientForm.country changes
  useEffect(() => {
    if (newClientForm.country) {
      const c = Country.getAllCountries().find(c => c.name === newClientForm.country);
      if (c) {
        setSelectedCountryIso(c.isoCode);
        setAvailableStates(State.getStatesOfCountry(c.isoCode));
      } else {
        setSelectedCountryIso('');
        setAvailableStates([]);
      }
    } else {
      setSelectedCountryIso('');
      setAvailableStates([]);
    }
  }, [newClientForm.country]);

  // Update cascading cities when newClientForm.state changes
  useEffect(() => {
    if (newClientForm.state && selectedCountryIso) {
      const s = State.getStatesOfCountry(selectedCountryIso).find(s => s.name === newClientForm.state);
      if (s) {
        setAvailableCities(CityLib.getCitiesOfState(selectedCountryIso, s.isoCode));
      } else {
        setAvailableCities([]);
      }
    } else {
      setAvailableCities([]);
    }
  }, [newClientForm.state, selectedCountryIso]);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientForm.name.trim()) return;
    setAddingClient(true);
    try {
      const res = await createClient(newClientForm);
      const newClient = res?.data || res;
      
      if (newClient && newClient.id) {
        setForm(f => ({
          ...f,
          client_id:      newClient.id,
          client_name:    newClient.name    || '',
          client_email:   newClient.email   || '',
          client_phone:   newClient.phone   || '',
          client_address: newClient.address || '',
          client_gstin:   newClient.gstin   || '',
        }));
      } else {
        // Fallback: fill name anyway
        setForm(f => ({ ...f, client_name: newClientForm.name, client_email: newClientForm.email, client_phone: newClientForm.phone, client_address: newClientForm.address, client_gstin: newClientForm.gstin }));
      }
      setShowAddClientModal(false);
      setNewClientForm(initialNewClientForm);
      toast.success('Client added successfully!');
    } catch (err) {
      toast.error('Failed to add client');
    }
    setAddingClient(false);
  };



  // Items handlers — descOpen tracks which rows have description expanded
  const [descOpen, setDescOpen] = useState([false]);

  const addItem = () => {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
    setDescOpen(prev => [...prev, false]);
  };

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setDescOpen(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleDesc = (idx) =>
    setDescOpen(prev => prev.map((v, i) => i === idx ? !v : v));

  const updateItem = (idx, field, value) => setItems(prev =>
    prev.map((item, i) => {
      if (i === idx) {
        const newItem = { ...item, [field]: value };
        if (['quantity', 'rate', 'gst_rate'].includes(field)) {
          delete newItem.total_amount;
        }
        return newItem;
      }
      return item;
    })
  );

  // When loading existing invoice in edit mode, auto-open desc if item has description
  useEffect(() => {
    if (items.length > 0) {
      setDescOpen(items.map(item => !!(item.description && item.description.trim())));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once on mount

  // Totals — GST split equally into CGST + SGST
  const [showPreview, setShowPreview] = useState(false);

  const calcTotals = useCallback(() => {
    let subtotal = 0, cgst = 0, sgst = 0;
    items.forEach(item => {
      const qty      = parseFloat(item.quantity) || 0;
      const rate     = parseFloat(item.rate)     || 0;
      const gstR     = parseFloat(item.gst_rate) || 0;
      const amt      = qty * rate;
      const cgstAmt  = amt * (gstR / 2) / 100;
      const sgstAmt  = amt * (gstR / 2) / 100;
      subtotal += amt;
      cgst     += cgstAmt;
      sgst     += sgstAmt;
    });
    const gst   = cgst + sgst;
    let total = subtotal + gst - parseFloat(form.discount || 0) + parseFloat(form.extra_charges || 0);
    let roundoff = 0;
    if (form.is_roundup) {
      const rounded = Math.ceil(total);
      roundoff = rounded - total;
      total = rounded;
    } else if (form.is_roundoff) {
      const rounded = Math.round(total);
      roundoff = rounded - total;
      total = rounded;
    }
    return { subtotal, cgst, sgst, gst, roundoff, total };
  }, [items, form.discount, form.extra_charges, form.is_roundoff, form.is_roundup]);

  const { subtotal, cgst, sgst, roundoff, total } = calcTotals();

  // Share dropdown state
  const [shareOpen,  setShareOpen]  = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareStep,  setShareStep]  = useState('menu'); // 'menu' | 'email'
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  // Close share dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (shareRef.current && !shareRef.current.contains(e.target)) {
        setShareOpen(false); setShareStep('menu');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSaveInvoice = async (e) => {
    if (e) e.preventDefault();
    if (!items.some(i => i.item_name.trim())) {
      toast.error('Add at least one item to save the invoice.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        items: items.filter(i => i.item_name.trim()),
        discount:      parseFloat(form.discount)      || 0,
        extra_charges: parseFloat(form.extra_charges) || 0,
      };
      if (isEdit) {
        await updateInvoice(id, payload);
        toast.success('✅ Invoice saved successfully!');
      } else {
        const res = await createInvoice(payload);
        // After first save — redirect to edit URL so Preview & Share activate
        const newId = res?.data?.id || res?.id;
        if (newId) {
          toast.success('✅ Invoice created! Preview & Share are now active.');
          navigate(`/invoices/edit/${newId}`, { replace: true });
        } else {
          toast.success('✅ Invoice created!');
          navigate('/invoices');
        }
      }
    } catch (err) {
      toast.error('Failed to save invoice. Check your connection.');
    }
    setSaving(false);
  };

  const handleCopyLink = () => {
    const activeId = id || savedId;
    const url = `${window.location.origin}/invoices/edit/${activeId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  };

  const handleShareEmail = async (e) => {
    e.preventDefault();
    if (!shareEmail) return;
    setEmailSending(true);
    const activeId = id || savedId;
    try {
      await emailAPI.sendInvoice({ invoice_id: activeId, recipient_email: shareEmail });
      toast.success(`📧 Invoice sent to ${shareEmail}`);
      setShareEmail('');
      setShareStep('menu');
      setShareOpen(false);
    } catch {
      toast.error('Email failed. Check SendGrid config in .env');
    }
    setEmailSending(false);
  };

  const handleDownloadPDF = () => {
    const activeId = id || savedId;
    const url = invoiceAPI.downloadPDF(activeId);
    window.open(url, '_blank');
  };

  if (loading) return <div className="loading-spinner" style={{ marginTop: '80px' }}><div className="spinner" /></div>;

  const activeId   = id || savedId;
  const canPreview = true; // always allow preview — uses live form data when unsaved

  // Build live preview data from current form state (used when invoice not yet saved)
  const liveInvoiceData = !activeId ? {
    ...form,
    items,
    status: 'draft',
    ship_to_name:    form.ship_same_as_bill ? form.client_name    : form.ship_to_name,
    ship_to_address: form.ship_same_as_bill ? form.client_address : form.ship_to_address,
    ship_to_phone:   form.ship_same_as_bill ? form.client_phone   : form.ship_to_phone,
    ship_to_gstin:   form.ship_same_as_bill ? form.client_gstin   : form.ship_to_gstin,
    discount:        parseFloat(form.discount)      || 0,
    extra_charges:   parseFloat(form.extra_charges) || 0,
  } : null;

  return (
    <div className="page-wrapper">
      {/* ── Action Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '28px', flexWrap: 'wrap', gap: '14px',
      }}>
        {/* Left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/invoices')} style={{ gap: '6px' }}>
            <MdArrowBack /> Back
          </button>
          <div>
            <h1 className="page-title">
              {isEdit ? `Edit — ${form.invoice_number}` : 'New Invoice'}
            </h1>
            <p className="page-subtitle">
              {isEdit ? 'Update and save your changes' : 'Fill in the details then hit Save Invoice'}
            </p>
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

          <button
            type="button"
            onClick={() => { window.location.href = '/invoices/new'; }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '9px 18px', borderRadius: 'var(--radius)',
              border: '1.5px solid var(--border)', fontFamily: 'Inter, sans-serif',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              background: 'white', color: 'var(--text)',
              transition: 'all 0.18s ease',
            }}
          >
            <MdAdd style={{ fontSize: '16px' }} />
            New Invoice
          </button>

          {/* ── SHARE ── */}
          <div style={{ position: 'relative' }} ref={shareRef}>
            <button
              type="button"
              onClick={() => { if (canPreview) { setShareOpen(s => !s); setShareStep('menu'); } }}
              disabled={!canPreview}
              title={canPreview ? 'Share invoice' : 'Save invoice first to enable sharing'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                padding: '9px 18px', borderRadius: 'var(--radius)',
                border: '1.5px solid var(--border)', fontFamily: 'Inter, sans-serif',
                fontSize: '13px', fontWeight: 600, cursor: canPreview ? 'pointer' : 'not-allowed',
                background: canPreview ? 'white' : 'var(--bg-surface)',
                color: canPreview ? 'var(--text)' : 'var(--text-light)',
                transition: 'all 0.18s ease',
                boxShadow: canPreview ? 'var(--shadow-xs)' : 'none',
              }}
            >
              <MdShare style={{ fontSize: '16px' }} />
              Share
              {!canPreview && (
                <span style={{
                  fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                  background: 'var(--warning-light)', color: 'var(--warning)',
                  fontWeight: 700, letterSpacing: '0.3px',
                }}>SAVE FIRST</span>
              )}
            </button>

            {/* Share dropdown */}
            {shareOpen && canPreview && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: 'white', border: '1.5px solid var(--border)',
                borderRadius: '14px', boxShadow: 'var(--shadow-md)',
                zIndex: 300, minWidth: '240px', overflow: 'hidden',
                animation: 'slideUp 0.15s ease',
              }}>
                {shareStep === 'menu' ? (
                  <>
                    <div style={{ padding: '12px 16px 8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-light)', borderBottom: '1px solid var(--border)' }}>
                      Share Invoice
                    </div>
                    {[
                      { icon: <MdEmail />, label: 'Send via Email',      action: () => setShareStep('email'), color: 'var(--primary)' },
                      { icon: <MdDownload />, label: 'Download PDF',     action: handleDownloadPDF,            color: 'var(--success)' },
                      { icon: linkCopied ? <MdCheck /> : <MdLink />, label: linkCopied ? 'Link Copied!' : 'Copy Invoice Link', action: handleCopyLink, color: linkCopied ? 'var(--success)' : 'var(--text-muted)' },
                    ].map((item, i) => (
                      <button key={i} type="button"
                        onClick={item.action}
                        style={{
                          width: '100%', padding: '11px 16px', border: 'none',
                          background: 'transparent', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '11px',
                          fontSize: '13px', fontWeight: 500, color: 'var(--text)',
                          fontFamily: 'Inter, sans-serif', textAlign: 'left',
                          borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ color: item.color, fontSize: '18px' }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </>
                ) : (
                  // Email step
                  <form onSubmit={handleShareEmail} style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <button type="button" onClick={() => setShareStep('menu')}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', padding: 0 }}>
                        <MdArrowBack />
                      </button>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Send via Email</span>
                    </div>
                    <input
                      type="email" required autoFocus
                      value={shareEmail}
                      onChange={e => setShareEmail(e.target.value)}
                      placeholder="client@example.com"
                      style={{
                        width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)',
                        borderRadius: 'var(--radius)', fontSize: '13px', fontFamily: 'Inter',
                        marginBottom: '10px', outline: 'none', color: 'var(--text)',
                      }}
                    />
                    <button type="submit" disabled={emailSending}
                      style={{
                        width: '100%', padding: '9px', border: 'none',
                        background: 'var(--primary)', color: 'white', borderRadius: 'var(--radius)',
                        fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
                      }}>
                      {emailSending ? 'Sending…' : '📤 Send Invoice'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* ── PREVIEW ── */}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            title="Preview invoice"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '9px 18px', borderRadius: 'var(--radius)',
              border: '1.5px solid var(--primary)',
              fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              transition: 'all 0.18s ease',
            }}
          >
            <MdVisibility style={{ fontSize: '16px' }} />
            Preview
          </button>

          {/* ── SAVE INVOICE ── */}
          <button
            type="button"
            onClick={handleSaveInvoice}
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '9px 22px', borderRadius: 'var(--radius)',
              border: 'none', fontFamily: 'Inter, sans-serif',
              fontSize: '13px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              background: saving ? 'var(--text-light)' : 'var(--primary)',
              color: 'white', transition: 'all 0.18s ease',
              boxShadow: saving ? 'none' : '0 4px 14px rgba(26,71,49,0.3)',
            }}
          >
            <MdSave style={{ fontSize: '16px' }} />
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Invoice'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveInvoice}>
        {/* Invoice Info */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">📋 Invoice Details</span>
          </div>
          <div className="section-card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Invoice Number <span className="required">*</span></label>
                <input className="form-control" value={form.invoice_number}
                  onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Date <span className="required">*</span></label>
                <input className="form-control" type="date" value={form.invoice_date}
                  onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input className="form-control" type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status</label>
                <select className="form-control" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description / Work Type</label>
                <input className="form-control" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Website development project" />
              </div>
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">👤 Bill To (Client)</span>
          </div>
          <div className="section-card-body">
            <div className="form-group" ref={clientDropdownRef} style={{ position: 'relative' }}>
              <label className="form-label">Select Existing Client</label>
              <div 
                className="form-control" 
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
              >
                {form.client_id ? clients.find(c => String(c.id) === String(form.client_id))?.name || 'Unknown Client' : '— Select a client or fill manually —'}
                <span style={{ fontSize: '12px' }}>▼</span>
              </div>
              {clientDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, 
                  background: 'white', border: '1.5px solid var(--border)', 
                  borderRadius: 'var(--radius)', zIndex: 10, marginTop: '4px',
                  boxShadow: 'var(--shadow-md)', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column'
                }}>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <div 
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13.5px' }}
                      onClick={() => handleClientSelect('')}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      — Clear Selection —
                    </div>
                    {clients.map(c => (
                      <div 
                        key={c.id} 
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13.5px' }}
                        onClick={() => handleClientSelect(c.id)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                  <div 
                    style={{ padding: '10px 14px', background: 'var(--primary-light)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13.5px' }}
                    onClick={() => { setClientDropdownOpen(false); window.open('/clients/new', '_blank'); }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e6f0ff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                  >
                    <MdAdd /> Add New Client
                  </div>
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Client Name <span className="required">*</span></label>
                <input className="form-control" value={form.client_name}
                  onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                  placeholder="ABC Corporation" required />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input className="form-control" value={form.client_gstin}
                  onChange={e => setForm(f => ({ ...f, client_gstin: e.target.value.toUpperCase() }))}
                  placeholder="07AABCU9603R1Z0" maxLength={15} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-control" type="email" value={form.client_email}
                  onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                  placeholder="contact@abc.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.client_phone}
                  onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
                  placeholder="+91-9876543210" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Address</label>
              <textarea className="form-control" value={form.client_address}
                onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))}
                placeholder="Full billing address..." rows={2} />
            </div>
          </div>
        </div>

        {/* Ship To */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">🚚 Ship To</span>
            {/* Same as Bill To toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={form.ship_same_as_bill}
                onChange={e => setForm(f => ({ ...f, ship_same_as_bill: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              Same as Bill To
            </label>
          </div>

          {form.ship_same_as_bill ? (
            /* Summary when same */
            <div style={{ padding: '14px 22px', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  {form.client_name || 'Client Name'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {form.client_address || 'Same address as billing'}
                </div>
              </div>
            </div>
          ) : (
            /* Manual fields when different */
            <div className="section-card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Recipient Name <span className="required">*</span></label>
                  <input className="form-control" value={form.ship_to_name}
                    onChange={e => setForm(f => ({ ...f, ship_to_name: e.target.value }))}
                    placeholder="Warehouse / Branch Name" />
                </div>
                <div className="form-group">
                  <label className="form-label">GSTIN</label>
                  <input className="form-control" value={form.ship_to_gstin}
                    onChange={e => setForm(f => ({ ...f, ship_to_gstin: e.target.value.toUpperCase() }))}
                    placeholder="Ship-to GSTIN" maxLength={15} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.ship_to_phone}
                  onChange={e => setForm(f => ({ ...f, ship_to_phone: e.target.value }))}
                  placeholder="+91-XXXXXXXXXX" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Shipping Address <span className="required">*</span></label>
                <textarea className="form-control" value={form.ship_to_address}
                  onChange={e => setForm(f => ({ ...f, ship_to_address: e.target.value }))}
                  placeholder="Full shipping/delivery address..." rows={3} />
              </div>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title"><MdCalculate /> Line Items</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>
              <MdAdd /> Add Item
            </button>
          </div>
          <div className="section-card-body" style={{ padding: 0 }}>
            <div className="items-table">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: '24%', textAlign: 'left' }}>Item / Service</th>
                    <th style={{ width: '10%', textAlign: 'left' }}>HSN/SAC</th>
                    <th style={{ width: '8%' }}>Qty</th>
                    <th style={{ width: '13%' }}>Rate (₹)</th>
                    <th style={{ width: '9%' }}>GST %</th>
                    <th style={{ width: '11%' }}>CGST</th>
                    <th style={{ width: '11%' }}>SGST</th>
                    <th style={{ width: '9%' }}>Total</th>
                    <th style={{ width: '5%' }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const qty      = parseFloat(item.quantity) || 0;
                    const rate     = parseFloat(item.rate)     || 0;
                    const gstR     = parseFloat(item.gst_rate) || 0;
                    const amt      = qty * rate;
                    const cgstAmt  = amt * (gstR / 2) / 100;
                    const sgstAmt  = amt * (gstR / 2) / 100;
                    const isDescOpen = descOpen[idx] || !!(item.description && item.description.trim());
                    return (
                      <tr key={idx} style={{ verticalAlign: 'top' }}>
                        <td style={{ padding: '8px 10px' }}>
                          {/* Item name + description toggle */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: isDescOpen ? '6px' : 0 }}>
                            <input
                              value={item.item_name}
                              placeholder="Web Development…"
                              onChange={e => updateItem(idx, 'item_name', e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              title={isDescOpen ? 'Hide description' : 'Add description'}
                              onClick={() => toggleDesc(idx)}
                              style={{
                                width: '22px', height: '22px', flexShrink: 0,
                                border: '1.5px solid var(--border)',
                                borderRadius: '5px', background: isDescOpen ? 'var(--primary-light)' : 'white',
                                color: isDescOpen ? 'var(--primary)' : 'var(--text-light)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '13px', transition: 'all 0.15s ease', padding: 0,
                              }}
                            >
                              {isDescOpen ? <MdRemove /> : <MdNotes />}
                            </button>
                          </div>
                          {isDescOpen && (
                            <textarea
                              value={item.description || ''}
                              placeholder="Optional description (appears below item name on invoice)…"
                              onChange={e => updateItem(idx, 'description', e.target.value)}
                              rows={2}
                              style={{
                                width: '100%', padding: '5px 8px',
                                border: '1.5px dashed var(--border)',
                                borderRadius: '5px', fontSize: '11.5px',
                                fontFamily: 'Inter, sans-serif',
                                color: 'var(--text-muted)', background: '#faf8f4',
                                resize: 'vertical', outline: 'none',
                                lineHeight: 1.4, minHeight: '46px',
                              }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', verticalAlign: 'top', paddingTop: '12px' }}>
                          <input type="text" value={item.hsn_sac || ''} placeholder="HSN/SAC"
                            onChange={e => updateItem(idx, 'hsn_sac', e.target.value)} />
                        </td>
                        <td style={{ padding: '8px 10px', verticalAlign: 'top', paddingTop: '12px' }}>
                          <input type="number" min="0" step="0.01" value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                          <input type="number" min="0" step="0.01" value={item.rate} placeholder="0.00"
                            onChange={e => updateItem(idx, 'rate', e.target.value)} />
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: '12px' }}>
                          <select value={item.gst_rate} onChange={e => updateItem(idx, 'gst_rate', e.target.value)}>
                            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'top', paddingTop: '14px' }}>
                          ₹{cgstAmt.toFixed(2)}
                          <div style={{ fontSize: '10px', color: 'var(--text-light)' }}>{gstR / 2}%</div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', verticalAlign: 'top', paddingTop: '14px' }}>
                          ₹{sgstAmt.toFixed(2)}
                          <div style={{ fontSize: '10px', color: 'var(--text-light)' }}>{gstR / 2}%</div>
                        </td>
                        <td style={{ padding: '8px 10px', verticalAlign: 'top', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px' }}>₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.total_amount !== undefined ? item.total_amount : (amt + cgstAmt + sgstAmt).toFixed(2)}
                              onChange={(e) => {
                                const newTotal = e.target.value;
                                const totalVal = parseFloat(newTotal) || 0;
                                const qty = parseFloat(item.quantity) || 1;
                                const gstR = parseFloat(item.gst_rate) || 0;
                                const newRate = qty > 0 ? (totalVal / (qty * (1 + gstR / 100))).toFixed(4) : 0;
                                setItems(prev => prev.map((it, i) => i === idx ? { ...it, rate: newRate, total_amount: newTotal } : it));
                              }}
                              onBlur={(e) => {
                                setItems(prev => prev.map((it, i) => {
                                  if (i === idx) {
                                    const { total_amount, ...rest } = it;
                                    return rest;
                                  }
                                  return it;
                                }));
                              }}
                              style={{ 
                                width: '100%', 
                                padding: '6px',
                                border: '1px solid var(--border)', 
                                borderRadius: '4px',
                                fontSize: '13px',
                                fontWeight: 700,
                                outline: 'none',
                                background: 'transparent'
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'top', paddingTop: '12px' }}>
                          {items.length > 1 && (
                            <button type="button" className="btn-icon danger" onClick={() => removeItem(idx)}
                              style={{ width: '26px', height: '26px', fontSize: '13px' }}>
                              <MdDelete />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addItem}>
                <MdAdd /> Add Another Item
              </button>
            </div>
          </div>
        </div>

      {/* Add Client Modal Inline */}
      {showAddClientModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddClientModal(false)} style={{ zIndex: 1000 }}>
          <div className="modal" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <span className="modal-title">Add New Client</span>
              <button className="modal-close" onClick={() => setShowAddClientModal(false)}><MdClose /></button>
            </div>
            <div className="modal-form-container">
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Contact Details</h4>
                
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label className="form-label">Client/Business Name <span className="required">*</span></label>
                    <input className="form-control" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} placeholder="ABC Corporation" required />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Client Type</label>
                    <select className="form-control" value={newClientForm.client_type} onChange={e => setNewClientForm(f => ({ ...f, client_type: e.target.value }))}>
                      <option value="Business">Business</option>
                      <option value="Individual">Individual</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@abc.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-control" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91-9876543210" />
                  </div>
                </div>

                <h4 style={{ margin: '15px 0 10px 0', fontSize: '14px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Billing Address</h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Address Line 1</label>
                    <input className="form-control" value={newClientForm.address_line1} onChange={e => setNewClientForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Flat/House No, Building, Street..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address Line 2 <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
                    <input className="form-control" value={newClientForm.address_line2} onChange={e => setNewClientForm(f => ({ ...f, address_line2: e.target.value }))} placeholder="Area, Landmark..." />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <select className="form-control" value={newClientForm.country} onChange={e => setNewClientForm(f => ({ ...f, country: e.target.value, state: '', city: '' }))}>
                      <option value="">-- Select Country --</option>
                      {Country.getAllCountries().map(c => (
                        <option key={c.isoCode} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <select className="form-control" value={newClientForm.state} onChange={e => setNewClientForm(f => ({ ...f, state: e.target.value, city: '' }))} disabled={!newClientForm.country}>
                      <option value="">-- Select State --</option>
                      {availableStates.map(s => (
                        <option key={s.isoCode} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">District <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
                    <input className="form-control" value={newClientForm.district} onChange={e => setNewClientForm(f => ({ ...f, district: e.target.value }))} placeholder="District" disabled={!newClientForm.state && newClientForm.country} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <select className="form-control" value={newClientForm.city} onChange={e => setNewClientForm(f => ({ ...f, city: e.target.value }))} disabled={!newClientForm.state}>
                      <option value="">-- Select City --</option>
                      {availableCities.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Pincode / ZIP</label>
                    <input className="form-control" value={newClientForm.pincode} onChange={e => setNewClientForm(f => ({ ...f, pincode: e.target.value }))} placeholder="400001" />
                  </div>
                  <div className="form-group">
                  </div>
                </div>

                <h4 style={{ margin: '15px 0 10px 0', fontSize: '14px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '5px' }}>Tax & Business Info</h4>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">GSTIN</label>
                    <input className="form-control" value={newClientForm.gstin} onChange={e => setNewClientForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">PAN <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
                    <input className="form-control" value={newClientForm.pan} onChange={e => setNewClientForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} />
                  </div>
                </div>



              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddClientModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={addingClient || !newClientForm.name.trim()} onClick={handleCreateClient}>
                  {addingClient ? 'Adding...' : 'Add Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Paid Modal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'start' }}>
          {/* Notes & Adjustments */}
          <div className="section-card">
            <div className="section-card-header">
              <span className="section-card-title">📝 Notes & Adjustments</span>
            </div>
            <div className="section-card-body">
              
              {/* ── DISCOUNT ── */}
              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                  🏷️ Discount
                  {subtotal > 0 && parseFloat(form.discount) > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>
                      (saves ₹{parseFloat(form.discount).toFixed(2)})
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* % field */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      className="form-control"
                      type="number" min="0" max="100" step="0.01"
                      value={form.discount_percent}
                      placeholder="0"
                      onChange={e => {
                        const pct = e.target.value;
                        const amt = pct !== '' && subtotal > 0
                          ? ((parseFloat(pct) || 0) * subtotal / 100).toFixed(2)
                          : 0;
                        setForm(f => ({ ...f, discount_percent: pct, discount: pct !== '' ? amt : 0 }));
                      }}
                      style={{ paddingRight: '30px' }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none' }}>%</span>
                  </div>

                  <span style={{ color: 'var(--text-light)', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>or</span>

                  {/* ₹ Amount field */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                    <input
                      className="form-control"
                      type="number" min="0" step="0.01"
                      value={form.discount}
                      placeholder="0.00"
                      onChange={e => {
                        const amt = e.target.value;
                        const pct = amt !== '' && subtotal > 0
                          ? ((parseFloat(amt) || 0) / subtotal * 100).toFixed(2)
                          : '';
                        setForm(f => ({ ...f, discount: amt, discount_percent: amt !== '' ? pct : '' }));
                      }}
                      style={{ paddingLeft: '24px' }}
                    />
                  </div>
                </div>
                {subtotal > 0 && form.discount_percent && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                    {form.discount_percent}% of subtotal ₹{subtotal.toFixed(2)} = <strong>₹{parseFloat(form.discount).toFixed(2)}</strong>
                  </p>
                )}
              </div>

              {/* ── EXTRA CHARGES ── */}
              <div className="form-row" style={{ marginBottom: '18px' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">➕ Extra Charges Label</label>
                  <input
                    className="form-control"
                    value={form.extra_charges_label}
                    onChange={e => setForm(f => ({ ...f, extra_charges_label: e.target.value }))}
                    placeholder="e.g. Courier Charges, Service Fee, Travel…"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Amount (₹)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                    <input
                      className="form-control"
                      type="number" min="0" step="0.01"
                      value={form.extra_charges}
                      onChange={e => setForm(f => ({ ...f, extra_charges: e.target.value }))}
                      placeholder="0.00"
                      style={{ paddingLeft: '24px' }}
                    />
                  </div>
                </div>
              </div>

              {/* ── NOTES ── */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes (for client)</label>
                <textarea className="form-control" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Payment terms, bank details, thank you note..." rows={3} />
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="totals-box" style={{ minWidth: '310px' }}>
            <div className="total-row">
              <span className="label">Subtotal</span>
              <span className="value">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="total-row" style={{ borderBottom: 'none', paddingBottom: '2px' }}>
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>CGST</span>
                CGST
              </span>
              <span className="value">₹{cgst.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#6366f1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>SGST</span>
                SGST
              </span>
              <span className="value">₹{sgst.toFixed(2)}</span>
            </div>
            {parseFloat(form.discount) > 0 && (
              <div className="total-row" style={{ color: 'var(--success)' }}>
                <span className="label">
                  Discount
                  {form.discount_percent
                    ? ` (${parseFloat(form.discount_percent).toFixed(1)}%)`
                    : ''} (−)
                </span>
                <span className="value">−₹{parseFloat(form.discount).toFixed(2)}</span>
              </div>
            )}
            {parseFloat(form.extra_charges) > 0 && (
              <div className="total-row">
                <span className="label">{form.extra_charges_label || 'Extra Charges'}</span>
                <span className="value">+₹{parseFloat(form.extra_charges).toFixed(2)}</span>
              </div>
            )}
            {((form.is_roundoff || form.is_roundup) && roundoff !== 0) ? (
              <div className="total-row">
                <span className="label">Round Off</span>
                <span className="value">{roundoff > 0 ? '+' : ''}₹{roundoff.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="total-row grand-total">
              <span className="label">Grand Total</span>
              <span className="value">₹{total.toFixed(2)}</span>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rounding:</span>
              <select 
                style={{ fontSize: '12px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border)', outline: 'none' }}
                value={form.is_roundup ? 'up' : form.is_roundoff ? 'nearest' : 'none'}
                onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, is_roundoff: val === 'nearest', is_roundup: val === 'up' }));
                }}
              >
                <option value="none">None</option>
                <option value="nearest">Round Off (Nearest)</option>
                <option value="up">Round Up (Ceiling)</option>
              </select>
            </div>
            <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-light)', marginTop: '4px', paddingTop: '4px' }}>
              CGST ₹{cgst.toFixed(2)} + SGST ₹{sgst.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Bottom spacer */}
        <div style={{ paddingBottom: '40px' }} />
      </form>

      {/* Invoice Preview Modal */}
      {showPreview && (
        activeId
          ? <InvoicePreview invoiceId={activeId} onClose={() => setShowPreview(false)} />
          : <InvoicePreview invoiceData={liveInvoiceData} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

export default CreateInvoice;
