// ═══════════════════════════════════════════════════════════════
// RUNTIME CONFIG LOADER
// Fetches ALL client config from admin Supabase on app boot.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import CLIENT_CONFIG from './client.config.js';

const adminDb = createClient(
  CLIENT_CONFIG.adminSupabaseUrl,
  CLIENT_CONFIG.adminSupabaseAnonKey
);

// ── Runtime Config (populated on boot) ──────────────────────────────────────
export const RC = {
  // Identity
  clientId:         CLIENT_CONFIG.clientId,
  companyName:      "Transport Management",
  companyShort:     "TM",
  ownerName:        "",
  pan:              "",
  gstn:             "",
  phone:            "",
  address:          "",
  tagline:          "TRANSPORT MANAGEMENT",

  // Logo
  logoSrc:          "",

  // Supabase (client's own DB)
  supabaseUrl:      "",
  supabaseAnonKey:  "",

  // API keys
  anthropicKey:     "",

  // Branding
  primaryColor:     "#1565c0",
  accentColor:      "#0d9488",
  headerBg:         "#0d1b2a",

  // Business config
  clients:          [],
  defaultClient:    "",
  defaultConsignee: "",
  shreeClients:     [],
  lrPrefixes:       {},
  clientAbbreviations: {},
  clientDetection:  {},
  clientColors:     {},
  bankType:         "universal",
  placeMap:         {},
  roles:            {},

  // Feature flags
  features:         {},
  scansIncluded:    50,
  scansUsed:        0,

  // Status
  status:           "active",
  plan:             "basic",

  // Payment gate
  paidUntil:        null,       // Date string or null
  billingCycle:     "monthly",  // monthly, quarterly, yearly
  paymentBypass:    false,      // Admin can bypass payment check
  monthlyFee:       0,

  // Admin connection (for scan logging)
  adminSupabaseUrl:    CLIENT_CONFIG.adminSupabaseUrl,
  adminSupabaseAnonKey:CLIENT_CONFIG.adminSupabaseAnonKey,
};

// ── Load everything from admin DB ───────────────────────────────────────────
export async function loadRuntimeConfig() {
  try {
    // Fetch client, features, and scan count in PARALLEL for faster boot
    const som = new Date();
    som.setDate(1); som.setHours(0,0,0,0);

    const [clientRes, featsRes, scanRes] = await Promise.all([
      adminDb.from('clients').select('*').eq('id', CLIENT_CONFIG.clientId).single(),
      adminDb.from('client_features').select('feature, enabled').eq('client_id', CLIENT_CONFIG.clientId),
      adminDb.from('client_scans').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_CONFIG.clientId).gte('scanned_at', som.toISOString()),
    ]);

    const client = clientRes.data;
    if (clientRes.error || !client) {
      console.error('Failed to load client config:', clientRes.error);
      return false;
    }

    const featureMap = {};
    (featsRes.data || []).forEach(f => { featureMap[f.feature] = f.enabled; });

    const scanCount = scanRes.count || 0;

    // Parse business config
    const biz = client.business_config || {};

    // Populate RC
    RC.companyName      = client.name || RC.companyName;
    RC.companyShort     = client.company_short || client.name?.slice(0,2).toUpperCase() || "TM";
    RC.ownerName        = client.owner_name || "";
    RC.pan              = client.pan || "";
    RC.gstn             = client.gstn || "";
    RC.phone            = client.phone || "";
    RC.address          = client.address || "";
    RC.tagline          = client.tagline || "TRANSPORT MANAGEMENT";
    RC.logoSrc          = client.logo_base64 || "";
    RC.supabaseUrl      = client.supabase_url || "";
    RC.supabaseAnonKey  = client.supabase_key || "";
    RC.anthropicKey     = client.anthropic_api_key || "";
    RC.primaryColor     = client.primary_color || "#1565c0";
    RC.accentColor      = client.accent_color || "#0d9488";
    RC.headerBg         = client.header_bg || "#0d1b2a";
    RC.status           = client.status || "active";
    RC.plan             = client.plan || "basic";
    RC.scansIncluded    = client.scans_included || 50;
    RC.scansUsed        = scanCount || 0;
    RC.features         = featureMap;

    // Payment gate
    RC.paidUntil        = client.paid_until || null;
    RC.billingCycle     = client.billing_cycle || "monthly";
    RC.paymentBypass    = client.payment_bypass || false;
    RC.monthlyFee       = client.monthly_fee || 0;

    // Business config
    RC.clients            = biz.clients || [];
    RC.defaultClient      = biz.defaultClient || RC.clients[0] || "";
    RC.defaultConsignee   = biz.defaultConsignee || "";
    RC.shreeClients       = biz.shreeClients || [];
    RC.lrPrefixes         = biz.lrPrefixes || {};
    RC.clientAbbreviations= biz.clientAbbreviations || {};
    RC.clientDetection    = biz.clientDetection || {};
    RC.clientColors       = biz.clientColors || {};
    RC.bankType           = biz.bankType || "universal";
    RC.placeMap           = biz.placeMap || {};
    RC.roles              = biz.roles || {};

    return true;
  } catch (err) {
    console.error('Runtime config load failed:', err);
    return false;
  }
}

// ── Feature check ───────────────────────────────────────────────────────────
export function canFeature(feat) {
  if (!feat) return true;
  const f = RC.features;
  if (Object.keys(f).length === 0) return true;
  return f[feat] === true;
}

// ── Payment check ───────────────────────────────────────────────────────────
export function isPaymentDue() {
  if (RC.paymentBypass) return false;
  if (RC.monthlyFee === 0) return false;
  if (!RC.paidUntil) return true; // No payment date set = overdue
  const due = new Date(RC.paidUntil);
  const now = new Date();
  return now > due;
}

// ── Submit payment proof (from transport app → admin DB) ────────────────────
export async function submitPaymentProof({ amount, utr, paymentDate, screenshotBase64, billingPeriod, notes }) {
  try {
    const { data, error } = await adminDb.from('subscription_payments').insert({
      client_id: RC.clientId,
      amount: +amount || 0,
      utr: utr || '',
      payment_date: paymentDate || new Date().toISOString().split('T')[0],
      screenshot_base64: screenshotBase64 || '',
      billing_period: billingPeriod || '',
      notes: notes || '',
      status: 'pending',
    }).select().single();
    if (error) throw error;
    return { success: true, id: data.id };
  } catch (e) {
    console.error('Payment submission failed:', e);
    return { success: false, error: e.message };
  }
}

// ── Check if there's a pending payment ──────────────────────────────────────
export async function getPendingPayment() {
  try {
    const { data } = await adminDb.from('subscription_payments')
      .select('id, amount, utr, status, submitted_at')
      .eq('client_id', RC.clientId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(1);
    return data?.[0] || null;
  } catch { return null; }
}

// ── Fetch invoices for this transport (for billing history) ─────────────────
export async function fetchMyInvoices() {
  try {
    const { data } = await adminDb.from('subscription_invoices')
      .select('*')
      .eq('client_id', RC.clientId)
      .order('created_at', { ascending: false });
    return data || [];
  } catch { return []; }
}

// ── Scan logging ────────────────────────────────────────────────────────────
export async function logScan(scanType, success = true) {
  try {
    await adminDb.from('client_scans').insert({
      client_id: RC.clientId,
      scan_type: scanType,
      success,
      scanned_at: new Date().toISOString(),
    });
    RC.scansUsed++;
  } catch {}
}

// ── Account check ───────────────────────────────────────────────────────────
export function isActive() {
  return RC.status === 'active';
}

export default RC;
