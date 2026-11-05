// Run: node scripts/diesel_dupes.test.mjs
import assert from "node:assert/strict";
import { findDieselDuplicates, normTruckNo } from "../src/diesel_dupes.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

let seq = 1;
const R = (o = {}) => ({ id: "r" + (seq++), indentNo: 100 + seq, truckNo: "KA10A3373", date: "2026-10-12", amount: 15000,
  status: "open", tripId: null, lrNo: "", confirmedAmount: null, receiptImagePath: "", ownerVerified: false, ...o });
const A = (o = {}) => R({ status: "attached", tripId: "T" + seq, lrNo: "SKLC" + seq, confirmedAmount: 15000, ...o });

t("normTruckNo ignores case, spaces and dashes", () => {
  assert.equal(normTruckNo(" ka-10 a3373 "), "KA10A3373");
  assert.equal(normTruckNo(null), "");
});

t("pending request with same truck/date/amount as an attached one is deletable, keeping the attached", () => {
  const keep = A({ id: "keep", indentNo: 1579, lrNo: "SKLC3312" });
  const dup = R({ id: "dup", indentNo: 1576 });
  const r = findDieselDuplicates([keep, dup], []);
  assert.equal(r.deletable.length, 1);
  assert.equal(r.deletable[0].id, "dup");
  assert.equal(r.deletable[0].keep[0].id, "keep");
  assert.match(r.deletable[0].reasons.join(" "), /#1579/);
  assert.match(r.deletable[0].reasons.join(" "), /SKLC3312/);
});

t("confirmed (not only pending) duplicates are deletable too", () => {
  const r = findDieselDuplicates([A({ id: "k" }), R({ id: "c", status: "confirmed", confirmedAmount: 15000 })], []);
  assert.deepEqual(r.deletable.map(x => x.id), ["c"]);
});

t("three pending copies of one attached indent are all listed", () => {
  const rows = [A({ id: "k" }), R({ id: "a" }), R({ id: "b" }), R({ id: "c" })];
  assert.deepEqual(findDieselDuplicates(rows, []).deletable.map(x => x.id).sort(), ["a", "b", "c"]);
});

t("truck number written differently still matches", () => {
  const r = findDieselDuplicates([A({ id: "k", truckNo: "KA 10 A3373" }), R({ id: "d", truckNo: "ka10a3373" })], []);
  assert.deepEqual(r.deletable.map(x => x.id), ["d"]);
});

t("different date, truck or amount is NOT a duplicate", () => {
  const keep = A({ id: "k" });
  assert.equal(findDieselDuplicates([keep, R({ date: "2026-10-13" })], []).deletable.length, 0);
  assert.equal(findDieselDuplicates([keep, R({ truckNo: "KA10A0000" })], []).deletable.length, 0);
  assert.equal(findDieselDuplicates([keep, R({ amount: 15001 })], []).deletable.length, 0);
});

t("an attached request is never proposed for deletion", () => {
  const r = findDieselDuplicates([A({ id: "k1" }), A({ id: "k2" })], []);
  assert.equal(r.deletable.length, 0);
});

t("a request already linked to a trip (tripId) is never deletable", () => {
  const r = findDieselDuplicates([A({ id: "k" }), R({ id: "d", tripId: "T9" })], []);
  assert.equal(r.deletable.length, 0);
});

t("a request whose indent number a trip still references is never deletable", () => {
  const dup = R({ id: "d", indentNo: 1576 });
  const trips = [{ id: "T1", lrNo: "L1", dieselIndentNo: "1576", dieselIndentNo2: "" }];
  const r = findDieselDuplicates([A({ id: "k" }), dup], trips);
  assert.equal(r.deletable.length, 0);
  assert.equal(r.blocked.length, 1);
  assert.match(r.blocked[0].reasons.join(" "), /L1/);
});

t("second diesel slot on a trip also blocks deletion", () => {
  const trips = [{ id: "T1", lrNo: "L2", dieselIndentNo: "5", dieselIndentNo2: "1576" }];
  const r = findDieselDuplicates([A({ id: "k" }), R({ id: "d", indentNo: 1576 })], trips);
  assert.equal(r.blocked.length, 1);
});

t("reconciled counts as the request to keep", () => {
  const r = findDieselDuplicates([A({ id: "k", status: "reconciled" }), R({ id: "d" })], []);
  assert.deepEqual(r.deletable.map(x => x.id), ["d"]);
});

t("warnings: receipt image and owner verification are shown, not hidden", () => {
  const r = findDieselDuplicates([A({ id: "k" }), R({ id: "d", receiptImagePath: "x.jpg", ownerVerified: true })], []);
  const w = r.deletable[0].warnings.join(" ");
  assert.match(w, /receipt/i);
  assert.match(w, /verified/i);
});

t("duplicates with NO attached indent go to review, never to deletable", () => {
  const rows = [R({ id: "a", indentNo: 1584, truckNo: "AP29V9936", amount: 15068 }),
                R({ id: "b", indentNo: 1585, truckNo: "AP29V9936", amount: 15068, status: "confirmed" })];
  const r = findDieselDuplicates(rows, []);
  assert.equal(r.deletable.length, 0);
  assert.equal(r.review.length, 1);
  assert.deepEqual(r.review[0].ids.sort(), ["a", "b"]);
  assert.match(r.review[0].reason, /no attached/i);
});

t("missing truck, date or amount can never match", () => {
  const r = findDieselDuplicates([A({ id: "k", truckNo: "" }), R({ id: "d", truckNo: "" })], []);
  assert.equal(r.deletable.length, 0);
  assert.equal(r.review.length, 0);
});

t("a lone pending request is left alone", () => {
  const r = findDieselDuplicates([R(), A({ truckNo: "OTHER1" })], []);
  assert.equal(r.deletable.length + r.review.length + r.blocked.length, 0);
});

t("handles empty or missing input", () => {
  const r = findDieselDuplicates(undefined, undefined);
  assert.deepEqual([r.deletable, r.blocked, r.review], [[], [], []]);
});

console.log(`\n${n} tests passed`);
