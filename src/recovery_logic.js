// Recovery tab: everything an employee still has to recover, in one place.
//   - vehicle loans (owner-level netting, clamped once — same rule as ownerLoanStatus in App.jsx)
//   - vehicle shortage (per vehicle, never negative — same as the shortage dashboard)
//   - the employee's own loan (employee.loan - employee.loanRecovered)
//   - wallet (signed current balance; negative = employee owes the company)
// A truck belongs to an employee when a loan entry on it is linked to him, or most of the truck's trips are assigned to him.
// Pure functions only: the screen and the PDF both read this, so they cannot disagree.

export const normTruck = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const n = x => +x || 0;
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = x => Math.round(n(x)).toLocaleString("en-IN");

export const walletBalanceOf = (cashTransfers, empId) =>
  (cashTransfers || []).filter(t => t.empId === empId && t.type !== "salary" && t.type !== "tafal").reduce((s, t) => s + n(t.amount), 0);

const hasLedger = v => n(v.loan) > 0 || n(v.loanRecovered) > 0 || (v.loanTxns || []).length > 0 || (v.shortageTxns || []).length > 0 || n(v.shortageOwed) > 0;

// Trucks that carry a loan/shortage ledger and belong to this employee, with the evidence for each.
export function candidateTrucks({ empId, vehicles, trips }) {
  const tally = new Map();
  for (const t of trips || []) {
    const k = normTruck(t.truckNo);
    if (!k) continue;
    const c = tally.get(k) || { him: 0, total: 0 };
    c.total++;
    if (t.assignedEmpId === empId) c.him++;
    tally.set(k, c);
  }
  const out = [];
  for (const v of vehicles || []) {
    if (!hasLedger(v)) continue;
    const c = tally.get(normTruck(v.truckNo)) || { him: 0, total: 0 };
    const given = (v.loanTxns || []).filter(x => x.type === "given");
    const linkedLoan = given.filter(x => x.empId === empId).reduce((s, x) => s + n(x.amount), 0);
    const linkedOther = given.filter(x => x.empId && x.empId !== empId).reduce((s, x) => s + n(x.amount), 0);
    const majority = c.total > 0 && c.him * 2 > c.total;
    if (!(linkedLoan > 0) && !majority) continue;
    const reasons = [];
    if (linkedLoan > 0) reasons.push("loan linked to him");
    if (majority) reasons.push("most trips his");
    out.push({ vehicle: v, tripsHim: c.him, tripsTotal: c.total, linkedLoan, linkedOther, reasons });
  }
  return out.sort((a, b) => String(a.vehicle.truckNo).localeCompare(String(b.vehicle.truckNo)));
}

const shortageOf = v => {
  const tx = v.shortageTxns || [];
  if (!tx.length) return { owed: n(v.shortageOwed), recovered: n(v.shortageRecovered) };
  return {
    owed: tx.filter(x => x.type !== "recovery").reduce((s, x) => s + n(x.amount), 0),
    recovered: tx.filter(x => x.type === "recovery").reduce((s, x) => s + n(x.amount), 0),
  };
};

