// Pay Selected: what is payable on a trip after the owner's "skip" choices.
// Must agree with the Driver Pay screen's balance (tripWithBalance), which HOLDS BACK the party pouch until it is
// released — otherwise the sheet shows more than the amount selected and the held pouch is paid out by mistake.

// Amount held on a trip: its pouch balance until released (party trips, and — for employees set to hold on all
// vehicles — any trip that was saved with a hold), otherwise 0.
export const pouchHoldOf = t => {
  if (typeof t?.pouchHold === "number") return t.pouchHold;
  return !t?.pouchReleased ? (+t?.pouchBalance || 0) : 0;
};

export function payableAfterSkips(t, s = {}) {
  const deducts = (+t.advance || 0) + (+t.tafal || 0)
    + (s.diesel ? 0 : (+t.dieselEstimate || 0))
    + ((+t.shortage || 0) * (+t.givenRate || 0))
    + (s.shortage ? 0 : (+t.shortageRecovery || 0))
    + (s.loan ? 0 : (+t.loanRecovery || 0))
    + pouchHoldOf(t);
  const netDue = Math.max(0, (+t.gross || 0) - deducts);
  return { netDue, payable: Math.max(0, netDue - (+t.paidSoFar || 0)) };
}

// By Employee "select trips to pay": a trip can be ticked when money is still payable now and it is not already settled
// (same rule as the Unpaid list). Select-all picks exactly those; the total is what the Pay Selected sheet will start from.
export const payEligible = trips => (trips || []).filter(t => (+t.balance || 0) > 0 && !t.driverSettled);
export const paySelectionTotal = (trips, selectedIds) =>
  payEligible(trips).filter(t => selectedIds.has(t.id)).reduce((s, t) => s + (+t.balance || 0), 0);
export const payOrder = trips => [...(trips || [])].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || "").localeCompare(b.createdAt || ""));

// ── Pay Selected with loan / wallet reduction ────────────────────────────────────────────────────────────────
// The ticked trips' total is settled partly by reducing the employee's loan and/or wallet and the rest by bank
// (the bank part carries the reference ID). Everything is allocated oldest trip first; the reductions are
// taken from the oldest trips first and the bank part covers what is left of each trip.
const r2 = x => Math.round(x * 100) / 100;

// items: [{ id, payable }] oldest first -> { alloc: {id: amount}, unallocated }
export function allocateTotal(items, total) {
  const alloc = {}; let rem = r2(+total || 0);
  for (const it of items || []) {
    const a = r2(Math.min(rem, +it.payable || 0));
    if (a > 0) { alloc[it.id] = a; rem = r2(rem - a); }
  }
  return { alloc, unallocated: rem };
}

// alloc: {id: amount}; order: ids oldest first; reduction: total taken by loan+wallet
// -> { red: {id: amount}, bank: {id: amount} } with red+bank == alloc per trip
export function splitReduction(alloc, order, reduction) {
  const red = {}, bank = {}; let rem = r2(+reduction || 0);
  for (const id of order || []) {
    const a = alloc[id] || 0;
    if (!(a > 0)) continue;
    const rd = r2(Math.min(rem, a));
    rem = r2(rem - rd);
    if (rd > 0) red[id] = rd;
    if (r2(a - rd) > 0) bank[id] = r2(a - rd);
  }
  return { red, bank };
}

// Checks the loan / wallet reduction lines. walletBal: signed, negative = employee owes the company.
export function reductionCheck({ loanDue, walletBal, loanRed, walletRed, settle, totalPayable }) {
  const errors = [];
  const lr = +loanRed || 0, wr = +walletRed || 0;
  if (lr < 0 || wr < 0) errors.push("Reductions can't be negative.");
  if (lr > (+loanDue || 0) + 0.005) errors.push("Loan reduction is more than the loan due.");
  if (wr > 0 && (+walletBal || 0) === 0) errors.push("Wallet balance is 0 — there is nothing to reduce.");
  if (settle > totalPayable + 0.5) errors.push("Bank amount plus reductions is more than the ticked trips need.");
  return { ok: errors.length === 0, errors };
}
