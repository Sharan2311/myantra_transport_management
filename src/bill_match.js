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

const fits = (bill, r, ctx) =>
  r.status === "open" && vehicleMatches(bill.vehicleNo, r.truckNo) && dateWithin(bill.date, r.date) && !!ctx.pumpMatches(bill.pumpName, r);

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
    else out.push({ bill, state: "not_found", sameVehicle: (requests || []).filter((r) => r.status === "open" && !claimed.has(r.id) && vehicleMatches(bill.vehicleNo, r.truckNo)) });
  }
  // Split bills: several unmatched bills for one vehicle whose amounts add up exactly to one open request.
  const lost = out.filter((o) => o.state === "not_found");
  for (const r of requests || []) {
    if (r.status !== "open" || claimed.has(r.id)) continue;
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
