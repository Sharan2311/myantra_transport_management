// ═══════════════════════════════════════════════════════════════
// RUNTIME CONFIG LOADER
// Fetches ALL client config from admin Supabase on app boot.
// Replaces the need for large client.config.js files.
//
// Usage in App.jsx:
//   import { loadRuntimeConfig, RC } from './runtime_config.js';
//   // On boot: await loadRuntimeConfig();
//   // Then use: RC.companyName, RC.features, RC.anthropicKey, etc.
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

  // Status
  status:           "active",
  plan:             "basic",

  // Admin connection (for scan logging)
  adminSupabaseUrl:    CLIENT_CONFIG.adminSupabaseUrl,
  adminSupabaseAnonKey:CLIENT_CONFIG.adminSupabaseAnonKey,
};

// ── Load everything from admin DB ───────────────────────────────────────────
export async function loadRuntimeConfig() {
  try {
    // 1. Fetch client row
    const { data: client, error: e1 } = await adminDb
      .from('clients')
      .select('*')
      .eq('id', CLIENT_CONFIG.clientId)
      .single();

    if (e1 || !client) {
      console.error('Failed to load client config:', e1);
      return false;
    }

    // 2. Fetch features
    const { data: feats } = await adminDb
      .from('client_features')
      .select('feature, enabled')
      .eq('client_id', CLIENT_CONFIG.clientId);

    const featureMap = {};
    (feats || []).forEach(f => { featureMap[f.feature] = f.enabled; });

    // 3. Parse business config
    const biz = client.business_config || {};

    // 4. Populate RC
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
    RC.features         = featureMap;

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

// ── Scan logging ────────────────────────────────────────────────────────────
export async function logScan(scanType, success = true) {
  try {
    await adminDb.from('client_scans').insert({
      client_id: RC.clientId,
      scan_type: scanType,
      success,
      scanned_at: new Date().toISOString(),
    });
  } catch {}
}

// ── Account check ───────────────────────────────────────────────────────────
export function isActive() {
  return RC.status === 'active';
}

export default RC;
