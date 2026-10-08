// ─── husk_logic.js — pure rules for the Husk module (no React, no DB) ────────
// Everything here is plain data in, plain data out, so it can be tested with
// node and reused by the screens and the PDF reports.
//
// Sign conventions (confirmed with the owner):
//   Customer ledger : + = M Yantra owes the customer, − = advance given
//   Company ledger  : + = the company owes M Yantra
//   Loan ledger     : + = what the customer still owes on the Husk loan
//   Deduction ledger: + = company deductions not yet recovered from customers

export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const num = v => {
  const x = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(x) ? 0 : x;
};

// ── Dated rates ──────────────────────────────────────────────────────────────
// A rate applies from its effectiveFrom date. The rate for a given entry date
// is the one with the latest effectiveFrom on or before that date; if two rows
// share a date, the one created last wins.
export function pickRate(rows, date) {
  let best = null;
  for (const r of rows || []) {
    if ((r.effectiveFrom || "") > date) continue;
    if (!best
      || r.effectiveFrom > best.effectiveFrom
      || (r.effectiveFrom === best.effectiveFrom && (r.ts || 0) >= (best.ts || 0))) best = r;
  }
  return best;
}
export const companyRateRows = (rates, companyId, materialId) =>
  (rates || []).filter(r => r.companyId === companyId && r.materialId === materialId);
export const customerRateRows = (rates, customerId, materialId, companyId) =>
  (rates || []).filter(r => r.customerId === customerId && r.materialId === materialId && r.companyId === companyId);
export const companyRateFor = (rates, companyId, materialId, date) =>
  pickRate(companyRateRows(rates, companyId, materialId), date);
export const customerRateFor = (rates, customerId, materialId, companyId, date) =>
  pickRate(customerRateRows(rates, customerId, materialId, companyId), date);

// ── Amounts for one vehicle entry ────────────────────────────────────────────
export function computeAmounts({ tons, companyRate, customerRate, loanDeduction = 0, customerDeduction = 0 }) {
  const t = num(tons);
  const companyAmount = r2(t * num(companyRate));
  const customerAmount = r2(t * num(customerRate));
  const netPayable = r2(customerAmount - num(loanDeduction) - num(customerDeduction));
  return { companyAmount, customerAmount, netPayable, margin: r2(companyAmount - customerAmount) };
}

// ── Husk loan ────────────────────────────────────────────────────────────────
export function loanBalance(loans, customerId) {
  let b = 0;
  for (const l of loans || []) {
    if (l.customerId !== customerId) continue;
    b += l.kind === "given" ? num(l.amount) : -num(l.amount);
  }
  return r2(b);
}
// Like cement: each trip deducts the smaller of the per-trip amount and what is left.
export function loanDeductionFor(customer, loans) {
  const per = num(customer && customer.loanPerTrip);
  const bal = loanBalance(loans, customer && customer.id);
  if (per <= 0 || bal <= 0) return 0;
  return r2(Math.min(per, bal));
}

// ── Company deductions and their recovery ────────────────────────────────────
// Every company payment may carry a deduction. A deduction is recovered from a
// customer through a trip (trip.customerDeduction, linked by dedPaymentId).
export function recoveredByPayment(trips) {
  const m = {};
  for (const t of trips || []) {
    if (t.dedPaymentId && num(t.customerDeduction) > 0) m[t.dedPaymentId] = r2((m[t.dedPaymentId] || 0) + num(t.customerDeduction));
  }
  return m;
}
export function openDeductions(payments, trips, companyId) {
  const rec = recoveredByPayment(trips);
  const out = [];
  for (const p of payments || []) {
    if (p.kind !== "company_received" || num(p.deduction) <= 0) continue;
    if (companyId && p.companyId !== companyId) continue;
    const open = r2(num(p.deduction) - (rec[p.id] || 0));
    if (open > 0) out.push({ payment: p, deducted: num(p.deduction), recovered: rec[p.id] || 0, open });
  }
  return out;
}

