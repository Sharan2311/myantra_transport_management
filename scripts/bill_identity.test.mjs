import assert from "node:assert/strict";
import { normReceipt, last4, billsDiffer, receiptClashes, normNozzle, receiptLabel } from "../src/bill_identity.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
// the two real bills from the pump: SAME receipt number K0596, different vehicle / amount / date
const A = { receiptNo: "K0596", vehicleNo: "5499", amount: 15396, date: "2026-11-21" };
const B = { receiptNo: "K0596", vehicleNo: "8840", amount: 10000, date: "2026-11-20" };
const reqOf = (o) => ({ id: "r" + (o.indentNo || 1), indentNo: 1, truckNo: "TS07UH5499", receiptNo: "K0596", extractedVehicleNo: "5499", extractedAmount: 15396, extractedDate: "2026-11-21", ...o });

test("normalisers", () => { assert.equal(normReceipt(" k0596 "), "K0596"); assert.equal(last4("TS07UH5499"), "5499"); assert.equal(last4("5499"), "5499"); assert.equal(last4(""), ""); });
test("different vehicle -> different bills", () => assert.equal(billsDiffer(A, { ...A, vehicleNo: "8840" }), true));
test("different amount -> different bills", () => assert.equal(billsDiffer(A, { ...A, amount: 10000 }), true));
test("same vehicle and amount -> not different (date alone never makes it different)", () => assert.equal(billsDiffer(A, { ...A, date: "2026-11-27" }), false));
test("full number vs last 4 digits is the same vehicle", () => assert.equal(billsDiffer({ vehicleNo: "TS07UH5499", amount: 1 }, { vehicleNo: "5499", amount: 1 }), false));
test("amount 15396 vs '15396.00' is the same amount", () => assert.equal(billsDiffer({ vehicleNo: "1", amount: 15396 }, { vehicleNo: "1", amount: "15396.00" }), false));
test("missing data can never prove two bills different", () => {
  assert.equal(billsDiffer({ vehicleNo: "5499" }, { vehicleNo: "8840" }), true);
  assert.equal(billsDiffer({}, { vehicleNo: "8840", amount: 5 }), false);
  assert.equal(billsDiffer({ vehicleNo: "", amount: null }, { vehicleNo: "8840", amount: 5 }), false);
});
test("THE REAL CASE: K0596 for 8840 vs stored K0596 of 5499 -> no clash, only a notice", () => {
  const r = receiptClashes(B, [reqOf({})], "other");
  assert.equal(r.clash, null); assert.equal(r.notices.length, 1); assert.equal(r.notices[0].indentNo, 1);
});
test("the very same bill again (same receipt, vehicle, amount) -> clash", () => {
  const r = receiptClashes(A, [reqOf({})], "other"); assert.equal(r.clash.indentNo, 1);
});
test("same bill re-read with a wrong date is still a clash", () => {
  assert.ok(receiptClashes({ ...A, date: "2026-11-27" }, [reqOf({})], "other").clash);
});
test("receipt number case/space differences still clash", () => {
  assert.ok(receiptClashes({ ...A, receiptNo: " k0596" }, [reqOf({})], "other").clash);
});
test("a request does not clash with itself", () => {
  assert.equal(receiptClashes(A, [reqOf({ id: "me" })], "me").clash, null);
});
test("older request with a receipt but no stored vehicle/amount: cannot prove different -> clash (safe side)", () => {
  assert.ok(receiptClashes(B, [reqOf({ extractedVehicleNo: "", extractedAmount: null })], "other").clash);
});
test("split receipt 'K1 + K0596' held by another request for the SAME vehicle: cannot tell -> clash", () => {
  assert.ok(receiptClashes({ ...B, vehicleNo: "5499" }, [reqOf({ receiptNo: "K1 + K0596" })], "other").clash);
});
test("split receipt held by a request for ANOTHER vehicle: provably a different bill -> notice only", () => {
  const r = receiptClashes(B, [reqOf({ receiptNo: "K1 + K0596" })], "other"); assert.equal(r.clash, null); assert.equal(r.notices.length, 1);
});
test("nozzle: '01' and '1' are the same nozzle, blank is unknown", () => {
  assert.equal(normNozzle("01"), "1"); assert.equal(normNozzle(" 2 "), "2"); assert.equal(normNozzle(""), ""); assert.equal(normNozzle(null), ""); assert.equal(normNozzle("-"), "");
});
test("same receipt, vehicle and amount but a DIFFERENT nozzle -> a different bill (notice, not clash)", () => {
  const r = receiptClashes({ ...A, nozzleNo: "2" }, [reqOf({ extractedNozzle: "1" })], "other");
  assert.equal(r.clash, null); assert.equal(r.notices.length, 1);
});
test("same receipt, vehicle, amount and the same nozzle -> clash; nozzle unknown on one side -> still clash (safe side)", () => {
  assert.ok(receiptClashes({ ...A, nozzleNo: "01" }, [reqOf({ extractedNozzle: "1" })], "other").clash);
  assert.ok(receiptClashes({ ...A, nozzleNo: "1" }, [reqOf({ extractedNozzle: "" })], "other").clash);
  assert.ok(receiptClashes({ ...A }, [reqOf({ extractedNozzle: "1" })], "other").clash);
});
test("THE #2235 CASE: group 'K0712 + K0713' (TS34TA5400) vs request #2163 holding K0712 for KA08A3651 -> allowed", () => {
  const g = { receiptNo: "K0712 + K0713", nozzleNo: "1 + 1", vehicleNo: "TS34TA5400", amount: 10220.73 };
  const held = reqOf({ id: "r2163", indentNo: 2163, receiptNo: "K0712", extractedVehicleNo: "3651", extractedAmount: 20000 });
  const r = receiptClashes(g, [held], "r2235"); assert.equal(r.clash, null); assert.equal(r.notices.length, 1);
});
test("a group whose receipt is held by the SAME vehicle's request is still blocked", () => {
  const g = { receiptNo: "K0712 + K0713", nozzleNo: "1 + 1", vehicleNo: "TS34TA5400", amount: 10220.73 };
  assert.ok(receiptClashes(g, [reqOf({ receiptNo: "K0713", extractedVehicleNo: "5400", extractedAmount: 9949 })], "r2235").clash);
});
test("group parts are compared one by one: a different nozzle on that part clears only that part", () => {
  const g = { receiptNo: "K0712 + K0713", nozzleNo: "2 + 1", vehicleNo: "5400", amount: 1 };
  const held = reqOf({ receiptNo: "K0712 + K0713", extractedVehicleNo: "5400", extractedNozzle: "1 + 1" });
  assert.ok(receiptClashes(g, [held], "x").clash);   // K0713 nozzle 1 is on both
  assert.equal(receiptClashes({ ...g, nozzleNo: "2 + 2" }, [held], "x").clash, null);
});
test("a different receipt number never clashes", () => {
  const r = receiptClashes({ ...A, receiptNo: "K0597" }, [reqOf({})], "other"); assert.equal(r.clash, null); assert.equal(r.notices.length, 0);
});
test("no receipt number on the bill -> nothing to compare", () => {
  const r = receiptClashes({ ...A, receiptNo: "" }, [reqOf({})], "other"); assert.equal(r.clash, null);
});
test("what the screens show: receipt + nozzle; groups per part; unknown nozzle shows the receipt only", () => {
  assert.equal(receiptLabel("K0713", "01"), "K0713 · Nozzle 1");
  assert.equal(receiptLabel("K0712 + K0713", "01 + 02"), "K0712 (nozzle 1) + K0713 (nozzle 2)");
  assert.equal(receiptLabel("K0715", null), "K0715"); assert.equal(receiptLabel("K0715", ""), "K0715");
  assert.equal(receiptLabel("K1 + K2", "1 + -"), "K1 (nozzle 1) + K2"); assert.equal(receiptLabel("", "1"), ""); assert.equal(receiptLabel(null, null), "");
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
