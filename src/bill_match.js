import { normReceipt, billsDiffer, receiptClashes } from "./bill_identity.js";
// Match scanned pump bills to OPEN diesel requests. Pure functions, unit-tested (scripts/bill_match.test.mjs).
// Rules (owner, 21 Nov 2026): vehicle + exact diesel amount + same pump + bill date within 1 day of the request.
// A bill never confirms anything by itself: the screen only SUGGESTS and the owner taps Confirm.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (v) => String(v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
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
  const seenBills = [];
  const out = [];
  for (const bill of bills || []) {
    const rn = normReceipt(bill.receiptNo);
    if (!(+bill.amount > 0) || !norm(bill.vehicleNo)) { out.push({ bill, state: "unreadable" }); continue; }
    let notices = [];
    if (rn) {
      // the receipt number alone is not proof of a duplicate (the pump has printed the same number on different bills)
      const rc = receiptClashes(bill, requests, null);
      const earlier = seenBills.find((b) => normReceipt(b.receiptNo) === rn && !billsDiffer(b, bill));
      if (rc.clash || earlier) { out.push({ bill, state: "duplicate_receipt", request: rc.clash || null }); continue; }
      notices = rc.notices;
      seenBills.push(bill);
    }
    const mark = out.length;
    const cands = (requests || []).filter((r) => !claimed.has(r.id) && fits(bill, r, ctx) && dieselOf(r) === money(bill.amount));
    if (cands.length === 1) { claimed.add(cands[0].id); out.push({ bill, state: "match", request: cands[0] }); }
    else if (cands.length > 1) out.push({ bill, state: "ambiguous", candidates: cands });
    else {
      // same vehicle, pump and exact amount, only the date is off -> a near match the owner can review
      const near = (requests || []).filter((r) => !claimed.has(r.id) && eligible(r) && vehicleMatches(bill.vehicleNo, r.truckNo) && !!ctx.pumpMatches(bill.pumpName, r) && dieselOf(r) === money(bill.amount));
      if (near.length === 1) out.push({ bill, state: "near_match", request: near[0], reason: "date" });
      else out.push({ bill, state: "not_found", sameVehicle: (requests || []).filter((r) => !claimed.has(r.id) && eligible(r) && vehicleMatches(bill.vehicleNo, r.truckNo)) });
    }
    // same receipt number on another request, but provably a different bill: allowed, shown to the owner
    if (notices.length) for (let i = mark; i < out.length; i++) out[i].notices = notices;
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

// Owner "delete this duplicate" from the bills screen: only requests nothing depends on. Returns "" when allowed,
// otherwise the reason it is not allowed.
export const deleteBlockReason = (r) => {
  if (r.status !== "open" && r.status !== "confirmed") return `This request is ${r.status}; it can't be deleted from here.`;
  if (String(r.receiptNo || "").trim() || r.receiptImagePath) return "This request already has a bill attached.";
  if (r.lrNo || r.tripId) return "This request is linked to an LR / trip.";
  return "";
};

// Which request to pre-select when the owner taps "Check manually". Never an LR-attached request by default
// (an old attached request of the same vehicle is almost never the right one); open first, then confirmed.
export const defaultRequestPick = (res) => {
  if (res && res.candidates && res.candidates.length) return res.candidates[0].id;
  const pool = (res && res.sameVehicle) || [];
  const pick = pool.find((r) => r.status === "open") || pool.find((r) => r.status === "confirmed");
  return pick ? pick.id : "";
};

// A hand-corrected scan amount. Keeps the original scan so the correction stays visible.
export const withCorrectedAmount = (data, text) => {
  const n = Number(String(text).replace(/[^0-9.]/g, ""));
  const orig = data.scanAmount != null ? data.scanAmount : data.amount;
  if (!(n > 0)) return { ...data, amount: null, scanAmount: orig, edited: true };
  return { ...data, amount: Math.round(n * 100) / 100, scanAmount: orig, edited: n !== orig };
};

// ---- Grouping several bills of one vehicle onto ONE diesel request (owner verifies, then merges) ----
// A bill is groupable when it was read (vehicle + amount) and is not already used on another request.
export const groupable = (b) => !!(b && +b.amount > 0 && norm(b.vehicleNo));

// Groups of 2+ bills of the same vehicle. A bill that shows only the last digits joins the one full number that ends with them.
export function groupBillsByVehicle(bills) {
  const list = (bills || []).filter(groupable);
  const fulls = [...new Set(list.map((b) => norm(b.vehicleNo)).filter((k) => k.length > 4))];
  const map = new Map();
  for (const b of list) {
    let k = norm(b.vehicleNo);
    if (k.length <= 4) { const m = fulls.filter((f) => f.endsWith(k)); if (m.length === 1) k = m[0]; }
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(b);
  }
  return [...map.entries()].filter(([, v]) => v.length >= 2).map(([key, v]) => ({
    key, vehicleNo: v.map((b) => b.vehicleNo).sort((a, c) => norm(c).length - norm(a).length)[0], bills: v,
  }));
}

// Requests a group of bills can be merged onto: same vehicle, open or confirmed-without-a-bill. Open first, then the exact total.
export function groupCandidates(requests, vehicleNo, total) {
  const t = money(total);
  return (requests || []).filter((r) => eligible(r) && vehicleMatches(vehicleNo, r.truckNo))
    .sort((a, b) => (dieselOf(b) === t) - (dieselOf(a) === t) || (b.status === "open") - (a.status === "open"));
}

// Checks the owner sees before merging. diff = total of the bills minus the request. Any difference, or a bill whose
// pump / date / vehicle does not fit the request, means a written reason is required (same rule as any manual approval).
export function groupCheck(bills, request, ctx) {
  const total = money((bills || []).reduce((s, b) => s + money(b.amount), 0));
  if (!request) return { total, diff: 0, issues: [], needsReason: false, exact: false };
  const diff = money(total - dieselOf(request));
  const issues = [];
  for (const b of bills || []) {
    const who = b.receiptNo || "bill";
    if (!vehicleMatches(b.vehicleNo, request.truckNo)) issues.push(`${who}: vehicle ${b.vehicleNo || "?"} is not ${request.truckNo}`);
    if (!ctx.pumpMatches(b.pumpName, request)) issues.push(`${who}: pump "${b.pumpName || "?"}" differs from the request's pump`);
    if (!dateWithin(b.date, request.date)) issues.push(`${who}: date ${b.date || "?"} is more than 1 day from the request (${request.date})`);
  }
  return { total, diff, issues, needsReason: diff !== 0 || issues.length > 0, exact: diff === 0 && issues.length === 0 };
}

// ---- Hand-corrected vehicle number (the scan misread the plate) ----
// Only a truck the app knows is accepted, so a typo can never match nothing silently.
export const knownTruck = (text, trucks) => {
  const k = norm(text);
  if (!k) return "";
  return (trucks || []).find((t) => norm(t) === k) || "";
};
// Trucks to suggest while typing: the digits typed may be anywhere in the number (last 4 is the usual case).
export const truckSuggestions = (text, trucks, limit = 8) => {
  const k = norm(text);
  if (k.length < 2) return [];
  return [...new Set((trucks || []).filter((t) => norm(t).includes(k)))].slice(0, limit);
};
export const withCorrectedVehicle = (data, truckNo) => {
  const orig = data.scanVehicleNo != null ? data.scanVehicleNo : data.vehicleNo;
  return { ...data, vehicleNo: truckNo, scanVehicleNo: orig, vehEdited: norm(truckNo) !== norm(orig) };
};
// One sentence for the request's audit trail describing every hand correction made to a scanned bill ("" if none).
export const editNote = (d) => {
  const parts = [];
  if (d && d.vehEdited) parts.push(`vehicle read as ${d.scanVehicleNo || "?"}, corrected by hand to ${d.vehicleNo}`);
  if (d && d.edited) parts.push(`amount read as ₹${d.scanAmount != null ? d.scanAmount : "?"}, corrected by hand to ₹${d.amount}`);
  return parts.length ? "Scan " + parts.join("; ") + " (checked against the bill photo)" : "";
};
