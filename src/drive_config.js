// Which Google Drive folder each "Google Drive" button opens. The links are saved by the owner in the app's settings
// (database), not in the code. An empty or broken value falls back to the default folder, so the button always works.
export const DRIVE_KEYS = [
  { key: "trips",    label: "Add Trip (DI, LR, receipts)",   hint: "Opens when you pick a file from Google Drive while adding or scanning trips" },
  { key: "payments", label: "Scan Payment",                  hint: "Payment screenshots / payment scan buttons" },
  { key: "invoices", label: "Upload Invoice PDF",            hint: "Payments tab: invoice scan" },
  { key: "advices",  label: "Upload Payment Advice",         hint: "Payments tab: payment advice scan" },
];

export function extractDriveId(url) {
  const s = String(url || "");
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
  const m2 = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  const m3 = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return (m1 || m2 || m3)?.[1] || null;
}

// A folder link, or just the folder id. Empty = use the default.
export function parseDriveLink(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return { ok: true, id: "" };
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return { ok: true, id: s };
  if (/\/file\/d\//.test(s)) return { ok: false, error: "That is a file link. Open the FOLDER in Google Drive and copy its link." };
  const id = /\/folders\/|[?&]id=/.test(s) ? extractDriveId(s) : null;
  return id ? { ok: true, id } : { ok: false, error: "That is not a Google Drive folder link. Open the folder in Drive, tap Share, and copy the link." };
}

let folders = {};
export const setDriveFolders = (obj) => { folders = obj && typeof obj === "object" ? obj : {}; };
export const getDriveRoot = (key, fallback) => {
  const p = parseDriveLink(key ? folders[key] : "");
  return p.ok && p.id ? p.id : fallback;
};
