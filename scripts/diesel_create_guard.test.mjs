import assert from "node:assert/strict";
import { confirmedBlock, sameFormAlready, CONFIRMED_BLOCK_MSG, normTruck } from "../src/diesel_create_guard.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
const R = (o) => ({ id: "x", indentNo: 1, truckNo: "KA32AA0775", status: "open", pumpId: "p1", date: "2026-11-24", dieselAmount: 12000, cashAmount: 0, amount: 12000, ...o });
test("message is exactly the owner's wording", () => assert.equal(CONFIRMED_BLOCK_MSG, "Either delete existing confirmed diesel request or attach LR to it for creating new diesel request"));
test("a confirmed request for the vehicle blocks a new one", () => assert.equal(confirmedBlock([R({ status: "confirmed", indentNo: 7 })], "KA32AA0775").indentNo, 7));
test("case and spaces do not matter", () => assert.ok(confirmedBlock([R({ status: "confirmed" })], " ka32 aa0775 ")));
test("another vehicle is not blocked", () => assert.equal(confirmedBlock([R({ status: "confirmed" })], "KA32AA0776"), null));
test("attached / open / empty list do not block", () => {
  assert.equal(confirmedBlock([R({ status: "attached" }), R({ status: "open" })], "KA32AA0775"), null);
  assert.equal(confirmedBlock([], "KA32AA0775"), null); assert.equal(confirmedBlock(null, "KA32AA0775"), null); assert.equal(confirmedBlock([R()], ""), null);
});
const F = { truckNo: "ka32aa0775", pumpId: "p1", date: "2026-11-24", dieselAmount: 12000, cashAmount: 0 };
test("same open form again is found", () => assert.ok(sameFormAlready([R()], F)));
test("different amount, pump, day or vehicle is not the same form", () => {
  assert.equal(sameFormAlready([R()], { ...F, dieselAmount: 13000 }), null);
  assert.equal(sameFormAlready([R()], { ...F, cashAmount: 500 }), null);
  assert.equal(sameFormAlready([R()], { ...F, pumpId: "p2" }), null);
  assert.equal(sameFormAlready([R()], { ...F, date: "2026-11-25" }), null);
  assert.equal(sameFormAlready([R()], { ...F, truckNo: "KA32AA0000" }), null);
});
test("a confirmed or attached earlier request is not 'the same form'", () => assert.equal(sameFormAlready([R({ status: "attached" })], F), null));
test("normTruck", () => assert.equal(normTruck(" ka 32-aa "), "KA32-AA"));
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