// ── Repricing when a rate is added or changed ────────────────────────────────
// scope = {kind:"company", companyId, materialId, from}
//       | {kind:"customer", customerId, materialId, companyId, from}
// Every entry made on or after `from` that matches is re-priced to the rate that
// now applies on its own entry date. Returns [{trip, patch}] for changed trips only.
export function repriceTrips(trips, companyRates, customerRates, scope) {
  const out = [];
  for (const t of trips || []) {
    if ((t.entryDate || "") < scope.from) continue;
    let patch = null;
    if (scope.kind === "company") {
      if (t.companyId !== scope.companyId || t.materialId !== scope.materialId) continue;
      const r = companyRateFor(companyRates, t.companyId, t.materialId, t.entryDate);
      if (r && num(r.rate) !== num(t.companyRate)) patch = { companyRate: num(r.rate) };
    } else {
      if (t.customerId !== scope.customerId || t.materialId !== scope.materialId || t.companyId !== scope.companyId) continue;
      const r = customerRateFor(customerRates, t.customerId, t.materialId, t.companyId, t.entryDate);
      if (r && num(r.rate) !== num(t.customerRate)) patch = { customerRate: num(r.rate) };
    }
    if (!patch) continue;
    const next = { ...t, ...patch };
    const a = computeAmounts({
      tons: next.tons, companyRate: next.companyRate, customerRate: next.customerRate,
      loanDeduction: next.loanDeduction, customerDeduction: next.customerDeduction,
    });
    out.push({ trip: t, patch: { ...patch, companyAmount: a.companyAmount, customerAmount: a.customerAmount, netPayable: a.netPayable } });
  }
  return out;
}

// ── Ledgers ──────────────────────────────────────────────────────────────────
const KIND_ORDER = { Opening: 0, Trip: 1, Received: 2, Deduction: 3, Paid: 2, "Loan given": 1, Recovered: 2, Deducted: 1 };
const sortRows = rows => rows
  .map((r, i) => ({ r, i }))
  .sort((a, b) => (a.r.date || "").localeCompare(b.r.date || "")
    || (KIND_ORDER[a.r.kind] ?? 9) - (KIND_ORDER[b.r.kind] ?? 9)
    || (a.r.ts || 0) - (b.r.ts || 0) || a.i - b.i)
  .map(x => x.r);

// Adds a running balance, applies the date window and, if the window starts
// after the first row, a "Balance brought forward" row.
function finish(rows, { from, to } = {}) {
  const sorted = sortRows(rows);
  let run = 0;
  const withBal = sorted.map(r => { run = r2(run + r.amount); return { ...r, balance: run }; });
  let bf = 0;
  let visible = withBal;
  if (from) {
    const before = withBal.filter(r => (r.date || "") < from);
    bf = before.length ? before[before.length - 1].balance : 0;
    visible = withBal.filter(r => (r.date || "") >= from);
  }
  if (to) visible = visible.filter(r => (r.date || "") <= to);
  const balance = visible.length ? visible[visible.length - 1].balance : (from ? bf : 0);
  const rowsOut = from && bf !== 0
    ? [{ date: from, kind: "Opening", detail: "Balance brought forward", amount: bf, balance: bf }, ...visible]
    : visible;
  return { rows: rowsOut, balance: r2(balance), total: r2(run) };
}
const matchesOpt = (value, filter) => !filter || value === filter;

export function customerLedger(data, customerId, f = {}) {
  const rows = [];
  for (const o of data.openings || []) {
    if (o.partyType !== "customer" || o.partyId !== customerId) continue;
    if (!matchesOpt(o.companyId, f.companyId) || !matchesOpt(o.materialId, f.materialId)) continue;
    rows.push({ date: o.asOf, kind: "Opening", companyId: o.companyId || "", materialId: o.materialId || "", detail: "Opening balance", amount: num(o.amount), ts: o.ts });
  }
  for (const t of data.trips || []) {
    if (t.customerId !== customerId) continue;
    if (!matchesOpt(t.companyId, f.companyId) || !matchesOpt(t.materialId, f.materialId)) continue;
    rows.push({
      date: t.entryDate, kind: "Trip", companyId: t.companyId, materialId: t.materialId, tripId: t.id, truckNo: t.truckNo,
      tons: num(t.tons), rate: num(t.customerRate), gross: num(t.customerAmount), loan: num(t.loanDeduction), deduction: num(t.customerDeduction),
      amount: num(t.netPayable), ts: t.ts,
    });
  }
  for (const p of data.payments || []) {
    if (p.kind !== "customer_paid" || p.customerId !== customerId) continue;
    if (!matchesOpt(p.companyId, f.companyId) || !matchesOpt(p.materialId, f.materialId)) continue;
    rows.push({ date: p.date, kind: "Paid", companyId: p.companyId, materialId: p.materialId, payId: p.id, detail: [p.mode, p.note].filter(Boolean).join(" · "), amount: -num(p.amount), ts: p.ts });
  }
  return finish(rows, f);
}

