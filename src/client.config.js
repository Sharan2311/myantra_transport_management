// ═══════════════════════════════════════════════════════════════
// CLIENT CONFIG — ABC Transport (client/abc-transport branch)
// Basic Plan — limited features
// ═══════════════════════════════════════════════════════════════

const CLIENT_CONFIG = {

  // ── Identity ────────────────────────────────────────────────
  clientId:          "",
  companyName:       "ABC Transport",
  companyShort:      "AB",
  ownerName:         "",
  pan:               "",
  gstn:              "",
  phone:             "",
  address:           "",

  // ── Logo ────────────────────────────────────────────────────
  logoSrc: "",  // paste their logo base64 or leave empty for fallback

  // ── Client's Own Supabase ───────────────────────────────────
  supabaseUrl:       "https://PASTE_ABC_PROJECT_ID.supabase.co",
  supabaseAnonKey:   "PASTE_ABC_ANON_KEY",

  // ── Admin Supabase (fill after admin project is created) ────
  adminSupabaseUrl:     "",
  adminSupabaseAnonKey: "",

  // ── Business Config ─────────────────────────────────────────
  clients: ["ACC Cement"],
  defaultClient: "ACC Cement",
  defaultConsignee: "",
  shreeClients: [],

  lrPrefixes: {
    "ACC Cement|Cement": "ACC",
  },

  clientAbbreviations: {},
  clientDetection: {},
  clientColors: {},
  bankType: "universal",
  scansIncluded: 50,

  // ── Branding ────────────────────────────────────────────────
  primaryColor:  "#1565c0",
  accentColor:   "#0d9488",
  headerBg:      "#0d1b2a",
  tagline:       "TRANSPORT MANAGEMENT",

  // ── Feature Flags (Basic Plan) ──────────────────────────────
  features: {
    trips:              true,
    vehicles:           true,
    employees:          true,
    driver_pay:         true,
    di_scan:            true,
    payment_scan:       false,   // Pro+
    diesel_tab:         false,   // Pro+
    tafal:              false,   // Pro+
    pdf_reports:        false,   // Pro+
    shortage_recovery:  false,   // Pro+
    loan_ledger:        false,   // Pro+
    party_billing:      false,   // Enterprise
    pump_portal:        false,   // Enterprise
    batch_di_scanner:   false,   // Enterprise
    gst_reconciliation: false,   // Enterprise
    owner_reports:      false,   // Enterprise
    inbound_trips:      false,   // Enterprise
    expense_tracking:   false,   // Pro+
    custom_branding:    false,   // Enterprise
    husk_manager:       false,   // Enterprise
  },
};

export default CLIENT_CONFIG;
