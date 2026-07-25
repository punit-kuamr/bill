import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MdSave, MdBusiness, MdEmail, MdReceipt, MdInfo,
  MdAccountBalance, MdImage, MdDraw, MdDelete, MdUpload, MdCheck, MdStorage
} from "react-icons/md";
import QRCode from "qrcode";
import { useAppContext } from "../context/AppContext";
import { settingsAPI, setApiUrl, getApiUrl } from "../services/api";
import { toast } from "react-toastify";

/* ─── tiny image-upload card ─────────────────────────────── */
function ImageUploader({ label, hint, field, currentUrl, onUploaded, onRemoved, icon: Icon }) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please select an image file.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be under 2MB.");
    setUploading(true);
    try {
      const dataUrl = await readAsDataURL(file);
      const res = await settingsAPI.uploadImage(field, dataUrl);
      onUploaded(res.data.settings);
      toast.success(`${label} saved!`);
    } catch (err) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [field, label, onUploaded]);

  const handleFiles = (files) => processFile(files?.[0]);
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); };
  const handleRemove = async () => {
    try {
      await settingsAPI.removeImage(field);
      onRemoved(field);
      toast.success(`${label} removed.`);
    } catch (err) {
      toast.error(`Remove failed: ${err.message}`);
    }
  };

  return (
    <div style={uploaderCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon style={{ color: "var(--primary)", fontSize: 18 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{label}</span>
      </div>

      {currentUrl ? (
        <div style={previewBox}>
          <img
            src={currentUrl}
            alt={label}
            style={{
              maxHeight: field === "company_logo_url" ? 72 : 56,
              maxWidth: "100%",
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => inputRef.current.click()}
              style={smallBtn("#3b82f6")}
            >
              <MdUpload style={{ fontSize: 14 }} /> Replace
            </button>
            <button type="button" onClick={handleRemove} style={smallBtn("#ef4444")}>
              <MdDelete style={{ fontSize: 14 }} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            ...dropZone,
            borderColor: dragging ? "var(--primary)" : "var(--border)",
            background: dragging ? "rgba(99,102,241,0.05)" : "var(--bg-secondary)",
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
        >
          {uploading ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
              <div className="spinner" style={{ width: 24, height: 24, margin: "0 auto 6px" }} />
              <div style={{ fontSize: 12 }}>Uploading...</div>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
              <MdUpload style={{ fontSize: 26, marginBottom: 6, color: "var(--primary)" }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>Click or drag to upload</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>PNG, JPG, SVG &bull; max 2MB</div>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── main Settings component ────────────────────────────── */
function Settings() {
  const { settings, saveSettings, fetchSettings, loading } = useAppContext();
  const [form, setForm] = useState({
    company_name:         settings.company_name         || "",
    company_gstin:        settings.company_gstin        || "",
    company_address:      settings.company_address      || "",
    company_phone:        settings.company_phone        || "",
    company_email:        settings.company_email        || "",
    company_website:      settings.company_website      || "",
    invoice_prefix:       settings.invoice_prefix       || "INV",
    default_gst_rate:     settings.default_gst_rate     || 18,
    default_due_days:     settings.default_due_days     || 30,
    bank_name:            settings.bank_name            || "",
    bank_account_name:    settings.bank_account_name    || "",
    bank_account_number:  settings.bank_account_number  || "",
    bank_ifsc:            settings.bank_ifsc            || "",
    bank_branch:          settings.bank_branch          || "",
    upi_id:               settings.upi_id               || "",
    terms_and_conditions: settings.terms_and_conditions || "",
    additional_notes:     settings.additional_notes     || "",
    footer_message:       settings.footer_message       || "",
  });
  const [dbEnv, setDbEnv] = useState({
    DB_HOST: "",
    DB_PORT: "",
    DB_NAME: "",
    DB_USER: "",
    DB_PASSWORD: "",
    DB_SSL: "false",
    SENDGRID_API_KEY: "",
    SENDGRID_FROM_EMAIL: ""
  });
  const [frontendApiUrl, setFrontendApiUrl] = useState(getApiUrl());
  const [saved, setSaved]       = useState(false);
  const [qrPreview, setQrPreview] = useState(null);
  // Local copies of image URLs so UI updates immediately after upload
  const [logoUrl, setLogoUrl]         = useState(settings.company_logo_url || null);
  const [signatureUrl, setSignatureUrl] = useState(settings.signature_url   || null);

  useEffect(() => {
    // Fetch DB env variables on load
    settingsAPI.getEnv().then(res => setDbEnv(res.data)).catch(err => console.error(err));
  }, []);

  // Sync when context settings change (e.g. on initial load)
  useEffect(() => {
    setLogoUrl(settings.company_logo_url || null);
    setSignatureUrl(settings.signature_url || null);
    setForm(f => ({
      ...f,
      company_name:         settings.company_name         || f.company_name,
      company_gstin:        settings.company_gstin        || f.company_gstin,
      company_address:      settings.company_address      || f.company_address,
      company_phone:        settings.company_phone        || f.company_phone,
      company_email:        settings.company_email        || f.company_email,
      company_website:      settings.company_website      || f.company_website,
      invoice_prefix:       settings.invoice_prefix       || f.invoice_prefix,
      default_gst_rate:     settings.default_gst_rate     || f.default_gst_rate,
      default_due_days:     settings.default_due_days     || f.default_due_days,
      bank_name:            settings.bank_name            || f.bank_name,
      bank_account_name:    settings.bank_account_name    || f.bank_account_name,
      bank_account_number:  settings.bank_account_number  || f.bank_account_number,
      bank_ifsc:            settings.bank_ifsc            || f.bank_ifsc,
      bank_branch:          settings.bank_branch          || f.bank_branch,
      upi_id:               settings.upi_id               || f.upi_id,
      terms_and_conditions: settings.terms_and_conditions || f.terms_and_conditions,
      additional_notes:     settings.additional_notes     || f.additional_notes,
      footer_message:       settings.footer_message       || f.footer_message,
    }));
  }, [settings]);

  // QR preview whenever UPI ID changes
  useEffect(() => {
    if (!form.upi_id) { setQrPreview(null); return; }
    const upiUrl = `upi://pay?pa=${encodeURIComponent(form.upi_id)}&pn=${encodeURIComponent(form.company_name || "")}&cu=INR`;
    QRCode.toDataURL(upiUrl, { width: 100, margin: 1, color: { dark: "#1a2420", light: "#ffffff" } })
      .then(url => setQrPreview(url))
      .catch(() => setQrPreview(null));
  }, [form.upi_id, form.company_name]);

  const handleChange = (field) => (e) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setApiUrl(frontendApiUrl);
    await saveSettings(form);
    try {
      const res = await settingsAPI.updateEnv(dbEnv);
      if (res.data && res.data.message) {
        toast.success(res.data.message);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update database environment variables');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleDbChange = (field) => (e) =>
    setDbEnv(f => ({ ...f, [field]: e.target.value }));

  const handleImageUploaded = (updatedSettings) => {
    // Refresh settings from server response
    setLogoUrl(updatedSettings.company_logo_url || null);
    setSignatureUrl(updatedSettings.signature_url || null);
    fetchSettings();
  };

  const handleImageRemoved = (field) => {
    if (field === "company_logo_url") setLogoUrl(null);
    if (field === "signature_url")    setSignatureUrl(null);
    fetchSettings();
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your company and invoice preferences</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading.action}>
          {saved ? <MdCheck /> : <MdSave />}
          {loading.action ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>

      <form onSubmit={handleSave}>

        {/* ── BRANDING: Logo + Signature ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdImage style={{ color: "var(--primary)" }} /> Branding &amp; Signature
            </span>
          </div>
          <div className="section-card-body">
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              Upload your company logo and authorized signature. Both will appear on every invoice PDF exactly as shown here.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <ImageUploader
                label="Company Logo"
                hint="Appears at the top-left of every invoice. Use a transparent PNG for best results."
                field="company_logo_url"
                currentUrl={logoUrl}
                onUploaded={handleImageUploaded}
                onRemoved={handleImageRemoved}
                icon={MdImage}
              />
              <ImageUploader
                label="Authorized Signature"
                hint="Appears in the bottom-right Authorized Signatory box. Use a white/transparent background."
                field="signature_url"
                currentUrl={signatureUrl}
                onUploaded={handleImageUploaded}
                onRemoved={handleImageRemoved}
                icon={MdDraw}
              />
            </div>
          </div>
        </div>

        {/* ── Company Info ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdBusiness style={{ color: "var(--primary)" }} /> Company Information
            </span>
          </div>
          <div className="section-card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Company Name <span className="required">*</span></label>
                <input className="form-control" value={form.company_name} onChange={handleChange("company_name")}
                  placeholder="Ankit Infotech And Solution" required />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input className="form-control" value={form.company_gstin} onChange={handleChange("company_gstin")}
                  placeholder="08BHQPB3266F1ZB" maxLength={15}
                  style={{ textTransform: "uppercase", letterSpacing: "1px" }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea className="form-control" value={form.company_address} onChange={handleChange("company_address")}
                placeholder="Your full business address..." rows={2} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-control" value={form.company_phone} onChange={handleChange("company_phone")}
                  placeholder="+91-XXXXXXXXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Website</label>
                <input className="form-control" value={form.company_website} onChange={handleChange("company_website")}
                  placeholder="https://www.yourwebsite.com" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Email Config ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdEmail style={{ color: "var(--primary)" }} /> Email Configuration
            </span>
          </div>
          <div className="section-card-body">
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              <MdInfo />
              <span>
                Email sending requires a <strong>SendGrid API key</strong>. Setting these will update your backend <code>.env</code> file.
                Free tier allows 100 emails/day.
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">SendGrid API Key</label>
              <input className="form-control" type="password" value={dbEnv.SENDGRID_API_KEY} onChange={handleDbChange("SENDGRID_API_KEY")}
                placeholder="SG.xxxxxxxxxxxxxx" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">SendGrid From Email Address</label>
              <input className="form-control" type="email" value={dbEnv.SENDGRID_FROM_EMAIL} onChange={handleDbChange("SENDGRID_FROM_EMAIL")}
                placeholder="ankitinfotechsolutions@gmail.com" />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                This email must be verified in your SendGrid account as a Sender.
              </p>
            </div>
          </div>
        </div>

        {/* ── Frontend Configuration ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdInfo style={{ color: "var(--primary)" }} /> Frontend Configuration
            </span>
          </div>
          <div className="section-card-body">
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              <MdInfo />
              <span>
                If you have hosted your backend live (e.g. on Render), you can paste the live backend URL here so this frontend connects to it.
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Live Backend API URL</label>
              <input className="form-control" type="url" value={frontendApiUrl} onChange={(e) => setFrontendApiUrl(e.target.value)}
                placeholder="https://your-backend.onrender.com/api" />
            </div>
          </div>
        </div>

        {/* ── Database Configuration ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdStorage style={{ color: "var(--primary)" }} /> Database Configuration
            </span>
          </div>
          <div className="section-card-body">
            <div className="alert alert-warning" style={{ marginBottom: 20 }}>
              <MdInfo />
              <span>
                <strong>Warning:</strong> Modifying these variables will update the backend <code>.env</code> file and restart the database connection. Incorrect settings will bring the application down.
              </span>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Database Host</label>
                <input className="form-control" value={dbEnv.DB_HOST} onChange={handleDbChange("DB_HOST")} placeholder="localhost" />
              </div>
              <div className="form-group">
                <label className="form-label">Database Port</label>
                <input className="form-control" value={dbEnv.DB_PORT} onChange={handleDbChange("DB_PORT")} placeholder="5432" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Database Name</label>
                <input className="form-control" value={dbEnv.DB_NAME} onChange={handleDbChange("DB_NAME")} placeholder="postgres" />
              </div>
              <div className="form-group">
                <label className="form-label">Database User</label>
                <input className="form-control" value={dbEnv.DB_USER} onChange={handleDbChange("DB_USER")} placeholder="postgres" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Database Password</label>
                <input className="form-control" type="password" value={dbEnv.DB_PASSWORD} onChange={handleDbChange("DB_PASSWORD")} placeholder="••••••••" />
              </div>
              <div className="form-group">
                <label className="form-label">Enable SSL</label>
                <select className="form-control" value={dbEnv.DB_SSL} onChange={handleDbChange("DB_SSL")}>
                  <option value="false">False</option>
                  <option value="true">True</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bank Details ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdAccountBalance style={{ color: "var(--primary)" }} /> Bank Details for Payment
            </span>
          </div>
          <div className="section-card-body">
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
              These details appear at the bottom of every printed invoice so clients know where to transfer payment.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input className="form-control" value={form.bank_name} onChange={handleChange("bank_name")}
                  placeholder="State Bank of India" />
              </div>
              <div className="form-group">
                <label className="form-label">Account Holder Name</label>
                <input className="form-control" value={form.bank_account_name} onChange={handleChange("bank_account_name")}
                  placeholder="Ankit Infotech And Solution" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Account Number</label>
                <input className="form-control" value={form.bank_account_number} onChange={handleChange("bank_account_number")}
                  placeholder="XXXX XXXX XXXX" style={{ letterSpacing: "1px" }} />
              </div>
              <div className="form-group">
                <label className="form-label">IFSC Code</label>
                <input className="form-control" value={form.bank_ifsc} onChange={handleChange("bank_ifsc")}
                  placeholder="SBIN0001234" style={{ textTransform: "uppercase", letterSpacing: "1px" }} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Branch</label>
                <input className="form-control" value={form.bank_branch} onChange={handleChange("bank_branch")}
                  placeholder="Sanganer, Jaipur" />
              </div>
              <div className="form-group">
                <label className="form-label">
                  UPI ID <span style={{ color: "var(--text-light)", fontWeight: 400 }}>(optional)</span>
                </label>
                <input className="form-control" value={form.upi_id} onChange={handleChange("upi_id")}
                  placeholder="yourupi@bank" />
                {form.upi_id && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                    ✅ QR code will appear on invoices for instant UPI scan-to-pay.
                  </p>
                )}
              </div>
              {qrPreview && (
                <div className="form-group" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <label className="form-label" style={{ textAlign: "center" }}>QR Preview</label>
                  <img src={qrPreview} alt="UPI QR" style={{ width: 100, height: 100, borderRadius: 8, border: "2px solid var(--border)", boxShadow: "var(--shadow-sm)" }} />
                  <p style={{ fontSize: 10, color: "var(--text-light)", textAlign: "center", fontFamily: "monospace" }}>{form.upi_id}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Invoice Preferences ── */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              <MdReceipt style={{ color: "var(--primary)" }} /> Invoice Preferences
            </span>
          </div>
          <div className="section-card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Invoice Prefix</label>
                <input className="form-control" value={form.invoice_prefix} onChange={handleChange("invoice_prefix")}
                  placeholder="INV" maxLength={10} />
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  Format: <strong>{form.invoice_prefix || "INV"}-2024-0001</strong>
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Default GST Rate (%)</label>
                <select className="form-control" value={form.default_gst_rate} onChange={handleChange("default_gst_rate")}>
                  {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Default Due Days</label>
                <select className="form-control" value={form.default_due_days} onChange={handleChange("default_due_days")}>
                  {[7, 14, 15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 20 }}>
              <label className="form-label">Terms &amp; Conditions</label>
              <textarea className="form-control" value={form.terms_and_conditions} onChange={handleChange("terms_and_conditions")}
                placeholder={"1. Goods once sold will not be taken back.\n2. Payment is due within 30 days.\n3. Interest @ 18% p.a. on overdue payments."} rows={4} />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                These appear at the bottom of every invoice. Each line will be a numbered list item.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Footer Note / Additional Notes</label>
              <textarea className="form-control" value={form.additional_notes} onChange={handleChange("additional_notes")}
                placeholder="E.g., Thank you for your business!" rows={2} />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Displayed at the bottom-left of the invoice footer.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Bottom Footer Message</label>
              <textarea className="form-control" value={form.footer_message} onChange={handleChange("footer_message")}
                placeholder="This is a computer generated invoice" rows={1} />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Displayed at the very bottom center of the invoice.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingBottom: 32 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading.action}>
            {saved ? <MdCheck /> : <MdSave />}
            {loading.action ? "Saving..." : "Save All Settings"}
          </button>
        </div>

      </form>
    </div>
  );
}

/* ─── inline styles ─────────────────────────────────────── */
const uploaderCard = {
  flex: "1 1 260px",
  minWidth: 240,
  maxWidth: 340,
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "18px 18px 14px",
  background: "var(--bg)",
  boxShadow: "var(--shadow-sm)",
};

const previewBox = {
  background: "var(--bg-secondary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "14px 10px 10px",
  minHeight: 90,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const dropZone = {
  border: "2px dashed",
  borderRadius: 8,
  padding: "28px 16px",
  cursor: "pointer",
  transition: "border-color 0.2s, background 0.2s",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const smallBtn = (bg) => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "5px 12px", borderRadius: 6, border: "none",
  background: bg, color: "white", fontSize: 11, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
});

export default Settings;
