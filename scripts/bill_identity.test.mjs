import assert from "node:assert/strict";
import { normReceipt, last4, billsDiffer, receiptClashes } from "../src/bill_identity.js";
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
test("split receipt 'K1 + K0596' on another request: cannot tell -> clash", () => {
  assert.ok(receiptClashes(B, [reqOf({ receiptNo: "K1 + K0596" })], "other").clash);
});
test("a different receipt number never clashes", () => {
  const r = receiptClashes({ ...A, receiptNo: "K0597" }, [reqOf({})], "other"); assert.equal(r.clash, null); assert.equal(r.notices.length, 0);
});
test("no receipt number on the bill -> nothing to compare", () => {
  const r = receiptClashes({ ...A, receiptNo: "" }, [reqOf({})], "other"); assert.equal(r.clash, null);
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
