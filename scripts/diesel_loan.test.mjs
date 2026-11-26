import assert from "node:assert/strict";
import { applyRequestToLoan, canAddToLoan, LOAN_NOTE, loanTxnId, unattachedConfirmed } from "../src/diesel_loan.js";
import { confirmedBlock } from "../src/diesel_create_guard.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
const REQ = { id: "R1", indentNo: 2148, truckNo: "TS08UF0786", status: "confirmed", amount: 15000, remark: "" };
const VEH = { truckNo: "TS08UF0786", loan: 1000, loanTxns: [{ id: "old", type: "loan", amount: 1000 }] };
const A = { amount: 15000, by: "Incharge", at: "2026-11-25T10:00:00Z", date: "2026-11-25" };
test("adds the full amount to the vehicle loan and keeps the old entries", () => {
  const r = applyRequestToLoan(VEH, REQ, A);
  assert.equal(r.vehicle.loan, 16000); assert.equal(r.vehicle.loanTxns.length, 2);
  assert.equal(r.vehicle.loanTxns[1].id, loanTxnId("R1")); assert.equal(r.vehicle.loanTxns[1].amount, 15000);
});
test("request stays confirmed, is flagged, and carries the owner's note", () => {
  const { request } = applyRequestToLoan(VEH, REQ, A);
  assert.equal(request.status, "confirmed"); assert.equal(request.loanAdded, true); assert.equal(request.loanAddedAmount, 15000);
  assert.ok(request.remark.startsWith(LOAN_NOTE)); assert.ok(request.remark.includes("TS08UF0786"));
  assert.equal(LOAN_NOTE, "Extra diesel filled but not loaded and hence added this amount in loan for vehicle");
});
test("an existing remark is kept, the note is added after it", () => {
  const { request } = applyRequestToLoan(VEH, { ...REQ, remark: "driver called" }, A);
  assert.ok(request.remark.startsWith("driver called | " + LOAN_NOTE));
});
test("applying twice never counts the loan twice", () => {
  const once = applyRequestToLoan(VEH, REQ, A);
  const twice = applyRequestToLoan(once.vehicle, once.request, A);
  assert.equal(twice.vehicle.loan, 16000); assert.equal(twice.vehicle.loanTxns.filter((t) => t.id === loanTxnId("R1")).length, 1);
  assert.equal(twice.request.remark.split(LOAN_NOTE).length - 1, 1);
});
test("no vehicle or zero amount is refused", () => {
  assert.throws(() => applyRequestToLoan(null, REQ, A)); assert.throws(() => applyRequestToLoan(VEH, REQ, { ...A, amount: 0 }));
});
test("does not mutate its inputs", () => {
  const v = JSON.stringify(VEH), r = JSON.stringify(REQ); applyRequestToLoan(VEH, REQ, A);
  assert.equal(JSON.stringify(VEH), v); assert.equal(JSON.stringify(REQ), r);
});
test("only confirmed, unattached, not-yet-added requests can be added", () => {
  assert.equal(canAddToLoan(REQ), "");
  assert.ok(canAddToLoan({ ...REQ, status: "open" })); assert.ok(canAddToLoan({ ...REQ, status: "attached" }));
  assert.ok(canAddToLoan({ ...REQ, lrNo: "SKLC1" })); assert.ok(canAddToLoan({ ...REQ, loanAdded: true })); assert.ok(canAddToLoan(null));
});
test("after the loan is added, the confirmed request no longer blocks a new request", () => {
  assert.ok(confirmedBlock([REQ], "TS08UF0786"));
  assert.equal(confirmedBlock([{ ...REQ, loanAdded: true }], "TS08UF0786"), null);
});
test("unattached list: only confirmed without LR; not recovered first, oldest first", () => {
  const now = Date.parse("2026-11-26T09:00:00+05:30");
  const L = unattachedConfirmed([
    { ...REQ, id: "a", indentNo: 1, date: "2026-11-25" },
    { ...REQ, id: "b", indentNo: 2, date: "2026-11-20" },
    { ...REQ, id: "c", indentNo: 3, date: "2026-11-10", loanAdded: true },
    { ...REQ, id: "d", indentNo: 4, status: "attached", lrNo: "SK1", date: "2026-11-01" },
    { ...REQ, id: "e", indentNo: 5, status: "open", date: "2026-11-01" },
    { ...REQ, id: "f", indentNo: 6, lrNo: "SK2", date: "2026-11-02" },
  ], now);
  assert.deepEqual(L.map((x) => x.req.indentNo), [2, 1, 3]);
  assert.deepEqual(L.map((x) => x.recovered), [false, false, true]);
  assert.deepEqual(L.map((x) => x.ageDays), [6, 1, 16]);
});
test("unattached list handles empty and bad dates", () => {
  assert.deepEqual(unattachedConfirmed(null), []);
  assert.equal(unattachedConfirmed([{ ...REQ, date: "garbage" }])[0].ageDays, null);
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
