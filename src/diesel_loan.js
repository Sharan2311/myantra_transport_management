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
  const txn = { id, type: "loan", date, amount: amt, lrNo: "",
    note: `Diesel indent #${req.indentNo} (${req.truckNo}) — extra diesel filled, not loaded. Added to loan by ${by}.` };
  const newVehicle = { ...vehicle,
    loan: (vehicle.loan || 0) + amt - (old ? old.amount || 0 : 0),
    loanTxns: [...(vehicle.loanTxns || []).filter((t) => t.id !== id), txn] };
  const note = loanNoteFor(req, amt);
  const remark = req.remark && !String(req.remark).includes(LOAN_NOTE) ? `${req.remark} | ${note}` : (req.remark && String(req.remark).includes(LOAN_NOTE) ? req.remark : note);
  const newReq = { ...req, loanAdded: true, loanAddedAmount: amt, loanAddedBy: by, loanAddedAt: at, remark };
  return { vehicle: newVehicle, request: newReq, txn };
}
