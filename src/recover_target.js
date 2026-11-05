// By Employee "Recover Against Loan/Wallet": what each target allows.
//  - loan   : capped at the loan still due
//  - wallet : the ticked vehicle balances are settled and the wallet moves TOWARD ZERO by exactly that total:
//             wallet negative (employee owes the company) -> credited, e.g. -3000 + 1000 = -2000
//             wallet positive (employee holds company cash) -> debited, e.g. +1176 - 1000 = +176
//             The total may be larger than the wallet, in which case the wallet crosses zero (owner's choice).
//             With a wallet of exactly 0 there is nothing to reduce, so the wallet target is not allowed.
export const walletDelta = (walletBal, total) => ((+walletBal || 0) < 0 ? +total || 0 : -(+total || 0));
export const walletAfter = (walletBal, total) => (+walletBal || 0) + ((+walletBal || 0) === 0 ? 0 : walletDelta(walletBal, total));
export const recoverCapFor = (target, loanBal) => (target === "loan" ? Math.max(0, +loanBal || 0) : Infinity);
export const recoverOk = (target, loanBal, total, walletBal = 0) =>
  total > 0 && total <= recoverCapFor(target, loanBal) && (target !== "wallet" || (+walletBal || 0) !== 0);
export const defaultTarget = loanBal => ((+loanBal || 0) > 0 ? "loan" : "wallet");
