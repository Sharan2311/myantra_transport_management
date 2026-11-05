// "Find a payment": given a bank reference / screenshot details, say where (if anywhere) it is recorded.
// Read-only and pure — no network, no React — so it can be unit-tested.
//
// Records come from: vehicle loan + shortage ledgers, employee loans, wallet/cash transfers,
// driver payments, payment requests.
//  - exact    : a reference (any of the ones given, 8+ chars) appears in the record's own reference fields
//  - possible : no exact match anywhere, same amount AND date within 3 days (+ name overlap ranks higher)

export const normRef = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const MIN_REF = 8;
const DATE_WINDOW_DAYS = 3;
const KIND_LABEL = {
  vehicle_loan: "Vehicle loan",
  vehicle_shortage: "Vehicle shortage ledger",
  employee_loan: "Employee loan",
  cash_transfer: "Wallet / cash transfer",
  driver_payment: "Driver payment",
  payment_request: "Payment request",
};

const rec = (kind, p) => ({ kind, label: KIND_LABEL[kind], refs: [], name: "", note: "", ...p });

export function buildRecords(data = {}) {
  const out = [];
  for (const v of data.vehicles || []) {
    for (const x of v.loanTxns || []) {
      out.push(rec("vehicle_loan", {
        id: x.id, amount: +x.amount || 0, date: x.date || "", refs: [x.ref, x.note],
        name: `${v.ownerName || ""} ${v.truckNo || ""}`,
        where: `Vehicle ${v.truckNo} (${v.ownerName || "no owner"}) → loan ledger · ${x.type || ""}`,
      }));
    }
    for (const x of v.shortageTxns || []) {
      out.push(rec("vehicle_shortage", {
        id: x.id, amount: +x.amount || 0, date: x.date || "", refs: [x.ref, x.note],
        name: `${v.ownerName || ""} ${v.truckNo || ""}`,
        where: `Vehicle ${v.truckNo} (${v.ownerName || "no owner"}) → shortage ledger · ${x.type || ""}`,
      }));
    }
  }
  for (const e of data.employees || []) {
    for (const x of e.loanTxns || []) {
      out.push(rec("employee_loan", {
        id: x.id, amount: +x.amount || 0, date: x.date || "", refs: [x.ref, x.note],
        name: e.name || "",
        where: `Employee ${String(e.name || "").trim()} → employee loan · ${x.type || ""}`,
      }));
    }
  }
  for (const c of data.cashTransfers || []) {
    out.push(rec("cash_transfer", {
      id: c.id, amount: +c.amount || 0, date: c.date || "", refs: [c.utr, c.ref],
      name: c.note || "",
      where: `Wallet / cash transfer (${c.type || "transfer"})${c.lrNo ? " · LR " + c.lrNo : ""}${c.note ? " · " + c.note : ""}`,
    }));
  }
  for (const d of data.driverPayments || []) {
    out.push(rec("driver_payment", {
      id: d.id, amount: +d.amount || 0, date: d.date || "", refs: [d.utr, d.notes],
      name: d.paidTo || "",
      where: `Driver payment · LR ${d.lrNo || "?"} · ${d.truckNo || ""}${d.paidTo ? " · paid to " + d.paidTo : ""}`,
    }));
  }
  for (const r of data.paymentRequests || []) {
    out.push(rec("payment_request", {
      id: r.id, amount: +r.amount || 0, date: String(r.paidAt || r.createdAt || "").slice(0, 10), refs: [r.notes],
      name: r.recipientName || "",
      where: `Payment request (${r.status || "?"}) · LR ${r.lrNo || "?"} · ${r.truckNo || ""}${r.recipientName ? " · " + r.recipientName : ""}`,
    }));
  }
  return out;
}

const dayNum = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
};

const nameTokens = s => String(s || "").toUpperCase().split(/[^A-Z]+/).filter(w => w.length >= 3 && !["MD", "MR", "MRS", "SRI", "SHRI", "THE"].includes(w));

export function findPayment(query = {}, data = {}) {
  const records = buildRecords(data);
  const refs = (query.refs || []).map(normRef).filter(r => r.length >= MIN_REF);
  const exact = [];
  if (refs.length) {
    for (const r of records) {
      const hay = r.refs.map(normRef).filter(Boolean);
      if (refs.some(q => hay.some(h => h.includes(q) || (h.length >= MIN_REF && q.includes(h))))) exact.push({ ...r, reasons: ["reference"] });
    }
  }
  if (exact.length) return { exact, possible: [] };

  const possible = [];
  const amount = +query.amount || 0;
  const qd = dayNum(query.date);
  if (amount > 0 && qd !== null) {
    const qn = nameTokens(query.name);
    for (const r of records) {
      if (Math.abs(r.amount - amount) > 0.5) continue;
      const rd = dayNum(r.date);
      if (rd === null || Math.abs(rd - qd) > DATE_WINDOW_DAYS) continue;
      const reasons = ["amount", "date"];
      const rn = nameTokens(r.name);
      if (qn.length && qn.some(w => rn.includes(w))) reasons.push("name");
      possible.push({ ...r, reasons });
    }
    possible.sort((a, b) => b.reasons.length - a.reasons.length
      || Math.abs(dayNum(a.date) - qd) - Math.abs(dayNum(b.date) - qd));
  }
  return { exact: [], possible };
}
