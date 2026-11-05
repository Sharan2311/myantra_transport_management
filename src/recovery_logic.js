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
    out.push({ vehicle: v, tripsHim: c.him, tripsTotal: c.total, linkedLoan, linkedOther, majority, reasons });
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

const ownerKeyOf = v => { const o = (v.ownerName || "").trim().toLowerCase(); return o ? "o:" + o : "v:" + v.id; };
const recoveredOf = v => (v.loanTxns || []).filter(x => x.type === "recovery").reduce((s, x) => s + n(x.amount), 0);

// Owner groups. The loan is netted across ALL of the owner's trucks (the app-wide rule, ownerLoanStatus): a loan is given
// against one truck but recovered on whichever truck runs the trip, so judging it truck by truck inflates the balance.
// `vehicles` is every vehicle, so the owner's trucks that are not in this sheet still offset the loan.
// The owner's net is counted under ONE employee (the "carrier", see assignTrucks); in every other sheet it shows as 0 there.
const ownersOf = (trucks, vehicles = null, ctx = {}) => {
  const groups = new Map();
  trucks.forEach(t => {
    const key = t.ownerName ? "o:" + t.ownerName.toLowerCase() : "v:" + t.id;
    if (!groups.has(key)) groups.set(key, { key, owner: t.ownerName || t.truckNo, trucks: [] });
    groups.get(key).trucks.push(t);
  });
  return [...groups.values()].map(g => {
    const inSheet = new Set(g.trucks.map(t => t.id));
    const everyone = vehicles ? vehicles.filter(v => hasLedger(v) && ownerKeyOf(v) === g.key) : [];
    const pool = vehicles ? everyone : g.trucks.map(t => ({ loan: t.loanGiven, loanTxns: [{ type: "recovery", amount: t.loanRecovered }] , id: t.id, truckNo: t.truckNo }));
    const given = pool.reduce((s, v) => s + n(v.loan), 0);
    const recovered = pool.reduce((s, v) => s + recoveredOf(v), 0);
    const net = given - recovered;
    const others = pool.filter(v => !inSheet.has(v.id));
    const othersNet = others.reduce((s, v) => s + n(v.loan) - recoveredOf(v), 0);
    const carrier = ctx.carrier ? (ctx.carrier.get(g.key) ?? null) : undefined;   // undefined = no assignment given: count here
    const counted = !ctx.carrier || carrier === (ctx.empId ?? null);
    return { owner: g.owner, key: g.key, trucks: g.trucks, loanGiven: given, loanRecovered: recovered, loanNet: net,
      loanPending: counted ? Math.max(0, net) : 0, overRecovered: Math.max(0, -net),
      counted, countedUnder: counted ? "" : (ctx.nameOf ? ctx.nameOf(carrier) : "another employee"),
      others: { count: others.length, trucks: others.map(v => v.truckNo), net: othersNet },
      shortagePending: g.trucks.reduce((s, t) => s + t.shortagePending, 0) };
  }).sort((a, b) => a.owner.localeCompare(b.owner));
};

// Each truck is counted under exactly ONE employee. When a truck qualifies for several:
//   1. an employee holding at least half of the truck's loan given as linked loan,
//   2. else the employee with most of the truck's trips (a majority),
//   3. else the most loan linked to him, 4. else the most trips, 5. else the first in the employee list.
// (A small linked entry, e.g. 9,000 of a 4,29,000 loan, must not take a truck that someone else mostly drives.)
// The owner's loan (netted across all his trucks) is carried by one employee: the one holding the most loan given on his
// trucks, else the most trucks; an owner none of whose trucks is assigned goes to "not linked to any employee" (carrier null).
// Returns { owner: Map(vehicleId -> empId), carrier: Map(ownerKey -> empId|null), resolved: [...] }.
export function assignTrucks({ employees, vehicles, trips }) {
  const claims = new Map(); // vehicleId -> [{ empId, name, linked, trips, majority, order }]
  (employees || []).forEach((e, order) => {
    for (const c of candidateTrucks({ empId: e.id, vehicles, trips })) {
      const list = claims.get(c.vehicle.id) || [];
      list.push({ empId: e.id, name: e.name, linked: c.linkedLoan, trips: c.tripsHim, majority: c.majority, order, truckNo: c.vehicle.truckNo, loan: n(c.vehicle.loan) });
      claims.set(c.vehicle.id, list);
    }
  });
  const rank = x => [x.linked > 0 && x.linked * 2 >= x.loan ? 1 : 0, x.majority ? 1 : 0, x.linked, x.trips, -x.order];
  const cmp = (a, b) => { const A = rank(a), B = rank(b); for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return B[i] - A[i]; return 0; };
  const owner = new Map(), resolved = [];
  for (const [vid, list] of claims) {
    const best = [...list].sort(cmp)[0];
    owner.set(vid, best.empId);
    if (list.length > 1) resolved.push({ truckNo: best.truckNo, counted: best.name, also: list.filter(x => x !== best).map(x => x.name) });
  }
  // owner carrier
  const byOwner = new Map(); // ownerKey -> Map(empId -> {loan, count})
  const order = new Map((employees || []).map((e, i) => [e.id, i]));
  for (const v of vehicles || []) {
    const eid = owner.get(v.id);
    if (!eid || !hasLedger(v)) continue;
    const k = ownerKeyOf(v);
    const m = byOwner.get(k) || new Map();
    const cur = m.get(eid) || { loan: 0, count: 0 };
    cur.loan += n(v.loan); cur.count++;
    m.set(eid, cur); byOwner.set(k, m);
  }
  const carrier = new Map();
  for (const [k, m] of byOwner) {
    const best = [...m.entries()].sort((a, b) => b[1].loan - a[1].loan || b[1].count - a[1].count || order.get(a[0]) - order.get(b[0]))[0];
    carrier.set(k, best[0]);
  }
  return { owner, carrier, resolved };
}