export function buildRecovery({ empId, employees, vehicles, trips, cashTransfers, excluded = new Set() }) {
  const emp = (employees || []).find(e => e.id === empId) || null;
  const all = candidateTrucks({ empId, vehicles, trips });
  const included = all.filter(c => !excluded.has(c.vehicle.id));

  const trucks = included.map(c => {
    const v = c.vehicle;
    const loanGiven = n(v.loan);
    const loanRecovered = (v.loanTxns || []).filter(x => x.type === "recovery").reduce((s, x) => s + n(x.amount), 0);
    const sh = shortageOf(v);
    return {
      id: v.id, truckNo: v.truckNo, ownerName: (v.ownerName || "").trim(),
      tripsHim: c.tripsHim, tripsTotal: c.tripsTotal, reasons: c.reasons, linkedOther: c.linkedOther,
      loanGiven, loanRecovered, loanNet: loanGiven - loanRecovered,
      shortageOwed: sh.owed, shortageRecovered: sh.recovered, shortagePending: Math.max(0, sh.owed - sh.recovered),
      loanTxns: v.loanTxns || [], shortageTxns: v.shortageTxns || [],
    };
  });

  // owner groups: loan is netted across the owner's included trucks and clamped once
  const groups = new Map();
  trucks.forEach((t, i) => {
    const key = t.ownerName ? "o:" + t.ownerName.toLowerCase() : "v:" + t.id;
    if (!groups.has(key)) groups.set(key, { owner: t.ownerName || t.truckNo, trucks: [] });
    groups.get(key).trucks.push(t);
  });
  const owners = [...groups.values()].map(g => {
    const given = g.trucks.reduce((s, t) => s + t.loanGiven, 0);
    const recovered = g.trucks.reduce((s, t) => s + t.loanRecovered, 0);
    const net = given - recovered;
    return { owner: g.owner, trucks: g.trucks, loanGiven: given, loanRecovered: recovered,
      loanPending: Math.max(0, net), overRecovered: Math.max(0, -net),
      shortagePending: g.trucks.reduce((s, t) => s + t.shortagePending, 0) };
  }).sort((a, b) => a.owner.localeCompare(b.owner));

  const vehicleLoanPending = owners.reduce((s, o) => s + o.loanPending, 0);
  const rawTruckLoanSum = trucks.reduce((s, t) => s + t.loanNet, 0);
  const shortagePending = trucks.reduce((s, t) => s + t.shortagePending, 0);
  const empLoanGiven = emp ? n(emp.loan) : 0, empLoanRecovered = emp ? n(emp.loanRecovered) : 0;
  const empLoanPending = Math.max(0, empLoanGiven - empLoanRecovered);
  const walletBalance = walletBalanceOf(cashTransfers, empId);
  const walletOwed = Math.max(0, -walletBalance);

  return {
    emp, trucks, owners, excludedCount: all.length - included.length, candidateCount: all.length,
    empLoan: { given: empLoanGiven, recovered: empLoanRecovered, pending: empLoanPending, txns: emp?.loanTxns || [] },
    wallet: { balance: walletBalance, owed: walletOwed },
    totals: {
      vehicleLoanPending, rawTruckLoanSum, ownerNettingAdjustment: vehicleLoanPending - rawTruckLoanSum,
      shortagePending, empLoanPending, walletOwed,
      grand: vehicleLoanPending + shortagePending + empLoanPending + walletOwed,
    },
  };
}

const TH = "background:#e5e7eb";
const th = (...c) => `<tr>${c.map(x => `<th>${esc(x)}</th>`).join("")}</tr>`;

