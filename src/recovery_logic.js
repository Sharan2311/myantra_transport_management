// Recovery tab: everything an employee still has to recover, in one place.
//   - vehicle loans (owner-level netting, clamped once — same rule as ownerLoanStatus in App.jsx)
//   - vehicle shortage (per vehicle, never negative — same as the shortage dashboard)
//   - the employee's own loan (employee.loan - employee.loanRecovered)
//   - wallet (current balance, counted in full whichever way it points: negative = employee owes the company,
//     positive = employee holds company cash that has to be accounted for)
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

const truckRowOf = c => {
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
};

// owner groups: loan is netted across the owner's trucks and clamped once
const ownersOf = trucks => {
  const groups = new Map();
  trucks.forEach(t => {
    const key = t.ownerName ? "o:" + t.ownerName.toLowerCase() : "v:" + t.id;
    if (!groups.has(key)) groups.set(key, { owner: t.ownerName || t.truckNo, trucks: [] });
    groups.get(key).trucks.push(t);
  });
  return [...groups.values()].map(g => {
    const given = g.trucks.reduce((s, t) => s + t.loanGiven, 0);
    const recovered = g.trucks.reduce((s, t) => s + t.loanRecovered, 0);
    const net = given - recovered;
    return { owner: g.owner, trucks: g.trucks, loanGiven: given, loanRecovered: recovered,
      loanPending: Math.max(0, net), overRecovered: Math.max(0, -net),
      shortagePending: g.trucks.reduce((s, t) => s + t.shortagePending, 0) };
  }).sort((a, b) => a.owner.localeCompare(b.owner));
};

// Each truck is counted under exactly ONE employee. When a truck qualifies for several, the winner is the employee with
// the most loan linked to him on that truck, then the most trips on it, then the first in the employee list.
// Returns { owner: Map(vehicleId -> empId), resolved: [{ truckNo, counted, also: [names] }] }.
export function assignTrucks({ employees, vehicles, trips }) {
  const claims = new Map(); // vehicleId -> [{ empId, name, linked, trips, order }]
  (employees || []).forEach((e, order) => {
    for (const c of candidateTrucks({ empId: e.id, vehicles, trips })) {
      const list = claims.get(c.vehicle.id) || [];
      list.push({ empId: e.id, name: e.name, linked: c.linkedLoan, trips: c.tripsHim, order, truckNo: c.vehicle.truckNo });
      claims.set(c.vehicle.id, list);
    }
  });
  const owner = new Map(), resolved = [];
  for (const [vid, list] of claims) {
    const best = [...list].sort((a, b) => b.linked - a.linked || b.trips - a.trips || a.order - b.order)[0];
    owner.set(vid, best.empId);
    if (list.length > 1) resolved.push({ truckNo: best.truckNo, counted: best.name, also: list.filter(x => x !== best).map(x => x.name) });
  }
  return { owner, resolved };
}

