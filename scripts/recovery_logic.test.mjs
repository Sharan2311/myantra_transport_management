// Run: node scripts/recovery_logic.test.mjs
import assert from "node:assert/strict";
import { candidateTrucks, buildRecovery, recoveryReportHtml, walletBalanceOf } from "../src/recovery_logic.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const E = "EMP1";
let seq = 0;
const veh = (o = {}) => ({ id: "v" + ++seq, truckNo: "KA01A000" + seq, ownerName: "Owner" + seq, loan: 0, loanRecovered: 0, loanTxns: [], shortageTxns: [], shortageOwed: 0, shortageRecovered: 0, ...o });
const trips = (truck, him, other) => [
  ...Array.from({ length: him }, () => ({ truckNo: truck, assignedEmpId: E })),
  ...Array.from({ length: other }, () => ({ truckNo: truck, assignedEmpId: "X" }))];
const given = (amount, empId) => ({ type: "given", amount, empId });
const rec = amount => ({ type: "recovery", amount });

t("majority of trips makes a truck his; exactly half does not", () => {
  const a = veh({ truckNo: "KA01A1111", loan: 100, loanTxns: [given(100)] });
  const b = veh({ truckNo: "KA01A2222", loan: 100, loanTxns: [given(100)] });
  const r = candidateTrucks({ empId: E, vehicles: [a, b], trips: [...trips("KA01A1111", 3, 2), ...trips("KA01A2222", 2, 2)] });
  assert.deepEqual(r.map(x => x.vehicle.truckNo), ["KA01A1111"]);
  assert.equal(r[0].tripsHim, 3); assert.equal(r[0].tripsTotal, 5);
});

t("a loan linked to him counts even with no trips", () => {
  const a = veh({ loan: 50, loanTxns: [given(50, E)] });
  const r = candidateTrucks({ empId: E, vehicles: [a], trips: [] });
  assert.equal(r.length, 1); assert.deepEqual(r[0].reasons, ["loan linked to him"]);
});

t("trucks with no loan or shortage ledger are never listed", () => {
  const a = veh({ truckNo: "KA01A3333" });
  assert.equal(candidateTrucks({ empId: E, vehicles: [a], trips: trips("KA01A3333", 5, 0) }).length, 0);
});

t("truck numbers match ignoring case, spaces and dashes", () => {
  const a = veh({ truckNo: "ka 01-a4444", loan: 10, loanTxns: [given(10)] });
  assert.equal(candidateTrucks({ empId: E, vehicles: [a], trips: trips("KA01A4444", 2, 0) }).length, 1);
});

t("loan given comes from vehicle.loan, recovered from the ledger", () => {
  const a = veh({ truckNo: "KA01A5555", loan: 49160, loanTxns: [given(47080), { type: "loan", amount: 2080 }, rec(28000)] });
  const r = buildRecovery({ empId: E, employees: [], vehicles: [a], trips: trips("KA01A5555", 2, 0), cashTransfers: [] });
  assert.equal(r.trucks[0].loanGiven, 49160); assert.equal(r.trucks[0].loanRecovered, 28000);
  assert.equal(r.totals.vehicleLoanPending, 21160);
});

t("owner netting: over-recovery on one truck offsets the owner's other truck, clamped once", () => {
  const a = veh({ truckNo: "KA01A6001", ownerName: "Upendra", loan: 3000, loanTxns: [rec(125000)] });
  const b = veh({ truckNo: "KA01A6002", ownerName: "Upendra", loan: 429000, loanTxns: [rec(95000)] });
  const r = buildRecovery({ empId: E, employees: [], vehicles: [a, b], trips: [...trips("KA01A6001", 2, 0), ...trips("KA01A6002", 2, 0)], cashTransfers: [] });
  assert.equal(r.owners.length, 1);
  assert.equal(r.totals.vehicleLoanPending, 432000 - 220000);
  assert.equal(r.totals.rawTruckLoanSum, -122000 + 334000);
  assert.equal(r.totals.ownerNettingAdjustment, 0);
});

t("owner netting adjustment shown when the owner's total is over-recovered", () => {
  const a = veh({ truckNo: "KA01A7001", ownerName: "Same", loan: 10000, loanTxns: [rec(30000)] });
  const r = buildRecovery({ empId: E, employees: [], vehicles: [a], trips: trips("KA01A7001", 2, 0), cashTransfers: [] });
  assert.equal(r.totals.vehicleLoanPending, 0);
  assert.equal(r.totals.ownerNettingAdjustment, 20000);
  assert.equal(r.owners[0].overRecovered, 20000);
});

