import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { MdArrowBack } from 'react-icons/md';
import { toast } from 'react-toastify';
import { Country, State, City } from 'country-state-city';

function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, createClient, updateClient } = useAppContext();
  
  const initialForm = {
    name: '', client_type: 'Individual', email: '', phone: '',
    address_line1: '', address_line2: '', district: '', city: '', state: '', pincode: '', country: '',
    gstin: '', pan: '', notes: '', tags: ''
  };
  
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const isEditing = !!id;

  const [availableStates, setAvailableStates] = useState([]);
  const [availableCities, setAvailableCities] = useState([]);
  const [selectedCountryIso, setSelectedCountryIso] = useState('');


  useEffect(() => {
    if (isEditing && clients.length > 0) {
      const client = clients.find(c => c.id === parseInt(id));
      if (client) {
        setForm({
          name: client.name || '', client_type: client.client_type || 'Individual',
          email: client.email || '', phone: client.phone || '',
          address_line1: client.address_line1 || '', address_line2: client.address_line2 || '',
          district: client.district || '',
          city: client.city || '', state: client.state || '',
          pincode: client.pincode || '', country: client.country || '',
          gstin: client.gstin || '', pan: client.pan || '',
          notes: client.notes || '', tags: client.tags || ''
        });
      } else {
        toast.error('Client not found');
        navigate('/clients');
      }
    }
  }, [id, clients, isEditing, navigate]);

  // Update cascading states when form.country changes
  useEffect(() => {
    if (form.country) {
      const c = Country.getAllCountries().find(c => c.name === form.country);
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
  }, [form.country]);

  // Update cascading cities when form.state changes
  useEffect(() => {
    if (form.state && selectedCountryIso) {
      const s = State.getStatesOfCountry(selectedCountryIso).find(s => s.name === form.state);
      if (s) {
        setAvailableCities(City.getCitiesOfState(selectedCountryIso, s.isoCode));
      } else {
        setAvailableCities([]);
      }
    } else {
      setAvailableCities([]);
    }
  }, [form.state, selectedCountryIso]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isEditing) {
        await updateClient(id, form);
        toast.success('Client updated successfully');
      } else {
        await createClient(form);
        toast.success('Client added successfully');
      }
      navigate('/clients');
    } catch (err) {
      toast.error(err.message || 'Failed to save client');
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/clients')} style={{ padding: '8px' }}>
            <MdArrowBack size={24} />
          </button>
          <div>
            <h1 className="page-title">{isEditing ? 'Edit Client' : 'Add New Client'}</h1>
            <p className="page-subtitle">{isEditing ? 'Update client details' : 'Enter details for your new client'}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: '30px' }}>
        <form onSubmit={handleSave}>
          
          <h4 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Contact Details</h4>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Client/Business Name <span className="required">*</span></label>
              <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ABC Corporation" required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Client Type</label>
              <select className="form-control" value={form.client_type} onChange={e => setForm(f => ({ ...f, client_type: e.target.value }))}>
                <option value="Business">Business</option>
                <option value="Individual">Individual</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-control" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@abc.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-control" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91-9876543210" />
            </div>
          </div>

          <h4 style={{ margin: '25px 0 15px 0', fontSize: '16px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Billing Address</h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Country</label>
              <select className="form-control" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value, state: '', city: '' }))}>
                <option value="">-- Select Country --</option>
                {Country.getAllCountries().map(c => (
                  <option key={c.isoCode} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <select className="form-control" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, city: '' }))} disabled={!form.country}>
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
              <input className="form-control" value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="District" disabled={!form.state && form.country} />
            </div>
            <div className="form-group">
              <label className="form-label">City</label>
              <select className="form-control" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} disabled={!form.state}>
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
              <input className="form-control" value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} placeholder="400001" />
            </div>
            <div className="form-group">
              <label className="form-label">Address Line 1</label>
              <input className="form-control" value={form.address_line1} onChange={e => setForm(f => ({ ...f, address_line1: e.target.value }))} placeholder="Flat/House No, Building, Street..." />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Address Line 2 <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
              <input className="form-control" value={form.address_line2} onChange={e => setForm(f => ({ ...f, address_line2: e.target.value }))} placeholder="Area, Landmark..." />
            </div>
            <div className="form-group">
            </div>
          </div>

          <h4 style={{ margin: '25px 0 15px 0', fontSize: '16px', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Tax & Business Info</h4>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">GSTIN</label>
              <input className="form-control" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </div>
            <div className="form-group">
              <label className="form-label">PAN <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
              <input className="form-control" value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} />
            </div>
          </div>



          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/clients')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  );
}

export default ClientForm;
