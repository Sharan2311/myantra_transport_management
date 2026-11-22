import assert from "node:assert/strict";
import { lastEmployeeForVehicle, normTruck } from "../src/emp_history.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
const t = (o) => ({ id: "t" + Math.random(), truckNo: "KA28AB4580", assignedEmpId: "E1", date: "2026-11-10", lrNo: "LR1", ...o });
const EMPS = new Set(["E1", "E2", "E3"]);

test("normTruck ignores spaces and case", () => assert.equal(normTruck(" ka28 ab4580 "), "KA28AB4580"));
test("vehicle A was with Devendra (E1) on its latest trip -> E1", () => {
  const r = lastEmployeeForVehicle([t({ date: "2026-11-01", assignedEmpId: "E2" }), t({ date: "2026-11-15", assignedEmpId: "E1", lrNo: "LR9" })], "KA28AB4580", EMPS);
  assert.deepEqual(r, { empId: "E1", lrNo: "LR9", date: "2026-11-15" });
});
test("array order does not matter, only the trip date", () => {
  const r = lastEmployeeForVehicle([t({ date: "2026-11-15", assignedEmpId: "E1" }), t({ date: "2026-11-01", assignedEmpId: "E2" })], "KA28AB4580", EMPS);
  assert.equal(r.empId, "E1");
});
test("a brand-new vehicle (no trips) -> null, left for the user", () => assert.equal(lastEmployeeForVehicle([t({ truckNo: "MH12AA1111" })], "KA28AB4580", EMPS), null));
test("other vehicles' trips are ignored", () => {
  assert.equal(lastEmployeeForVehicle([t({ truckNo: "MH12AA1111", assignedEmpId: "E3", date: "2026-11-20" }), t({ assignedEmpId: "E1", date: "2026-11-02" })], "KA28AB4580", EMPS).empId, "E1");
});
test("trips with no employee set are skipped (they are not a decision)", () => {
  assert.equal(lastEmployeeForVehicle([t({ assignedEmpId: "", date: "2026-11-20" }), t({ assignedEmpId: "E2", date: "2026-11-05" })], "KA28AB4580", EMPS).empId, "E2");
});
test("latest trip's employee no longer exists -> null (do not guess an older one)", () => {
  assert.equal(lastEmployeeForVehicle([t({ assignedEmpId: "GONE", date: "2026-11-20" }), t({ assignedEmpId: "E2", date: "2026-11-05" })], "KA28AB4580", EMPS), null);
});
test("truck number spacing/case differences still find the vehicle", () => {
  assert.equal(lastEmployeeForVehicle([t({ truckNo: "ka28 ab4580" })], "KA28AB4580", EMPS).empId, "E1");
});
test("non-ISO dates (old placeholder rows) never win over a real date", () => {
  assert.equal(lastEmployeeForVehicle([t({ date: "01-05-2026", assignedEmpId: "E3" }), t({ date: "2026-11-02", assignedEmpId: "E1" })], "KA28AB4580", EMPS).empId, "E1");
});
test("same date: the later-created trip wins", () => {
  assert.equal(lastEmployeeForVehicle([t({ date: "2026-11-10", assignedEmpId: "E1", createdAt: "2026-11-10T08:00:00Z" }), t({ date: "2026-11-10", assignedEmpId: "E2", createdAt: "2026-11-10T09:00:00Z" })], "KA28AB4580", EMPS).empId, "E2");
});
test("no employee list given -> not validated", () => assert.equal(lastEmployeeForVehicle([t({})], "KA28AB4580", null).empId, "E1"));
test("empty inputs are safe", () => { assert.equal(lastEmployeeForVehicle(null, "X", EMPS), null); assert.equal(lastEmployeeForVehicle([], "", EMPS), null); });
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
