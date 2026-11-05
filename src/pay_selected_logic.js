// Pay Selected: what is payable on a trip after the owner's "skip" choices.
// Must agree with the Driver Pay screen's balance (tripWithBalance), which HOLDS BACK the party pouch until it is
// released — otherwise the sheet shows more than the amount selected and the held pouch is paid out by mistake.

// Pouch held on a trip: unreleased party trip → its pouch balance, otherwise 0.
export const pouchHoldOf = t => {
  if (typeof t?.pouchHold === "number") return t.pouchHold;
  return (t?.orderType === "party" && !t?.pouchReleased) ? (+t?.pouchBalance || 0) : 0;
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
