// Driver Pay → By Employee.
// RULE (owner, 28 Oct 2026): an employee's balance is the sum of the balance of every trip placed on
// him. No cutoff date, no hand-picked trips — a trip with a balance is always counted.
export const includeInByEmployee = (t) => (t?.balancePlain || 0) > 0;

// The app stores createdAt as "dd/mm/yy, h:mm am" (en-IN short); older/other rows may be ISO.
// Returns "yyyy-mm-dd" or "" when it can't be read.
export const savedDay = (v) => {
  const x = String(v || "").trim();
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
};

const r2 = (x) => Math.round(x * 100) / 100;

// One employee's statement: every trip with a balance, oldest first. total = sum of the rows.
//  payable    = unsettled trips, net of the pouch still held
//  held       = pouch held on unsettled trips (released on confirmation)
//  settledOwed = trips already settled that still owe money
export const employeeStatement = (trips, empId) => {
  const rows = (trips || [])
    .filter((t) => (t.assignedEmpId || "") === (empId || "") && includeInByEmployee(t))
    .map((t) => {
      const full = t.balancePlain || 0;
      const payable = t.driverSettled ? 0 : Math.min(full, t.balance || 0);
      return { id: t.id, lrNo: t.lrNo || "", date: t.date || "", truckNo: t.truckNo || "", balance: r2(full), payable: r2(payable),
        held: t.driverSettled ? 0 : r2(full - payable), settledOwed: t.driverSettled ? r2(full) : 0, settled: !!t.driverSettled };
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.lrNo).localeCompare(String(b.lrNo)));
  const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  return { rows, trips: rows.length, vehicles: new Set(rows.map((r) => r.truckNo).filter(Boolean)).size,
    total: sum("balance"), payable: sum("payable"), held: sum("held"), settledOwed: sum("settledOwed") };
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "₹" + (Math.round((n || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

// Printable statement (open in a window and print / save as PDF). `history` = saved daily balances
// [{date,total,trips}] newest first. Every trip is listed and the total is the sum of the rows.
export const statementHtml = (stmt, { empName = "", company = "", date = "", history = [] } = {}) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(empName)} — Balance statement ${esc(date)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}h1{font-size:18px;margin:0}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#f1f5f9}td.n,th.n{text-align:right}.box{margin-top:10px;padding:8px 10px;background:#f0fdfa;border:1px solid #99f6e4}</style></head><body>
<h1>${esc(company)} — Balance statement</h1>
<div>${esc(empName)} · as on ${esc(date)}</div>
<div class="box"><b>Balance: ${inr(stmt.total)}</b> = ${stmt.trips} trip${stmt.trips === 1 ? "" : "s"} on ${stmt.vehicles} vehicle${stmt.vehicles === 1 ? "" : "s"}<br>
Payable now ${inr(stmt.payable)} · Pouch held until confirmation ${inr(stmt.held)} · Marked settled but still owed ${inr(stmt.settledOwed)}</div>
<table><tr><th>#</th><th>Date</th><th>LR</th><th>Vehicle</th><th>Status</th><th class="n">Balance</th></tr>
${stmt.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.date)}</td><td>${esc(r.lrNo)}</td><td>${esc(r.truckNo)}</td><td>${r.settled ? "Settled, still owed" : r.held > 0 ? "Open (pouch held " + inr(r.held) + ")" : "Open"}</td><td class="n">${inr(r.balance)}</td></tr>`).join("")}
<tr><th colspan="5">Total</th><th class="n">${inr(stmt.total)}</th></tr></table>
${history.length ? `<h3>Balance saved each day</h3><table><tr><th>Date</th><th class="n">Trips</th><th class="n">Balance</th></tr>${history.map((h) => `<tr><td>${esc(h.date)}</td><td class="n">${h.trips}</td><td class="n">${inr(h.total)}</td></tr>`).join("")}</table>` : ""}
</body></html>`;
