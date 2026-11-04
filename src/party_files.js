// Party-trip document matching. Pure functions (no React, no network) so they can be unit-tested.
//
// Rules (agreed with the owner):
//  - The scanned DI/GR copy IS the party GR copy; only the invoice has to be added.
//  - Invoices are dropped together with the DIs and matched by DI number.
//  - A party DI without its invoice is never saved (the caller blocks it).
//  - Godown DIs need nothing extra.

export const normDI = s => String(s ?? "").replace(/\D/g, "");

// GR copy for a party item: a manually uploaded GR if any, otherwise the scanned DI/GR file itself.
export const partyGrFile = item => {
  if (!item || item.orderType !== "party") return null;
  return item.grFile || item.file || null;
};

// Names of the documents a party item is still missing (empty = complete). Godown: always complete.
export const partyDocsMissing = item => {
  if (!item || item.orderType !== "party") return [];
  const miss = [];
  if (!partyGrFile(item)) miss.push("GR");
  if (!item.invoiceFile) miss.push("Invoice");
  return miss;
};

const sameFile = (a, b) => !!a && !!b && a.name === b.name && a.size === b.size;

// items : scanned trip items  [{id, orderType, extracted:{diNo}, invoiceFile?}]
// scans : scanned invoice files [{id, file, diNo, error?}]
// Returns { attach:[{itemId, scanId}], unmatched:[{scanId, file, reason, error?}] }
//   reason: no_di | no_trip | not_party | duplicate
// Never replaces an invoice that is already attached.
export function matchInvoices(items, scans) {
  const attach = [];
  const unmatched = [];
  const taken = new Set(); // itemIds that received an invoice in this call
  for (const s of scans || []) {
    const di = normDI(s.diNo);
    if (!di) { unmatched.push({ scanId: s.id, file: s.file, reason: "no_di", error: s.error || "" }); continue; }
    const item = (items || []).find(x => normDI(x.extracted?.diNo) === di);
    if (!item) { unmatched.push({ scanId: s.id, file: s.file, reason: "no_trip" }); continue; }
    if (item.orderType !== "party") { unmatched.push({ scanId: s.id, file: s.file, reason: "not_party" }); continue; }
    if (item.invoiceFile) {
      if (sameFile(item.invoiceFile, s.file)) continue; // already attached, nothing to do
      unmatched.push({ scanId: s.id, file: s.file, reason: "duplicate" });
      continue;
    }
    if (taken.has(item.id)) { unmatched.push({ scanId: s.id, file: s.file, reason: "duplicate" }); continue; }
    taken.add(item.id);
    attach.push({ itemId: item.id, scanId: s.id });
  }
  return { attach, unmatched };
}

// Single party trip: one drop of mixed files.
// scans: [{file, kind:"gr"|"invoice", diNo, error?}]; currentDI: DI of the trip already open (or "").
// Returns { gr: scan|null, invoices:[File], notices:[string], blocked:string }.
// A single trip has one DI, so two GR/DI copies in one drop are blocked (Batch scanner is for several).
// An invoice is only attached when its DI equals the trip's DI; otherwise it is refused with a notice.
export function routeDroppedDocs(scans, currentDI = "") {
  const list = scans || [];
  const grs = list.filter(x => x.kind !== "invoice");
  const invs = list.filter(x => x.kind === "invoice");
  const out = { gr: null, invoices: [], notices: [], blocked: "" };
  if (grs.length > 1) {
    out.blocked = "Drop only one DI/GR copy at a time here. For several DIs use the batch scanner (Add Trip — Scan GR / DI Copies).";
    return out;
  }
  if (grs.length === 1) out.gr = grs[0];
  const target = normDI(out.gr ? out.gr.diNo : currentDI);
  let used = false;
  for (const inv of invs) {
    const name = inv.file?.name || "invoice";
    const di = normDI(inv.diNo);
    if (!di) { out.notices.push(`${name}: DI number could not be read${inv.error ? " — " + inv.error : ""}.`); continue; }
    if (!target) { out.notices.push(`${name}: add the GR / DI copy first so the invoice can be matched to its DI.`); continue; }
    if (di !== target) { out.notices.push(`${name}: invoice is for DI ${di}, but this trip is DI ${target} — not attached.`); continue; }
    if (used) { out.notices.push(`${name}: this DI already has an invoice in this drop — ignored.`); continue; }
    used = true;
    out.invoices.push(inv.file);
  }
  return out;
}
