import assert from "node:assert/strict";
import { includeInByEmployee as inc, employeeStatement, statementHtml } from "../src/byemp_logic.js";
const T = (o) => ({ balancePlain: 700, driverSettled: false, createdAt: "20/10/26, 10:00 am", ...o });
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };
// RULE: employee balance = sum of balance of every trip placed. No cutoff date, no flags.
t("any trip with a balance is included, however old", () => assert.equal(inc(T({ createdAt: "01/01/25, 9:00 am" })), true));
t("settled trip that still owes is included", () => assert.equal(inc(T({ driverSettled: true })), true));
t("unsettled trip with no saved date is included", () => assert.equal(inc(T({ createdAt: undefined })), true));
t("trip with no balance is never included", () => { assert.equal(inc(T({ balancePlain: 0 })), false); assert.equal(inc(T({ balancePlain: 0, driverSettled: true })), false); });
t("rounding dust (less than half a paisa) is not a balance", () => { assert.equal(inc(T({ balancePlain: 3e-12 })), false); assert.equal(inc(T({ balancePlain: 0.004 })), false); assert.equal(inc(T({ balancePlain: 0.01 })), true); });
t("missing balance is not included", () => assert.equal(inc({}), false));

const trips = [
  { id: "a", lrNo: "L1", date: "2026-10-01", truckNo: "KA1", balancePlain: 1000, balance: 300, driverSettled: false, assignedEmpId: "e1" },
  { id: "b", lrNo: "L2", date: "2026-10-02", truckNo: "KA1", balancePlain: 500, balance: 500, driverSettled: true, assignedEmpId: "e1" },
  { id: "c", lrNo: "L3", date: "2026-10-03", truckNo: "KA2", balancePlain: 0, balance: 0, assignedEmpId: "e1" },
  { id: "d", lrNo: "L4", date: "2026-10-03", truckNo: "KA3", balancePlain: 900, balance: 900, assignedEmpId: "e2" },
];
t("statement lists every trip with balance for that employee and the total equals the sum of the rows", () => {
  const s = employeeStatement(trips, "e1");
  assert.equal(s.rows.length, 2);
  assert.equal(s.total, 1500);
  assert.equal(s.total, s.rows.reduce((x, r) => x + r.balance, 0));
  assert.equal(s.trips, 2);
  assert.equal(s.vehicles, 1);
  assert.equal(s.payable, 300);
  assert.equal(s.held, 700);
  assert.equal(s.settledOwed, 500);
  assert.equal(s.payable + s.held + s.settledOwed, s.total);
});
t("statement for an employee with nothing owed is empty", () => { const s = employeeStatement(trips, "zz"); assert.equal(s.total, 0); assert.equal(s.rows.length, 0); });
t("statement rows are oldest first", () => assert.deepEqual(employeeStatement(trips, "e1").rows.map(r => r.lrNo), ["L1", "L2"]));
t("statement html lists every LR, the total, history, and escapes the name", () => {
  const st = employeeStatement(trips, "e1");
  const h = statementHtml(st, { empName: "A<b>&Co", company: "M Yantra", date: "28/10/2026", history: [{ date: "2026-10-27", total: 1200, trips: 2 }] });
  assert.ok(h.includes("L1") && h.includes("L2") && !h.includes("L3") && !h.includes("L4"));
  assert.ok(h.includes("₹1,500"));
  assert.ok(h.includes("A&lt;b&gt;&amp;Co") && !h.includes("A<b>"));
  assert.ok(h.includes("2026-10-27") && h.includes("₹1,200"));
});
console.log(n + " tests passed");