t("shortage is per vehicle and never negative", () => {
  const a = veh({ truckNo: "KA01A8001", loan: 1, loanTxns: [given(1)], shortageTxns: [{ type: "shortage", amount: 600 }, rec(600)] });
  const b = veh({ truckNo: "KA01A8002", loan: 1, loanTxns: [given(1)], shortageTxns: [{ type: "shortage", amount: 500 }, rec(100)] });
  const r = buildRecovery({ empId: E, employees: [], vehicles: [a, b], trips: [...trips("KA01A8001", 1, 0), ...trips("KA01A8002", 1, 0)], cashTransfers: [] });
  assert.equal(r.totals.shortagePending, 400);
});

t("excluded vehicles drop out of every total", () => {
  const a = veh({ truckNo: "KA01A9001", loan: 1000, loanTxns: [given(1000)] });
  const b = veh({ truckNo: "KA01A9002", loan: 2000, loanTxns: [given(2000)] });
  const base = { empId: E, employees: [], vehicles: [a, b], trips: [...trips("KA01A9001", 1, 0), ...trips("KA01A9002", 1, 0)], cashTransfers: [] };
  assert.equal(buildRecovery(base).totals.grand, 3000);
  const r = buildRecovery({ ...base, excluded: new Set([b.id]) });
  assert.equal(r.totals.grand, 1000); assert.equal(r.excludedCount, 1); assert.equal(r.candidateCount, 2);
});

t("wallet: balance is signed and counted in full either way; salary and tafal are ignored", () => {
  const ct = [{ empId: E, amount: 5000 }, { empId: E, amount: -8000 }, { empId: E, type: "salary", amount: -99999 }, { empId: E, type: "tafal", amount: -99999 }, { empId: "Z", amount: -1 }];
  assert.equal(walletBalanceOf(ct, E), -3000);
  const r = buildRecovery({ empId: E, employees: [], vehicles: [], trips: [], cashTransfers: ct });
  assert.equal(r.wallet.balance, -3000); assert.equal(r.wallet.owed, 3000);
  const pos = buildRecovery({ empId: E, employees: [], vehicles: [], trips: [], cashTransfers: [{ empId: E, amount: 7000 }] });
  assert.equal(pos.wallet.balance, 7000); assert.equal(pos.wallet.owed, 0); assert.equal(pos.wallet.counted, 7000); assert.equal(pos.totals.grand, 7000);
  assert.equal(r.wallet.counted, 3000); assert.equal(r.totals.grand, 3000);
});

t("employee's own loan counts, never negative", () => {
  const emp = { id: E, name: "Shrikantha", loan: 50000, loanRecovered: 20000, loanTxns: [] };
  assert.equal(buildRecovery({ empId: E, employees: [emp], vehicles: [], trips: [], cashTransfers: [] }).empLoan.pending, 30000);
  const over = { ...emp, loanRecovered: 60000 };
  assert.equal(buildRecovery({ empId: E, employees: [over], vehicles: [], trips: [], cashTransfers: [] }).empLoan.pending, 0);
});

t("grand total = vehicle loans + shortage + own loan + wallet balance", () => {
  const a = veh({ truckNo: "KA01B0001", loan: 10000, loanTxns: [given(10000)], shortageTxns: [{ type: "shortage", amount: 300 }] });
  const emp = { id: E, name: "S", loan: 5000, loanRecovered: 1000 };
  const r = buildRecovery({ empId: E, employees: [emp], vehicles: [a], trips: trips("KA01B0001", 1, 0), cashTransfers: [{ empId: E, amount: -700 }] });
  assert.equal(r.totals.grand, 10000 + 300 + 4000 + 700);
});

t("report html: grand total, trip evidence, both groupings, escaping", () => {
  const a = veh({ truckNo: "KA01B1111", ownerName: "<Ow&ner>", loan: 10000, loanTxns: [given(10000)] });
  const emp = { id: E, name: "Shri", loan: 0, loanRecovered: 0 };
  const r = buildRecovery({ empId: E, employees: [emp], vehicles: [a], trips: trips("KA01B1111", 3, 1), cashTransfers: [] });
  const byVeh = recoveryReportHtml(r, { groupBy: "vehicle", company: "Co" });
  assert.match(byVeh, /GRAND TOTAL PENDING/); assert.match(byVeh, /10,000/); assert.match(byVeh, /3\/4 trips his/);
  assert.match(byVeh, /vehicle-wise/); assert.ok(!byVeh.includes("<Ow&ner>")); assert.match(byVeh, /&lt;Ow&amp;ner&gt;/);
  const byOwner = recoveryReportHtml(r, { groupBy: "owner" });
  assert.match(byOwner, /owner-wise/); assert.match(byOwner, /Wallet/);
});

t("report html mentions excluded count", () => {
  const a = veh({ truckNo: "KA01B2222", loan: 1, loanTxns: [given(1)] });
  const r = buildRecovery({ empId: E, employees: [], vehicles: [a], trips: trips("KA01B2222", 1, 0), cashTransfers: [], excluded: new Set([a.id]) });
  assert.match(recoveryReportHtml(r), /1 excluded/);
});

console.log(`\n${n} tests passed`);
