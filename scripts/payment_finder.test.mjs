// Run: node scripts/payment_finder.test.mjs
import assert from "node:assert/strict";
import { normRef, buildRecords, findPayment } from "../src/payment_finder.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const data = {
  vehicles: [
    { id: "v1", truckNo: "KA28AB2091", ownerName: "Mohan",
      loanTxns: [{ id: "a", type: "given", date: "2026-10-23", amount: 40000, ref: "HDFCH01347261155" },
                 { id: "b", type: "recovery", date: "2026-10-25", amount: 2000, ref: "" }],
      shortageTxns: [{ id: "s", type: "shortage", date: "2026-10-01", amount: 700, ref: "" }] },
  ],
  employees: [
    { id: "e1", name: "Fayaz ", loanTxns: [{ id: "x", type: "given", date: "2026-10-26", amount: 40000, ref: "Loan(Look in messages of this date for screenshot)" }] },
  ],
  cashTransfers: [
    { id: "c1", empId: "e2", amount: 40000, date: "2026-10-24", note: "BASAVANA GOUDA", utr: "HDFCH0135104956", ref: "", type: "transfer" },
  ],
  driverPayments: [
    { id: "d1", tripId: "t1", truckNo: "KA32AB1111", lrNo: "SKLC100", amount: 50000, utr: "55147033620260924000478358383", date: "2026-09-24", notes: "", paidTo: "Fayaz" },
  ],
  paymentRequests: [
    { id: "p1", tripId: "t1", lrNo: "SKLC100", truckNo: "KA32AB1111", amount: 9746, recipientName: "Fayaz", status: "pending", notes: "" },
  ],
};

t("normRef: case/space/dash insensitive", () => {
  assert.equal(normRef(" hdfch-0134 7261155 "), "HDFCH013472611" + "55");
  assert.equal(normRef(null), "");
});

t("buildRecords flattens every source and says where each lives", () => {
  const r = buildRecords(data);
  const kinds = new Set(r.map(x => x.kind));
  assert.deepEqual([...kinds].sort(), ["cash_transfer", "driver_payment", "employee_loan", "payment_request", "vehicle_loan", "vehicle_shortage"].sort());
});

t("exact: ref found on a vehicle loan", () => {
  const r = findPayment({ refs: ["HDFCH01347261155"] }, data);
  assert.equal(r.exact.length, 1);
  assert.equal(r.exact[0].kind, "vehicle_loan");
  assert.match(r.exact[0].where, /KA28AB2091/);
  assert.equal(r.possible.length, 0);
});

t("exact: ref found in a driver payment UTR (long numeric)", () => {
  const r = findPayment({ refs: ["55147033620260924000478358383"] }, data);
  assert.equal(r.exact[0].kind, "driver_payment");
});

t("exact: any of several refs from the screenshot matches (reference OR transaction id)", () => {
  const r = findPayment({ refs: ["NOPE12345678", "HDFCH0135104956"] }, data);
  assert.equal(r.exact[0].kind, "cash_transfer");
});

t("short refs are ignored (no false matches on 'Loan')", () => {
  const r = findPayment({ refs: ["Loan"] }, data);
  assert.equal(r.exact.length, 0);
});

t("not recorded by ref -> possible by amount + date, labelled with why", () => {
  // Fayaz ₹40,000 on 26 Oct had no ref typed: HDFC reference from the screenshot matches nothing.
  const r = findPayment({ refs: ["551470336202610261000932376749", "HDFCCF00E7DB74C7"], amount: 40000, date: "2026-10-26", name: "MD FAYAZ" }, data);
  assert.equal(r.exact.length, 0);
  assert.equal(r.possible[0].kind, "employee_loan");
  assert.ok(r.possible[0].reasons.includes("amount"));
  assert.ok(r.possible[0].reasons.includes("date"));
  assert.ok(r.possible[0].reasons.includes("name"));
});

t("possible ranks name+date+amount above amount+date only", () => {
  const r = findPayment({ amount: 40000, date: "2026-10-25", name: "FAYAZ" }, data);
  assert.equal(r.possible[0].kind, "employee_loan");
  assert.ok(r.possible.length >= 2);
});

t("possible needs the same amount AND a date within 3 days", () => {
  const r = findPayment({ amount: 40000, date: "2026-11-30" }, data);
  assert.equal(r.possible.length, 0);
  const r2 = findPayment({ amount: 12345, date: "2026-10-26" }, data);
  assert.equal(r2.possible.length, 0);
});

t("amount alone (no date on the screenshot) is not enough", () => {
  const r = findPayment({ amount: 40000 }, data);
  assert.equal(r.possible.length, 0);
});

t("possible is NOT shown when an exact match exists", () => {
  const r = findPayment({ refs: ["HDFCH01347261155"], amount: 40000, date: "2026-10-26" }, data);
  assert.equal(r.exact.length, 1);
  assert.equal(r.possible.length, 0);
});

t("nothing anywhere -> empty result", () => {
  const r = findPayment({ refs: ["ZZZZZZZZZZZZ"], amount: 1, date: "2026-01-01" }, data);
  assert.equal(r.exact.length + r.possible.length, 0);
});

t("employee name with trailing space still matches", () => {
  const r = findPayment({ amount: 40000, date: "2026-10-26", name: "fayaz" }, data);
  assert.ok(r.possible[0].reasons.includes("name"));
});

console.log(`\n${n} tests passed`);
