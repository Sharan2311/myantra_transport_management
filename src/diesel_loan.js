// Owner action: add a confirmed (not attached) diesel request to the vehicle's loan and keep the request on record.
export const LOAN_NOTE = "Extra diesel filled but not loaded and hence added this amount in loan for vehicle";

export const loanTxnId = (reqId) => `LOAN-DSLREQ-${reqId}`;

export function canAddToLoan(req) {
  if (!req) return "No request";
  if (req.status !== "confirmed") return "Only a confirmed request can be added to the loan";
  if (req.lrNo || req.tripId) return "This request is already attached to an LR";
  if (req.loanAdded) return "Already added to the vehicle loan";
  return "";
}

export const loanNoteFor = (req, amount) =>
  `${LOAN_NOTE} ${String(req.truckNo || "").toUpperCase()} (₹${Number(amount).toLocaleString("en-IN")})`;

// Pure: returns the updated vehicle and request. The loan entry has a stable id, so applying twice never counts twice.
export function applyRequestToLoan(vehicle, req, { amount, by, at, date }) {
  const amt = Math.round(Number(amount) || 0);
  if (!vehicle) throw new Error("Vehicle not found");
  if (!(amt > 0)) throw new Error("Amount must be more than 0");
  const id = loanTxnId(req.id);
  const old = (vehicle.loanTxns || []).find((t) => t.id === id);
  // type "given": the loan screens show only "given" as a loan taken (any other type is shown as a Recovery), and the
  // loan screens show `ref` as the reason, so the extra-diesel message goes there.
  const why = `${LOAN_NOTE} ${String(req.truckNo || "").toUpperCase()} — Indent #${req.indentNo}`;
  const txn = { id, type: "given", date, amount: amt, lrNo: "", ref: why,
    note: `${why}. Added to loan by ${by}.` };
  const newVehicle = { ...vehicle,
    loan: (vehicle.loan || 0) + amt - (old ? old.amount || 0 : 0),
    loanTxns: [...(vehicle.loanTxns || []).filter((t) => t.id !== id), txn] };
  const note = loanNoteFor(req, amt);
  const remark = req.remark && !String(req.remark).includes(LOAN_NOTE) ? `${req.remark} | ${note}` : (req.remark && String(req.remark).includes(LOAN_NOTE) ? req.remark : note);
  const newReq = { ...req, loanAdded: true, loanAddedAmount: amt, loanAddedBy: by, loanAddedAt: at, remark };
  return { vehicle: newVehicle, request: newReq, txn };
}

// Confirmed requests that never got an LR ("not attached"). recovered = the owner added it to the vehicle loan.
// Not recovered first, oldest first, so the ones that need action are at the top.
export function unattachedConfirmed(requests, nowMs = Date.now()) {
  const list = (requests || [])
    .filter((r) => r && r.status === "confirmed" && !r.lrNo && !r.tripId)
    .map((r) => {
      const t = Date.parse(`${r.date}T00:00:00+05:30`);
      const ageDays = Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / 86400000)) : null;
      return { req: r, recovered: r.loanAdded === true, ageDays };
    });
  return list.sort((a, b) => (a.recovered - b.recovered) || ((b.ageDays ?? -1) - (a.ageDays ?? -1)));
}
