// ═══════════════════════════════════════════════════════════════
// CLIENT CONFIG — M Yantra Enterprises (main branch)
// This is the ONLY file that differs between git branches.
// ═══════════════════════════════════════════════════════════════

const CLIENT_CONFIG = {

  // ── Identity ────────────────────────────────────────────────
  clientId:          "",  // UUID from admin Supabase (fill after admin setup)
  companyName:       "M Yantra Enterprises",
  companyShort:      "MY",
  ownerName:         "Sharan",
  pan:               "ABBFM6370M",
  gstn:              "29ABBFM6370M1ZR",
  phone:             "9008420384",
  address:           "Kodla, Karnataka",

  // ── Logo (base64 data URI) ──────────────────────────────────
  logoSrc: "data:image/jpeg;base64,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",

  // ── Client's Own Supabase ───────────────────────────────────
  supabaseUrl:       "",  // filled from supabase.js env vars for now
  supabaseAnonKey:   "",  // filled from supabase.js env vars for now

  // ── Admin Supabase (central control — fill after admin setup) ──
  adminSupabaseUrl:     "",
  adminSupabaseAnonKey: "",

  // ── Business Config ─────────────────────────────────────────
  clients: ["Shree Cement Kodla", "Shree Cement Guntur", "Ultratech Malkhed"],
  defaultClient: "Shree Cement Kodla",
  defaultConsignee: "Shree Cement Ltd",

  // Shree Payments tab relevant clients
  shreeClients: ["Shree Cement Kodla", "Shree Cement Guntur"],

  // LR prefix mapping: "ClientName|Material" → prefix
  lrPrefixes: {
    "Shree Cement Kodla|Cement":   "SKLC",
    "Shree Cement Kodla|Gypsum":   "SKLGP",
    "Shree Cement Kodla|Husk":     "SKLH",
    "Shree Cement Guntur|Cement":  "SGNC",
    "Shree Cement Guntur|Gypsum":  "SGNGP",
    "Shree Cement Guntur|Husk":    "SGNH",
    "Ultratech Malkhed|Cement":    "UTCC",
    "Ultratech Malkhed|Gypsum":    "UTCGP",
    "Ultratech Malkhed|Husk":      "UTCH",
    "Inbound|Gypsum":              "INBGP",
    "Inbound|Husk":                "INBH",
    "Inbound|Limestone":           "INBL",
  },

  // Client name abbreviations for UI display
  clientAbbreviations: {
    "Shree Cement ": "SC ",
    "Ultratech ":    "UT ",
  },

  // Client detection keywords from DI/GR scans
  clientDetection: {
    "ultratech": "Ultratech Malkhed",
    "malkhed":   "Ultratech Malkhed",
    "guntur":    "Shree Cement Guntur",
  },

  // Client colors for UI
  clientColors: {
    "Ultratech": "#f97316",  // orange
    "Guntur":    "#7c3aed",  // purple
  },

  // Bank type for payment scan
  bankType: "universal",

  // Scans included in plan
  scansIncluded: 9999,

  // ── Branding ────────────────────────────────────────────────
  primaryColor:  "#1565c0",
  accentColor:   "#0d9488",
  headerBg:      "#0d1b2a",
};

export default CLIENT_CONFIG;
