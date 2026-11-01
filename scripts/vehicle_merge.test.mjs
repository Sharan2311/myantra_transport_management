import assert from "node:assert/strict";
import { mergeVehicleForSave } from "../src/vehicle_merge.js";
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };

const GIVEN = { id: "G1", type: "given", amount: 40000, ref: "HDFCH01347261155", date: "2026-10-22" };
const REC = { id: "R1", type: "recovery", amount: 5000, lrNo: "SKLC3755", tripId: "03AOXBN" };
const veh = (o) => ({ id: "V", truckNo: "KA28AB2091", loan: 0, loanRecovered: 0, shortageOwed: 0, shortageRecovered: 0, loanTxns: [], shortageTxns: [], ...o });
const known = (loan = [], shortage = []) => ({ loan: new Set(loan), shortage: new Set(shortage) });

t("stale phone: a loan added on another device is kept, and the loan total includes it", () => {
  const stale = veh();                                  // this phone loaded the vehicle before the loan existed
  const inDb = veh({ loan: 40000, loanTxns: [GIVEN] });
  const r = mergeVehicleForSave(stale, inDb, known());
  assert.equal(r.vehicle.loan, 40000); assert.deepEqual(r.vehicle.loanTxns.map((x) => x.id), ["G1"]);
  assert.deepEqual(r.kept.map((k) => k.txn.id), ["G1"]);
});
t("stale phone: a recovery added elsewhere is kept and counted as recovered", () => {
  const r = mergeVehicleForSave(veh(), veh({ loan: 40000, loanRecovered: 5000, loanTxns: [GIVEN, REC] }), known());
  assert.equal(r.vehicle.loan, 40000); assert.equal(r.vehicle.loanRecovered, 5000); assert.equal(r.vehicle.loanTxns.length, 2);
});
t("a deliberate delete on this phone is NOT undone (the phone knew that entry)", () => {
  const mine = veh({ loan: 0, loanTxns: [] });             // user deleted G1 here
  const r = mergeVehicleForSave(mine, veh({ loan: 40000, loanTxns: [GIVEN] }), known(["G1"]));
  assert.equal(r.vehicle.loan, 0); assert.equal(r.vehicle.loanTxns.length, 0); assert.equal(r.kept.length, 0);
});
t("this phone's own new entries are kept alongside the other device's", () => {
  const mine = veh({ loan: 10000, loanTxns: [{ id: "G2", type: "given", amount: 10000 }] });
  const r = mergeVehicleForSave(mine, veh({ loan: 40000, loanTxns: [GIVEN] }), known());
  assert.equal(r.vehicle.loan, 50000); assert.deepEqual(r.vehicle.loanTxns.map((x) => x.id).sort(), ["G1", "G2"]);
});
t("nothing in the database yet, or nothing new there: the vehicle is saved exactly as it is", () => {
  const mine = veh({ loan: 1, loanTxns: [{ id: "X", type: "given", amount: 1 }] });
  assert.deepEqual(mergeVehicleForSave(mine, null, known()).vehicle, mine);
  assert.deepEqual(mergeVehicleForSave(mine, mine, known(["X"])).vehicle, mine);
});
t("shortage ledger: unknown entries are kept; owed and recovered totals follow", () => {
  const S = { id: "S1", type: "shortage", amount: 3000 }, SR = { id: "S2", type: "recovery", amount: 1000 };
  const r = mergeVehicleForSave(veh(), veh({ shortageOwed: 3000, shortageRecovered: 1000, shortageTxns: [S, SR] }), known());
  assert.equal(r.vehicle.shortageOwed, 3000); assert.equal(r.vehicle.shortageRecovered, 1000); assert.equal(r.vehicle.shortageTxns.length, 2);
});
t("memo-only entries (recovery_prev) do not change the totals", () => {
  const M = { id: "M1", type: "recovery_prev", amount: 700 };
  const r = mergeVehicleForSave(veh(), veh({ loanTxns: [M] }), known());
  assert.equal(r.vehicle.loan, 0); assert.equal(r.vehicle.loanRecovered, 0); assert.equal(r.vehicle.loanTxns.length, 1);
});
t("without a record of what this phone knew, nothing is merged (never bring back a deleted entry)", () => {
  const mine = veh();
  assert.deepEqual(mergeVehicleForSave(mine, veh({ loan: 40000, loanTxns: [GIVEN] }), undefined).vehicle, mine);
});
t("paise do not drift", () => {
  const r = mergeVehicleForSave(veh({ loan: 0.1 }), veh({ loanTxns: [{ id: "A", type: "given", amount: 0.2 }] }), known());
  assert.equal(r.vehicle.loan, 0.3);
});
console.log(n + " tests passed");
