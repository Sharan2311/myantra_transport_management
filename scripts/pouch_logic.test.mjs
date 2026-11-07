// Run: node scripts/pouch_logic.test.mjs
import assert from "node:assert/strict";
import { pouchAmountFor, holdAllAmountFor, holdAmountFor } from "../src/pouch_logic.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const veh = { truckNo: "KA28AA9261" };
const emp = (o = {}) => ({ id: "E1", linkedTrucks: ["KA28AA9261"], ...o });
t("default is global setting, else 700", () => {
  assert.equal(pouchAmountFor({ veh, employees: [], settings: {} }), 700);
  assert.equal(pouchAmountFor({ veh, employees: [], settings: { pouchPerTrip: 600 } }), 600);
});
t("vehicle override and vehicle exempt", () => {
  assert.equal(pouchAmountFor({ veh: { ...veh, pouchOverride: 500 }, employees: [], settings: {} }), 500);
  assert.equal(pouchAmountFor({ veh: { ...veh, pouchExempt: true }, employees: [], settings: {} }), 0);
});
t("employee amount via linked truck or assignment beats vehicle override", () => {
  const v = { ...veh, pouchOverride: 500 };
  assert.equal(pouchAmountFor({ veh: v, employees: [emp({ pouchAmount: 900 })], assignedEmpId: "", settings: {} }), 900);
  assert.equal(pouchAmountFor({ veh: { truckNo: "XX" }, employees: [emp({ pouchAmount: 900, linkedTrucks: [] })], assignedEmpId: "E1", settings: {} }), 900);
});
t("vehicle exempt still wins over an employee amount", () => {
  assert.equal(pouchAmountFor({ veh: { ...veh, pouchExempt: true }, employees: [emp({ pouchAmount: 900 })], settings: {} }), 0);
});
t("employee switch ON (exempt) gives 0 even with an amount set", () => {
  assert.equal(pouchAmountFor({ veh, employees: [emp({ pouchAmount: 900, pouchExempt: true })], settings: {} }), 0);
});
t("employee amount blank/null falls back to the normal chain", () => {
  assert.equal(pouchAmountFor({ veh, employees: [emp({ pouchAmount: null })], settings: {} }), 700);
  assert.equal(pouchAmountFor({ veh, employees: [emp({ pouchAmount: "" })], settings: {} }), 700);
});
t("an employee amount of 0 is respected", () => {
  assert.equal(pouchAmountFor({ veh, employees: [emp({ pouchAmount: 0 })], settings: {} }), 0);
});

// ── hold on all vehicles ──
t("hold-all: employee scope 'all' + amount holds on non-party trips of linked trucks", () => {
  const e = emp({ pouchAmount: 1000, holdScope: "all" });
  assert.equal(holdAllAmountFor({ veh, employees: [e] }), 1000);
  assert.equal(holdAmountFor({ orderType: "godown", veh, employees: [e], settings: {} }), 1000);
  assert.equal(holdAmountFor({ orderType: "outbound", veh, employees: [e], settings: {} }), 1000);
});
t("hold-all: party only (default) holds nothing on non-party trips; party unchanged", () => {
  const e = emp({ pouchAmount: 1000 });
  assert.equal(holdAmountFor({ orderType: "godown", veh, employees: [e], settings: {} }), 0);
  assert.equal(holdAmountFor({ orderType: "party", veh, employees: [e], settings: {} }), 1000);
  const e2 = emp({ pouchAmount: 1000, holdScope: "party" });
  assert.equal(holdAmountFor({ orderType: "godown", veh, employees: [e2], settings: {} }), 0);
});
t("hold-all: party trips use the normal chain even when scope is 'all'", () => {
  assert.equal(holdAmountFor({ orderType: "party", veh, employees: [emp({ holdScope: "all" })], settings: {} }), 700);
  assert.equal(holdAmountFor({ orderType: "party", veh, employees: [emp({ holdScope: "all", pouchAmount: 900 })], settings: {} }), 900);
});
t("hold-all: needs an amount; exempt switch and vehicle exempt give 0", () => {
  assert.equal(holdAllAmountFor({ veh, employees: [emp({ holdScope: "all" })] }), 0);
  assert.equal(holdAllAmountFor({ veh, employees: [emp({ holdScope: "all", pouchAmount: "" })] }), 0);
  assert.equal(holdAllAmountFor({ veh, employees: [emp({ holdScope: "all", pouchAmount: 1000, pouchExempt: true })] }), 0);
  assert.equal(holdAllAmountFor({ veh: { ...veh, pouchExempt: true }, employees: [emp({ holdScope: "all", pouchAmount: 1000 })] }), 0);
});
t("hold-all: applies via the assigned employee, and not to trucks of other employees", () => {
  const e = emp({ pouchAmount: 800, holdScope: "all", linkedTrucks: [] });
  assert.equal(holdAllAmountFor({ veh: { truckNo: "ZZ" }, employees: [e], assignedEmpId: "E1" }), 800);
  assert.equal(holdAllAmountFor({ veh: { truckNo: "ZZ" }, employees: [e], assignedEmpId: "" }), 0);
});
console.log(n + " tests passed");