export function companyLedger(data, companyId, f = {}) {
  const rows = [];
  for (const o of data.openings || []) {
    if (o.partyType !== "company" || o.partyId !== companyId) continue;
    if (!matchesOpt(o.materialId, f.materialId)) continue;
    rows.push({ date: o.asOf, kind: "Opening", companyId, materialId: o.materialId || "", detail: "Opening balance", amount: num(o.amount), ts: o.ts });
  }
  for (const t of data.trips || []) {
    if (t.companyId !== companyId || !matchesOpt(t.materialId, f.materialId)) continue;
    rows.push({ date: t.entryDate, kind: "Trip", companyId, materialId: t.materialId, tripId: t.id, truckNo: t.truckNo, customerId: t.customerId, tons: num(t.tons), rate: num(t.companyRate), amount: num(t.companyAmount), ts: t.ts });
  }
  for (const p of data.payments || []) {
    if (p.kind !== "company_received" || p.companyId !== companyId || !matchesOpt(p.materialId, f.materialId)) continue;
    rows.push({ date: p.date, kind: "Received", companyId, materialId: p.materialId, payId: p.id, detail: [p.mode, p.note].filter(Boolean).join(" · "), amount: -num(p.amount), ts: p.ts });
    if (num(p.deduction) > 0) rows.push({ date: p.date, kind: "Deduction", companyId, materialId: p.materialId, payId: p.id, detail: p.deductionReason || "Deduction", amount: -num(p.deduction), ts: p.ts });
  }
  return finish(rows, f);
}

// One husk type across all its companies, plus a balance per company.
export function materialLedger(data, materialId, f = {}) {
  const rows = [];
  const perCompany = {};
  const add = (companyId, amt) => { perCompany[companyId] = r2((perCompany[companyId] || 0) + amt); };
  for (const o of data.openings || []) {
    if (o.partyType !== "company" || o.materialId !== materialId || !matchesOpt(o.partyId, f.companyId)) continue;
    rows.push({ date: o.asOf, kind: "Opening", companyId: o.partyId, materialId, detail: "Opening balance", amount: num(o.amount), ts: o.ts });
    add(o.partyId, num(o.amount));
  }
  for (const t of data.trips || []) {
    if (t.materialId !== materialId || !matchesOpt(t.companyId, f.companyId)) continue;
    rows.push({ date: t.entryDate, kind: "Trip", companyId: t.companyId, materialId, tripId: t.id, truckNo: t.truckNo, customerId: t.customerId, tons: num(t.tons), rate: num(t.companyRate), amount: num(t.companyAmount), ts: t.ts });
    add(t.companyId, num(t.companyAmount));
  }
  for (const p of data.payments || []) {
    if (p.kind !== "company_received" || p.materialId !== materialId || !matchesOpt(p.companyId, f.companyId)) continue;
    rows.push({ date: p.date, kind: "Received", companyId: p.companyId, materialId, payId: p.id, detail: [p.mode, p.note].filter(Boolean).join(" · "), amount: -num(p.amount), ts: p.ts });
    add(p.companyId, -num(p.amount));
    if (num(p.deduction) > 0) {
      rows.push({ date: p.date, kind: "Deduction", companyId: p.companyId, materialId, payId: p.id, detail: p.deductionReason || "Deduction", amount: -num(p.deduction), ts: p.ts });
      add(p.companyId, -num(p.deduction));
    }
  }
  const out = finish(rows, f);
  return { ...out, perCompany };
}

export function vehicleLedger(data, vehicleId, f = {}) {
  const rows = [];
  for (const t of data.trips || []) {
    if (t.vehicleId !== vehicleId) continue;
    rows.push({ date: t.entryDate, kind: "Trip", companyId: t.companyId, materialId: t.materialId, tripId: t.id, customerId: t.customerId, tons: num(t.tons), customerRate: num(t.customerRate), companyRate: num(t.companyRate), amount: num(t.netPayable), ts: t.ts });
  }
  const out = finish(rows, f);
  const tons = out.rows.reduce((s, r) => s + (r.tons || 0), 0);
  return { ...out, tons: r2(tons) };
}

export function loanLedger(data, customerId, f = {}) {
  const rows = [];
  for (const l of data.loans || []) {
    if (l.customerId !== customerId) continue;
    rows.push({ date: l.date, kind: l.kind === "given" ? "Loan given" : "Recovered", detail: l.note || (l.kind === "recovered" ? "Deducted on a trip" : "Husk loan"), tripId: l.tripId || "", amount: l.kind === "given" ? num(l.amount) : -num(l.amount), ts: l.ts });
  }
  return finish(rows, f);
}

