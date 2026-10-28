// "Previous year loan recovered" memo entries on a vehicle's loan ledger.
// type "recovery_prev" is shown in the ledger but is NOT a "recovery": every total, the owner-level
// balance and the boot self-heal only count type "recovery", so a memo never changes a loan balance.
// The trip itself still carries the deduction (trip.loanRecovery); the strict ledger sync must not
// book that part again, so the memo amount is taken out of what it books.
export const PREV_YEAR_TYPE = "recovery_prev";

export const prevYearMemoFor = (loanTxns, trip) =>
  (loanTxns || [])
    .filter((tx) => tx.type === PREV_YEAR_TYPE && (tx.tripId === trip?.id || (!tx.tripId && trip?.lrNo && tx.lrNo === trip.lrNo)))
    .reduce((s, tx) => s + (+tx.amount || 0), 0);

export const bookableLoanRecovery = (veh, trip) =>
  Math.max(0, (+trip?.loanRecovery || 0) - prevYearMemoFor(veh?.loanTxns, trip));
