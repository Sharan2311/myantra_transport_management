// Match scanned pump bills to OPEN diesel requests. Pure functions, unit-tested (scripts/bill_match.test.mjs).
// Rules (owner, 21 Nov 2026): vehicle + exact diesel amount + same pump + bill date within 1 day of the request.
// A bill never confirms anything by itself: the screen only SUGGESTS and the owner taps Confirm.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (v) => String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const normReceipt = (s) => String(s || "").trim().toUpperCase();
const money = (x) => Math.round((+x || 0) * 100) / 100;
export const dieselOf = (r) => money(r.dieselAmount ?? r.amount);

// A bill that prints only the last digits (e.g. "7880") matches by ending; a full number must match completely.
export const vehicleMatches = (billVeh, truckNo) => {
  const b = norm(billVeh), t = norm(truckNo);
  if (!b || !t) return false;
  return b.length <= 4 ? t.endsWith(b) : b === t;
};

export const dateWithin = (a, b, days = 1) => {
  if (!ISO.test(String(a || "")) || !ISO.test(String(b || ""))) return false;
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000 <= days;
};

// A bill can be matched to an OPEN request (to confirm it) or to a request the pump already confirmed/attached
// but that has no bill on it yet (the bill is then only attached as proof; status and amounts are not touched).
export const hasBillOn = (r) => !!(String(r.receiptNo || "").trim() || r.receiptImagePath);
export const eligible = (r) => r.status === "open" || ((r.status === "confirmed" || r.status === "attached") && !hasBillOn(r));

// Pump names on bills are misread now and then ("SHREF" for "SHREE"), so besides the plain "one contains the other"
// test, every significant word (4+ letters) of the stored pump name must appear on the bill, allowing one wrong letter.
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
const lev1 = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [l, sh] = a.length > b.length ? [a, b] : [b, a];
  return l.slice(i + 1) === sh.slice(i);
};
export const pumpNameMatches = (extracted, stored) => {
  const a = String(extracted || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = String(stored || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return false;
  if (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a))) return true;
  const sw = words(stored), ew = words(extracted);
  return sw.length >= 2 && sw.every((w) => ew.some((x) => lev1(w, x)));
};

const fits = (bill, r, ctx) =>
  eligible(r) && vehicleMatches(bill.vehicleNo, r.truckNo) && dateWithin(bill.date, r.date) && !!ctx.pumpMatches(bill.pumpName, r);

export function matchBatch(bills, requests, ctx) {
  const claimed = new Set();
  const seenReceipts = new Set();
  const out = [];
  for (const bill of bills || []) {
    const rn = normReceipt(bill.receiptNo);
    if (!(+bill.amount > 0) || !norm(bill.vehicleNo)) { out.push({ bill, state: "unreadable" }); continue; }
    if (rn) {
      const used = (requests || []).find((r) => String(r.receiptNo || "").split("+").map(normReceipt).includes(rn));
      if (used || seenReceipts.has(rn)) { out.push({ bill, state: "duplicate_receipt", request: used || null }); continue; }
      seenReceipts.add(rn);
    }
    const cands = (requests || []).filter((r) => !claimed.has(r.id) && fits(bill, r, ctx) && dieselOf(r) === money(bill.amount));
    if (cands.length === 1) { claimed.add(cands[0].id); out.push({ bill, state: "match", request: cands[0] }); }
    else if (cands.length > 1) out.push({ bill, state: "ambiguous", candidates: cands });
    else {
      // same vehicle, pump and exact amount, only the date is off -> a near match the owner can review
      const near = (requests || []).filter((r) => !claimed.has(r.id) && eligible(r) && vehicleMatches(bill.vehicleNo, r.truckNo) && !!ctx.pumpMatches(bill.pumpName, r) && dieselOf(r) === money(bill.amount));
      if (near.length === 1) out.push({ bill, state: "near_match", request: near[0], reason: "date" });
      else out.push({ bill, state: "not_found", sameVehicle: (requests || []).filter((r) => !claimed.has(r.id) && eligible(r) && vehicleMatches(bill.vehicleNo, r.truckNo)) });
    }
  }
  // Split bills: several unmatched bills for one vehicle whose amounts add up exactly to one open request.
  const lost = out.filter((o) => o.state === "not_found");
  for (const r of requests || []) {
    if (!eligible(r) || claimed.has(r.id)) continue;
    const pool = lost.filter((o) => fits(o.bill, r, ctx) || (vehicleMatches(o.bill.vehicleNo, r.truckNo) && ctx.pumpMatches(o.bill.pumpName, r) && dateWithin(o.bill.date, r.date, 1)));
    const n = Math.min(pool.length, 8);
    const target = dieselOf(r);
    for (let mask = 1; mask < 1 << n; mask++) {
      const pick = pool.slice(0, n).filter((_, i) => mask & (1 << i));
      if (pick.length < 2) continue;
      if (money(pick.reduce((s, o) => s + money(o.bill.amount), 0)) !== target) continue;
      const hint = { requestId: r.id, indentNo: r.indentNo, billIds: pick.map((o) => o.bill.id) };
      pick.forEach((o) => { if (!o.splitHint) o.splitHint = hint; });
      break;
    }
  }
  return out;
}

// The request as it should be saved once the owner has confirmed it against a bill (cash part is left as it was).
export const confirmUpdate = (req, { amount, receiptNo, bill, by, at, method, reason }) => {
  const origDiesel = req.dieselAmount ?? req.amount;
  const cash = req.cashAmount ?? 0;
  const diesel = money(amount);
  const changed = diesel !== money(origDiesel);
  return {
    ...req,
    status: "confirmed",
    dieselAmount: diesel,
    cashAmount: cash,
    amount: money(diesel + cash),
    confirmedAmount: diesel,
    confirmedCash: cash,
    confirmedReason: reason || (changed ? "Confirmed via bill upload" : null),
    confirmedAt: at,
    confirmedBy: by || "",
    pin: "****",
    receiptNo: receiptNo || "",
    extractedVehicleNo: bill?.vehicleNo ?? null,
    extractedAmount: bill?.amount ?? null,
    extractedDate: bill?.date ?? null,
    extractedPumpName: bill?.pumpName ?? null,
    vehicleMismatch: false, pumpMismatch: false, dateMismatch: false,
    confirmationMethod: method || "bulk_receipt",
    originalDieselAmount: changed ? origDiesel : req.originalDieselAmount,
  };
};

// A request the pump had already confirmed: only attach the bill as proof. Status and amounts stay exactly as they were.
export const attachUpdate = (req, { receiptNo, bill, method, note }) => ({
  ...req,
  receiptNo: receiptNo || "",
  extractedVehicleNo: bill?.vehicleNo ?? null,
  extractedAmount: bill?.amount ?? null,
  extractedDate: bill?.date ?? null,
  extractedPumpName: bill?.pumpName ?? null,
  vehicleMismatch: false, pumpMismatch: false, dateMismatch: false,
  amountNote: note || req.amountNote,
  confirmationMethod: req.confirmationMethod || method || "bulk_receipt",
});