export function recoveryReportHtml(r, { groupBy = "vehicle", company = "", date = "" } = {}) {
  const name = r.emp?.name || "Employee";
  const T = r.totals;
  const note = t => (t.reasons.join(", ") + ` (${t.tripsHim}/${t.tripsTotal} trips his)`) + (t.linkedOther > 0 ? ` · ₹${inr(t.linkedOther)} of loan linked to another employee` : "");

  const vehicleRows = r.trucks.map(t =>
    `<tr class="v"><td>${esc(t.truckNo)}</td><td>${esc(t.ownerName)}</td><td class="n">${inr(t.loanGiven)}</td><td class="n">${inr(t.loanRecovered)}</td><td class="n">${inr(t.loanNet)}</td><td class="n">${inr(t.shortageOwed)}</td><td class="n">${inr(t.shortageRecovered)}</td><td class="n">${inr(t.shortagePending)}</td><td>${esc(note(t))}</td></tr>`).join("");
  const ownerRows = r.owners.map(o =>
    `<tr class="o"><td>${esc(o.owner)}</td><td>${esc(o.trucks.map(t => t.truckNo).join(", "))}</td><td class="n">${inr(o.loanGiven)}</td><td class="n">${inr(o.loanRecovered)}</td><td class="n">${inr(o.loanPending)}</td><td class="n">${inr(o.shortagePending)}</td><td>${o.overRecovered > 0 ? "Over-recovered ₹" + inr(o.overRecovered) : ""}</td></tr>`).join("");

  const loanTable = groupBy === "owner"
    ? `<h3>Vehicle loans &amp; shortage — owner-wise</h3><table><thead>${th("Owner", "Trucks", "Loan given", "Loan recovered", "Loan pending", "Shortage pending", "Note")}</thead><tbody>${ownerRows || `<tr><td colspan="7">No vehicles</td></tr>`}</tbody>
       <tfoot><tr><td colspan="4">Total</td><td class="n">${inr(T.vehicleLoanPending)}</td><td class="n">${inr(T.shortagePending)}</td><td></td></tr></tfoot></table>`
    : `<h3>Vehicle loans &amp; shortage — vehicle-wise</h3><table><thead>${th("Truck", "Owner", "Loan given", "Loan recovered", "Loan net", "Shortage", "Shortage rec.", "Shortage pending", "Why listed")}</thead><tbody>${vehicleRows || `<tr><td colspan="9">No vehicles</td></tr>`}</tbody>
       <tfoot><tr><td colspan="4">Sum of trucks</td><td class="n">${inr(T.rawTruckLoanSum)}</td><td colspan="2"></td><td class="n">${inr(T.shortagePending)}</td><td></td></tr>
       ${T.ownerNettingAdjustment !== 0 ? `<tr><td colspan="4">Owner netting (over-recovery on one truck offsets the owner's other trucks)</td><td class="n">+${inr(T.ownerNettingAdjustment)}</td><td colspan="4"></td></tr>` : ""}
       <tr><td colspan="4">Vehicle loan pending</td><td class="n">${inr(T.vehicleLoanPending)}</td><td colspan="4"></td></tr></tfoot></table>`;

  const el = r.empLoan;
  const empLoanRows = el.txns.map(x => `<tr><td>${esc(String(x.date || "").slice(0, 10))}</td><td>${esc(x.type)}</td><td class="n">${x.type === "recovery" ? "-" : ""}${inr(x.amount)}</td><td>${esc(x.note || x.remark || "")}</td></tr>`).join("");
  const empLoanTable = `<h3>${esc(name)}'s own loan</h3><table><thead>${th("Date", "Type", "Amount", "Note")}</thead><tbody>${empLoanRows || `<tr><td colspan="4">No entries</td></tr>`}</tbody>
    <tfoot><tr><td colspan="2">Given ${inr(el.given)} · Recovered ${inr(el.recovered)}</td><td class="n">${inr(el.pending)}</td><td>pending</td></tr></tfoot></table>`;

  const w = r.wallet;
  const walletTable = `<h3>Wallet</h3><table><tbody><tr><td>Current wallet balance</td><td class="n">${w.balance < 0 ? "-" : ""}${inr(Math.abs(w.balance))}</td><td>${w.balance < 0 ? "Employee owes the company" : w.balance > 0 ? "Employee holds company cash (not counted as pending)" : "Nil"}</td></tr>
    <tr><td><b>Wallet pending (owed)</b></td><td class="n"><b>${inr(w.owed)}</b></td><td></td></tr></tbody></table>`;

  const summary = `<h3>Total pending recovery</h3><table><tbody>
    <tr><td>Vehicle loans</td><td class="n">${inr(T.vehicleLoanPending)}</td></tr>
    <tr><td>Vehicle shortage</td><td class="n">${inr(T.shortagePending)}</td></tr>
    <tr><td>${esc(name)}'s own loan</td><td class="n">${inr(T.empLoanPending)}</td></tr>
    <tr><td>Wallet owed</td><td class="n">${inr(T.walletOwed)}</td></tr>
    <tr class="g"><td>GRAND TOTAL PENDING</td><td class="n">${inr(T.grand)}</td></tr></tbody></table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recovery — ${esc(name)}</title><style>
body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h2{margin:0 0 4px}h3{margin:16px 0 4px;font-size:13px}.sub{color:#555;margin-bottom:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{${TH}}.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:bold;background:#f5f5f5}tr.g td{font-size:13px;background:#fde68a;font-weight:bold}@media print{body{margin:6mm}}</style></head><body onload="window.print()">
<h2>${esc(company)} — Pending recovery: ${esc(name)}</h2>
<div class="sub">${r.trucks.length} vehicle${r.trucks.length === 1 ? "" : "s"} included${r.excludedCount ? `, ${r.excludedCount} excluded` : ""}${date ? " · " + esc(date) : ""} · amounts in ₹</div>
${summary}${loanTable}${empLoanTable}${walletTable}
</body></html>`;
}
