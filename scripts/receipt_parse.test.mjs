import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { parseReceiptText, cleanPumpName } = createRequire(import.meta.url)("../netlify/functions/scan-diesel-receipt.js");
const tests = []; const test = (n, f) => tests.push([n, f]);
test("a reply with a leading-zero amount (what broke the two bills) is read, not rejected", () => {
  const o = parseReceiptText('```json\n{"vehicleNo":"5400","amount": 09949.00,"date":"2026-11-27","pumpName":"X","receiptNo":"K0713"}\n```');
  assert.equal(o.amount, 9949); assert.equal(o.receiptNo, "K0713");
  assert.equal(parseReceiptText('{"amount": 00271.73}').amount, 271.73);
});
test("zeros that belong to the number are kept", () => {
  assert.equal(parseReceiptText('{"amount": 0.5}').amount, 0.5); assert.equal(parseReceiptText('{"amount": 10200}').amount, 10200);
  assert.equal(parseReceiptText('{"amount": 7000.00}').amount, 7000); assert.equal(parseReceiptText('{"amount": 0}').amount, 0);
});
test("text around the JSON is ignored; real garbage is still rejected", () => {
  assert.equal(parseReceiptText('Here you go: {"amount": 5} hope that helps').amount, 5);
  assert.equal(parseReceiptText("I cannot read this"), null); assert.equal(parseReceiptText(""), null); assert.equal(parseReceiptText("{broken"), null);
});
test("pump name drops 'Duplicate Receipt Copy'", () => {
  assert.equal(cleanPumpName("DUPLICATE RECEIPT COPY SHREE VAISHNAVI F/S SEDAM ROAD KODLA"), "SHREE VAISHNAVI F/S SEDAM ROAD KODLA");
  assert.equal(cleanPumpName("KHASA MATH CIRCLE GURMITKAL"), "KHASA MATH CIRCLE GURMITKAL");
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); ok++; } catch (e) { console.log("FAIL:", n, "\n ", e.message); process.exitCode = 1; } }
if (!process.exitCode) console.log(ok + " tests passed");