export function buildRecovery({ empId, employees, vehicles, trips, cashTransfers, excluded = new Set(), assignment = null }) {
  const emp = (employees || []).find(e => e.id === empId) || null;
  // with an assignment, a truck only shows under the employee it was assigned to
  const all = candidateTrucks({ empId, vehicles, trips }).filter(c => !assignment || assignment.owner.get(c.vehicle.id) === empId);
  const included = all.filter(c => !excluded.has(c.vehicle.id));

  const trucks = included.map(truckRowOf);
  const owners = ownersOf(trucks);

  const vehicleLoanPending = owners.reduce((s, o) => s + o.loanPending, 0);
  const rawTruckLoanSum = trucks.reduce((s, t) => s + t.loanNet, 0);
  const shortagePending = trucks.reduce((s, t) => s + t.shortagePending, 0);
  const empLoanGiven = emp ? n(emp.loan) : 0, empLoanRecovered = emp ? n(emp.loanRecovered) : 0;
  const empLoanPending = Math.max(0, empLoanGiven - empLoanRecovered);
  const walletBalance = walletBalanceOf(cashTransfers, empId);
  const walletOwed = Math.max(0, -walletBalance);
  const walletCounted = Math.abs(walletBalance);

  return {
    emp, trucks, owners, excludedCount: all.length - included.length, candidateCount: all.length,
    empLoan: { given: empLoanGiven, recovered: empLoanRecovered, pending: empLoanPending, txns: emp?.loanTxns || [] },
    wallet: { balance: walletBalance, owed: walletOwed, counted: walletCounted },
    totals: {
      vehicleLoanPending, rawTruckLoanSum, ownerNettingAdjustment: vehicleLoanPending - rawTruckLoanSum,
      shortagePending, empLoanPending, walletOwed, walletCounted,
      grand: vehicleLoanPending + shortagePending + empLoanPending + walletCounted,
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
  const walletTable = `<h3>Wallet</h3><table><tbody><tr><td>Current wallet balance</td><td class="n">${w.balance < 0 ? "-" : ""}${inr(Math.abs(w.balance))}</td><td>${w.balance < 0 ? "Employee owes the company" : w.balance > 0 ? "Employee holds company cash — counted as pending" : "Nil"}</td></tr>
    <tr><td><b>Wallet counted in total</b></td><td class="n"><b>${inr(w.counted)}</b></td><td></td></tr></tbody></table>`;

  const w0 = r.wallet;
  const summary = `<h3>Total pending recovery</h3><table><tbody>
    <tr><td>Vehicle loans</td><td class="n">${inr(T.vehicleLoanPending)}</td></tr>
    <tr><td>Vehicle shortage</td><td class="n">${inr(T.shortagePending)}</td></tr>
    <tr><td>${esc(name)}'s own loan</td><td class="n">${inr(T.empLoanPending)}</td></tr>
    <tr><td>Wallet balance (${w0.balance < 0 ? "owed by employee" : w0.balance > 0 ? "cash held by employee" : "nil"})</td><td class="n">${inr(T.walletCounted)}</td></tr>
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

// Everyone at once: one row per employee, plus the vehicles that belong to nobody.
// Each truck is counted under one employee only (see assignTrucks); `resolved` lists the trucks that had to be decided.
export function buildRecoveryOverview({ employees, vehicles, trips, cashTransfers, assignment = null }) {
  const asg = assignment || assignTrucks({ employees, vehicles, trips });
  const rows = [];
  for (const e of employees || []) {
    const r = buildRecovery({ empId: e.id, employees, vehicles, trips, cashTransfers, assignment: asg });
    const T = r.totals;
    rows.push({ empId: e.id, name: e.name, trucks: r.trucks.length, vehicleLoan: T.vehicleLoanPending, shortage: T.shortagePending,
      ownLoan: T.empLoanPending, walletBalance: r.wallet.balance, wallet: T.walletCounted, total: T.grand });
  }
  const tripCount = new Map();
  for (const t of trips || []) { const k = normTruck(t.truckNo); if (k) tripCount.set(k, (tripCount.get(k) || 0) + 1); }
  const orphan = (vehicles || []).filter(v => hasLedger(v) && !asg.owner.has(v.id)).map(v => truckRowOf({ vehicle: v, tripsHim: 0, tripsTotal: tripCount.get(normTruck(v.truckNo)) || 0, reasons: ["not linked to any employee"], linkedOther: 0 }));
  const orphanOwners = ownersOf(orphan);
  const unassigned = {
    rows: orphan.sort((a, b) => a.truckNo.localeCompare(b.truckNo)), owners: orphanOwners,
    trucks: orphan.length,
    vehicleLoan: orphanOwners.reduce((s, o) => s + o.loanPending, 0),
    shortage: orphan.reduce((s, t) => s + t.shortagePending, 0),
  };
  unassigned.total = unassigned.vehicleLoan + unassigned.shortage;
  const shown = rows.filter(r => r.total > 0 || r.walletBalance !== 0).sort((a, b) => b.total - a.total);
  const sum = k => shown.reduce((s, r) => s + r[k], 0);
  const totals = { vehicleLoan: sum("vehicleLoan"), shortage: sum("shortage"), ownLoan: sum("ownLoan"), wallet: sum("wallet"), employees: sum("total") };
  totals.withUnassigned = totals.employees + unassigned.total;
  return { rows: shown, unassigned, totals, resolved: asg.resolved };
}

const unassignedTable = o => {
  const u = o.unassigned;
  if (!u.rows.length) return "";
  const body = u.rows.map(t => `<tr><td>${esc(t.truckNo)}</td><td>${esc(t.ownerName)}</td><td class="n">${t.tripsTotal}</td><td class="n">${inr(t.loanGiven)}</td><td class="n">${inr(t.loanRecovered)}</td><td class="n">${inr(t.loanNet)}</td><td class="n">${inr(t.shortageOwed)}</td><td class="n">${inr(t.shortageRecovered)}</td><td class="n">${inr(t.shortagePending)}</td></tr>`).join("");
  return `<h3 style="margin:16px 0 4px;font-size:13px">Vehicles not linked to any employee — details</h3><table><thead><tr><th>Truck</th><th>Owner</th><th>Trips</th><th>Loan given</th><th>Loan recovered</th><th>Loan net</th><th>Shortage</th><th>Shortage rec.</th><th>Shortage pending</th></tr></thead><tbody>${body}</tbody>
  <tfoot><tr><td colspan="5">Pending (loan netted per owner, shortage per truck)</td><td class="n">${inr(u.vehicleLoan)}</td><td colspan="2"></td><td class="n">${inr(u.shortage)}</td></tr></tfoot></table>`;
};

export function recoveryOverviewHtml(o, { company = "", date = "" } = {}) {
  const body = o.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.trucks}</td><td class="n">${inr(r.vehicleLoan)}</td><td class="n">${inr(r.shortage)}</td><td class="n">${inr(r.ownLoan)}</td><td class="n">${r.walletBalance < 0 ? "-" : ""}${inr(Math.abs(r.walletBalance))}</td><td class="n">${inr(r.total)}</td></tr>`).join("");
  const T = o.totals;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recovery — all employees</title><style>
body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h2{margin:0 0 4px}.sub{color:#555;margin-bottom:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#e5e7eb}.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:bold;background:#f5f5f5}tr.g td{background:#fde68a;font-size:13px}@media print{body{margin:6mm}}</style></head><body onload="window.print()">
<h2>${esc(company)} — Pending recovery: all employees</h2><div class="sub">${date ? esc(date) + " · " : ""}amounts in ₹ · wallet shown as current balance (negative = employee owes) and counted in full</div>
<table><thead><tr><th>Employee</th><th>Trucks</th><th>Vehicle loans</th><th>Shortage</th><th>Own loan</th><th>Wallet balance</th><th>Total to recover</th></tr></thead><tbody>${body || `<tr><td colspan="7">Nothing pending</td></tr>`}</tbody>
<tfoot><tr><td>Total (employees)</td><td></td><td class="n">${inr(T.vehicleLoan)}</td><td class="n">${inr(T.shortage)}</td><td class="n">${inr(T.ownLoan)}</td><td class="n">${inr(T.wallet)}</td><td class="n">${inr(T.employees)}</td></tr>
<tr><td>Vehicles not linked to any employee (${o.unassigned.trucks})</td><td></td><td class="n">${inr(o.unassigned.vehicleLoan)}</td><td class="n">${inr(o.unassigned.shortage)}</td><td></td><td></td><td class="n">${inr(o.unassigned.total)}</td></tr>
<tr class="g"><td colspan="6">GRAND TOTAL TO RECOVER</td><td class="n">${inr(T.withUnassigned)}</td></tr></tfoot></table>
${unassignedTable(o)}
${o.resolved.length ? `<p><b>Note:</b> ${o.resolved.length} truck(s) qualified for more than one employee and are counted once, under the employee with the most linked loan, then the most trips: ${esc(o.resolved.map(x => x.truckNo + " → " + x.counted + " (also " + x.also.join(", ") + ")").join("; "))}.</p>` : ""}
</body></html>`;
}
