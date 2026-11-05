// By Employee "Recover Against Loan/Wallet": what each target allows.
//  - loan   : capped at the loan still due
//  - wallet : allowed in every case (balance negative, zero or positive); the selected vehicle balances are settled and
//             credited to the employee's wallet, so the wallet balance goes up by exactly that total. No cap.
export const recoverCapFor = (target, loanBal) => (target === "loan" ? Math.max(0, +loanBal || 0) : Infinity);
export const recoverOk = (target, loanBal, total) => total > 0 && total <= recoverCapFor(target, loanBal);
export const walletAfter = (walletBal, total) => (+walletBal || 0) + (+total || 0);
export const defaultTarget = loanBal => ((+loanBal || 0) > 0 ? "loan" : "wallet");
