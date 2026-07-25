import React, {
  createContext, useContext, useReducer, useCallback, useEffect
} from 'react';
import { toast } from 'react-toastify';
import { clientAPI, invoiceAPI, reportAPI, settingsAPI } from '../services/api';

// ============================================================
// CONTEXT
// ============================================================
const AppContext = createContext(null);

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};

// ============================================================
// INITIAL STATE
// ============================================================
const initialState = {
  clients:  [],
  invoices: [],
  stats:    null,
  settings: {
    company_name:  'Ankit Infotech And Solution',
    company_gstin: '08BHQPB3266F1ZB',
    company_email: 'ankitinfotechsolutions@gmail.com',
    invoice_prefix: 'INV',
    default_gst_rate: 18,
    default_due_days: 30,
    currency: 'INR',
  },
  loading: {
    clients:  false,
    invoices: false,
    stats:    false,
    settings: false,
    action:   false,
  },
  errors: {},
};

// ============================================================
// REDUCER
// ============================================================
function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: { ...state.loading, [action.key]: action.value } };
    case 'SET_ERROR':
      return { ...state, errors: { ...state.errors, [action.key]: action.value } };

    case 'SET_CLIENTS':   return { ...state, clients:  action.data };
    case 'ADD_CLIENT':    return { ...state, clients:  [action.data, ...state.clients] };
    case 'UPDATE_CLIENT': return { ...state, clients:  state.clients.map(c => c.id === action.data.id ? action.data : c) };
    case 'DELETE_CLIENT': return { ...state, clients:  state.clients.filter(c => c.id !== action.id) };

    case 'SET_INVOICES':  return { ...state, invoices: action.data };
    case 'ADD_INVOICE':   return { ...state, invoices: [action.data, ...state.invoices] };
    case 'UPDATE_INVOICE': return { ...state, invoices: state.invoices.map(i => i.id === action.data.id ? action.data : i) };
    case 'DELETE_INVOICE': return { ...state, invoices: state.invoices.filter(i => i.id !== action.id) };

    case 'SET_STATS':    return { ...state, stats:    action.data };
    case 'SET_SETTINGS': return { ...state, settings: { ...state.settings, ...action.data } };
    default:             return state;
  }
}

// ============================================================
// PROVIDER
// ============================================================
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Helper
  const setLoading = (key, val) => dispatch({ type: 'SET_LOADING', key, value: val });

  // ---- Clients ----
  const fetchClients = useCallback(async (params) => {
    setLoading('clients', true);
    try {
      const res = await clientAPI.getAll(params);
      dispatch({ type: 'SET_CLIENTS', data: res.data });
    } catch (err) {
      toast.error(`Failed to load clients: ${err.message}`);
    } finally {
      setLoading('clients', false);
    }
  }, []);

  const createClient = useCallback(async (data) => {
    setLoading('action', true);
    try {
      const res = await clientAPI.create(data);
      dispatch({ type: 'ADD_CLIENT', data: res.data });
      toast.success('✅ Client created successfully!');
      return res.data;
    } catch (err) {
      toast.error(`Failed to create client: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  const updateClient = useCallback(async (id, data) => {
    setLoading('action', true);
    try {
      const res = await clientAPI.update(id, data);
      dispatch({ type: 'UPDATE_CLIENT', data: res.data });
      toast.success('✅ Client updated!');
      return res.data;
    } catch (err) {
      toast.error(`Failed to update client: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  const deleteClient = useCallback(async (id) => {
    setLoading('action', true);
    try {
      await clientAPI.delete(id);
      dispatch({ type: 'DELETE_CLIENT', id });
      toast.success('🗑️ Client deleted');
    } catch (err) {
      toast.error(`Failed to delete client: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  // ---- Invoices ----
  const fetchInvoices = useCallback(async (params) => {
    setLoading('invoices', true);
    try {
      const res = await invoiceAPI.getAll(params);
      dispatch({ type: 'SET_INVOICES', data: res.data });
    } catch (err) {
      toast.error(`Failed to load invoices: ${err.message}`);
    } finally {
      setLoading('invoices', false);
    }
  }, []);

  const createInvoice = useCallback(async (data) => {
    setLoading('action', true);
    try {
      const res = await invoiceAPI.create(data);
      dispatch({ type: 'ADD_INVOICE', data: res.data });
      toast.success('✅ Invoice created!');
      return res.data;
    } catch (err) {
      toast.error(`Failed to create invoice: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  const updateInvoice = useCallback(async (id, data) => {
    setLoading('action', true);
    try {
      const res = await invoiceAPI.update(id, data);
      dispatch({ type: 'UPDATE_INVOICE', data: res.data });
      toast.success('✅ Invoice updated!');
      return res.data;
    } catch (err) {
      toast.error(`Failed to update invoice: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  const deleteInvoice = useCallback(async (id) => {
    setLoading('action', true);
    try {
      await invoiceAPI.delete(id);
      dispatch({ type: 'DELETE_INVOICE', id });
      toast.success('🗑️ Invoice deleted');
    } catch (err) {
      toast.error(`Failed to delete invoice: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []);

  const markInvoicePaid = useCallback(async (id, paymentData) => {
    setLoading('action', true);
    try {
      const res = await invoiceAPI.markPaid(id, paymentData);
      dispatch({ type: 'UPDATE_INVOICE', data: res.data });
      toast.success('💰 Invoice marked as paid!');
      fetchStats();
      return res.data;
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []); // eslint-disable-line

  const markInvoiceUnpaid = useCallback(async (id) => {
    setLoading('action', true);
    try {
      const res = await invoiceAPI.markUnpaid(id);
      dispatch({ type: 'UPDATE_INVOICE', data: res.data });
      toast.info('Invoice marked as unpaid');
      fetchStats();
      return res.data;
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
      throw err;
    } finally {
      setLoading('action', false);
    }
  }, []); // eslint-disable-line

  // ---- Stats ----
  const fetchStats = useCallback(async () => {
    setLoading('stats', true);
    try {
      const res = await reportAPI.dashboard();
      dispatch({ type: 'SET_STATS', data: res.data });
    } catch (err) {
      // Silent fail for stats
    } finally {
      setLoading('stats', false);
    }
  }, []);

  // ---- Settings ----
  const fetchSettings = useCallback(async () => {
    try {
      const res = await settingsAPI.get();
      dispatch({ type: 'SET_SETTINGS', data: res.data });
    } catch (err) {
      // Use defaults silently
    }
  }, []);

  const saveSettings = useCallback(async (data) => {
    setLoading('action', true);
    try {
      const res = await settingsAPI.update(data);
      dispatch({ type: 'SET_SETTINGS', data: res.data });
      toast.success('✅ Settings saved!');
      return res.data;
    } catch (err) {
      // If backend not connected, save locally
      dispatch({ type: 'SET_SETTINGS', data });
      toast.info('Settings saved locally (connect backend to persist)');
    } finally {
      setLoading('action', false);
    }
  }, []);

  // ---- Boot ----
  useEffect(() => {
    fetchClients();
    fetchInvoices();
    fetchStats();
    fetchSettings();
  }, []); // eslint-disable-line

  const value = {
    // State
    clients:  state.clients,
    invoices: state.invoices,
    stats:    state.stats,
    settings: state.settings,
    loading:  state.loading,
    errors:   state.errors,
    // Clients
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    // Invoices
    fetchInvoices,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markInvoicePaid,
    markInvoiceUnpaid,
    // Stats & Settings
    fetchStats,
    fetchSettings,
    saveSettings,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export default AppContext;