export function buildRecovery({ empId, employees, vehicles, trips, cashTransfers, excluded = new Set(), assignment = null }) {
  const emp = (employees || []).find(e => e.id === empId) || null;
  // with an assignment, a truck only shows under the employee it was assigned to
  const all = candidateTrucks({ empId, vehicles, trips }).filter(c => !assignment || assignment.owner.get(c.vehicle.id) === empId);
  const included = all.filter(c => !excluded.has(c.vehicle.id));

  const trucks = included.map(truckRowOf);
  const nameOf = id => (employees || []).find(e => e.id === id)?.name || "another employee";
  const owners = ownersOf(trucks, vehicles || [], { carrier: assignment ? assignment.carrier : null, empId, nameOf });

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

  const vrow = (t, alone) => `<tr class="v"><td>${esc(t.truckNo)}</td><td>${esc(t.ownerName)}</td><td class="n">${inr(t.loanGiven)}</td><td class="n">${inr(t.loanRecovered)}</td><td class="n">${inr(t.loanNet)}${alone ? '<br><span style="color:#777;font-weight:normal">this truck alone</span>' : ""}</td><td class="n">${inr(t.shortageOwed)}</td><td class="n">${inr(t.shortageRecovered)}</td><td class="n">${inr(t.shortagePending)}</td><td>${esc(note(t))}</td></tr>`;
  const vehicleRows = r.owners.map(o => {
    const multi = o.trucks.length > 1 || o.others.count > 0;
    const allCount = o.trucks.length + o.others.count;
    const status = !o.counted ? `Counted under ${esc(o.countedUnder)}, not here` : o.overRecovered > 0 ? "Over-recovered ₹" + inr(o.overRecovered) : "Recovery on any of his trucks offsets the others";
    const sub = multi ? `<tr class="o"><td colspan="2"><b>${esc(o.owner)} — net loan across all ${allCount} truck${allCount > 1 ? "s" : ""}</b></td><td class="n">${inr(o.loanGiven)}</td><td class="n">${inr(o.loanRecovered)}</td><td class="n"><b>${inr(o.loanPending)}</b></td><td colspan="3"></td><td>${status}</td></tr>` : "";
    const other = o.others.count > 0 ? `<tr><td colspan="9" style="color:#92400e">Included in the net above: ${o.others.count} other truck(s) of ${esc(o.owner)} not in this sheet (${esc(o.others.trucks.join(", "))}), net ₹${inr(o.others.net)}.</td></tr>` : "";
    return o.trucks.map(t => vrow(t, multi)).join("") + sub + other;
  }).join("");
  const ownerRows = r.owners.map(o =>
    `<tr class="o"><td>${esc(o.owner)}</td><td>${esc(o.trucks.map(t => t.truckNo).join(", "))}</td><td class="n">${inr(o.loanGiven)}</td><td class="n">${inr(o.loanRecovered)}</td><td class="n">${inr(o.loanPending)}</td><td class="n">${inr(o.shortagePending)}</td><td>${!o.counted ? "Counted under " + esc(o.countedUnder) : o.overRecovered > 0 ? "Over-recovered ₹" + inr(o.overRecovered) : (o.others.count > 0 ? "Net includes " + o.others.count + " other truck(s)" : "")}</td></tr>`).join("");

  const loanTable = groupBy === "owner"
    ? `<h3>Vehicle loans &amp; shortage — owner-wise</h3><table><thead>${th("Owner", "Trucks", "Loan given", "Loan recovered", "Loan pending", "Shortage pending", "Note")}</thead><tbody>${ownerRows || `<tr><td colspan="7">No vehicles</td></tr>`}</tbody>
       <tfoot><tr><td colspan="4">Total</td><td class="n">${inr(T.vehicleLoanPending)}</td><td class="n">${inr(T.shortagePending)}</td><td></td></tr></tfoot></table>`
    : `<h3>Vehicle loans &amp; shortage — vehicle-wise</h3><table><thead>${th("Truck", "Owner", "Loan given", "Loan recovered", "Loan net", "Shortage", "Shortage rec.", "Shortage pending", "Why listed")}</thead><tbody>${vehicleRows || `<tr><td colspan="9">No vehicles</td></tr>`}</tbody>
       <tfoot><tr><td colspan="4">Sum of trucks</td><td class="n">${inr(T.rawTruckLoanSum)}</td><td colspan="2"></td><td class="n">${inr(T.shortagePending)}</td><td></td></tr>
       ${T.ownerNettingAdjustment !== 0 ? `<tr><td colspan="4">Owner netting across all of each owner's trucks (recovery on any truck offsets the others)</td><td class="n">${T.ownerNettingAdjustment < 0 ? "-" : "+"}${inr(Math.abs(T.ownerNettingAdjustment))}</td><td colspan="4"></td></tr>` : ""}
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
  const nameOf = id => (employees || []).find(e => e.id === id)?.name || "another employee";
  const orphanOwners = ownersOf(orphan, vehicles || [], { carrier: asg.carrier, empId: null, nameOf });
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