export function deductionLedger(data, f = {}) {
  const rows = [];
  for (const p of data.payments || []) {
    if (p.kind !== "company_received" || num(p.deduction) <= 0) continue;
    if (!matchesOpt(p.companyId, f.companyId) || !matchesOpt(p.materialId, f.materialId)) continue;
    rows.push({ date: p.date, kind: "Deducted", companyId: p.companyId, materialId: p.materialId, payId: p.id, detail: p.deductionReason || "Deduction", amount: num(p.deduction), ts: p.ts });
  }
  for (const t of data.trips || []) {
    if (!t.dedPaymentId || num(t.customerDeduction) <= 0) continue;
    if (!matchesOpt(t.companyId, f.companyId) || !matchesOpt(t.materialId, f.materialId)) continue;
    rows.push({ date: t.entryDate, kind: "Recovered", companyId: t.companyId, materialId: t.materialId, tripId: t.id, customerId: t.customerId, payId: t.dedPaymentId, detail: "Recovered through a trip", amount: -num(t.customerDeduction), ts: t.ts });
  }
  const out = finish(rows, f);
  const deducted = r2(out.rows.filter(r => r.kind === "Deducted").reduce((s, r) => s + r.amount, 0));
  const recovered = r2(-out.rows.filter(r => r.kind === "Recovered").reduce((s, r) => s + r.amount, 0));
  return { ...out, deducted, recovered, unrecovered: r2(deducted - recovered) };
}

// ── Profit and KPIs ──────────────────────────────────────────────────────────
// profit = Σ tons × (company rate − customer rate) − company deductions + recovered.
// A company deduction belongs to a company payment, not to a vehicle or a
// customer, so when the view is cut by customer or vehicle only the rate margin
// is shown (deductionsAttributed = false).
export function profitSummary(data, f = {}) {
  const inRange = d => (!f.from || (d || "") >= f.from) && (!f.to || (d || "") <= f.to);
  const cutByParty = !!(f.customerId || f.vehicleId);
  let tons = 0, billed = 0, payable = 0, margin = 0;
  for (const t of data.trips || []) {
    if (!inRange(t.entryDate)) continue;
    if (f.companyId && t.companyId !== f.companyId) continue;
    if (f.materialId && t.materialId !== f.materialId) continue;
    if (f.customerId && t.customerId !== f.customerId) continue;
    if (f.vehicleId && t.vehicleId !== f.vehicleId) continue;
    tons += num(t.tons); billed += num(t.companyAmount); payable += num(t.customerAmount);
    margin += num(t.companyAmount) - num(t.customerAmount);
  }
  let deductions = 0, recovered = 0;
  if (!cutByParty) {
    for (const p of data.payments || []) {
      if (p.kind !== "company_received" || !inRange(p.date)) continue;
      if (f.companyId && p.companyId !== f.companyId) continue;
      if (f.materialId && p.materialId !== f.materialId) continue;
      deductions += num(p.deduction);
    }
    for (const t of data.trips || []) {
      if (!t.dedPaymentId || !inRange(t.entryDate)) continue;
      if (f.companyId && t.companyId !== f.companyId) continue;
      if (f.materialId && t.materialId !== f.materialId) continue;
      recovered += num(t.customerDeduction);
    }
  }
  const profit = r2(margin - deductions + recovered);
  return {
    tons: r2(tons), billed: r2(billed), payable: r2(payable), margin: r2(margin),
    deductions: r2(deductions), recovered: r2(recovered), profit,
    perTon: tons > 0 ? r2(profit / tons) : 0, deductionsAttributed: !cutByParty,
  };
}
export function profitBy(data, dim, f = {}) {
  const key = { company: "companyId", customer: "customerId", material: "materialId", vehicle: "vehicleId" }[dim];
  const ids = [...new Set((data.trips || []).map(t => t[key]).filter(Boolean))];
  return ids.map(id => ({ id, ...profitSummary(data, { ...f, [key]: id }) })).sort((a, b) => b.profit - a.profit);
}

// Totals used by the dashboard tiles: what companies still owe, what is owed to customers.
export function receivableFromCompanies(data) {
  const ids = new Set([...(data.trips || []).map(t => t.companyId), ...(data.openings || []).filter(o => o.partyType === "company").map(o => o.partyId)]);
  let sum = 0;
  ids.forEach(id => { sum += companyLedger(data, id).total; });
  return r2(sum);
}
export function payableToCustomers(data) {
  const ids = new Set([...(data.trips || []).map(t => t.customerId), ...(data.payments || []).filter(p => p.kind === "customer_paid").map(p => p.customerId), ...(data.openings || []).filter(o => o.partyType === "customer").map(o => o.partyId)]);
  let sum = 0;
  ids.forEach(id => { sum += customerLedger(data, id).total; });
  return r2(sum);
}
