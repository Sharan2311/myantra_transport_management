// Run: node scripts/payment_reconcile.test.mjs
import assert from "node:assert/strict";
import { tripFigures, reconcileScreenshot } from "../src/payment_reconcile.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

// party trip: gross 26,425 ; other deducts 8,100 ; pouch 700 held  => net due 17,625
const partyTrip = (o = {}) => ({ id: "t1", lrNo: "L1", truckNo: "K1", orderType: "party", qty: 25, givenRate: 1057, diLines: [],
  advance: 8100, tafal: 0, dieselEstimate: 0, shortage: 0, shortageRecovery: 0, loanRecovery: 0, pouchBalance: 700, pouchReleased: false, ...o });
const godown = (id, qty, rate, adv) => ({ id, lrNo: id.toUpperCase(), truckNo: "K" + id, orderType: "godown", qty, givenRate: rate, diLines: [], advance: adv, tafal: 0, dieselEstimate: 0, shortage: 0, shortageRecovery: 0, loanRecovery: 0, pouchBalance: 0, pouchReleased: false });

t("tripFigures mirrors the app: net due holds pouch on an unreleased party trip", () => {
  const f = tripFigures(partyTrip(), 0);
  assert.equal(f.gross, 26425);
  assert.equal(f.pouchHold, 700);
  assert.equal(f.netDue, 17625);
  assert.equal(f.balance, 17625);
  assert.equal(f.balancePlain, 18325); // pouch is not held back in the plain balance
});

t("tripFigures: released pouch is not held", () => {
  assert.equal(tripFigures(partyTrip({ pouchReleased: true }), 0).netDue, 18325);
});

t("tripFigures: multi-DI gross uses per-line qty x rate", () => {
  const f = tripFigures(godown("m", 0, 0, 0), 0);
  const g = tripFigures({ ...godown("m", 0, 0, 0), diLines: [{ qty: 10, givenRate: 100 }, { qty: 5, givenRate: 200 }] }, 0);
  assert.equal(f.gross, 0);
  assert.equal(g.gross, 2000);
});

const trips = {
  a: godown("a", 20, 1000, 0),   // gross 20,000 net 20,000
  b: partyTrip({ id: "b", lrNo: "LB" }), // net due 17,625
  c: godown("c", 10, 1000, 2000), // gross 10,000, net 8,000
};
const row = (id, tripId, amount) => ({ id, tripId, lrNo: trips[tripId].lrNo, truckNo: trips[tripId].truckNo, amount });
const paid = rows => rows.reduce((m, r) => (m[r.tripId] = (m[r.tripId] || 0) + r.amount, m), {});

t("no difference -> ok, nothing changes", () => {
  const rows = [row("r1", "a", 20000), row("r2", "b", 17625)];
  const r = reconcileScreenshot({ amount: 37625, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "ok");
  assert.equal(r.changes.length, 0);
});

t("recorded more than screenshot, difference equals the holds paid out -> adjust, per-trip plan", () => {
  // b was recorded at 18,325 (pouch 700 paid out although held); screenshot is 700 less
  const rows = [row("r1", "a", 20000), row("r2", "b", 18325)];
  const r = reconcileScreenshot({ amount: 38325 - 700, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "adjust");
  assert.equal(r.recordedTotal, 38325);
  assert.equal(r.diff, 700);
  assert.deepEqual(r.changes.map(c => [c.rowId, c.oldAmount, c.newAmount, c.reduction]), [["r2", 18325, 17625, 700]]);
  // balance after: the 700 is still owed to the driver (plain balance goes up by 700)
  const c = r.changes[0];
  assert.equal(c.balanceAfter - c.balanceBefore, 700);
});

t("trip already paid net of holds is never reduced", () => {
  const rows = [row("r1", "a", 20000), row("r2", "b", 17625)];
  const r = reconcileScreenshot({ amount: 37625 - 500, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "blocked"); // 500 difference but no trip carries an excess
  assert.equal(r.remaining, 500);
  assert.equal(r.changes.length, 0);
});

t("holds explain only part of the difference -> blocked with the remainder", () => {
  const rows = [row("r1", "b", 18325)];
  const r = reconcileScreenshot({ amount: 18325 - 900, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "blocked");
  assert.equal(r.remaining, 200);
});

t("holds explain MORE than the difference -> blocked (never guess which trip)", () => {
  const rows = [row("r1", "b", 18325), row("r2", "c", 10000)]; // excess: b 700, c 2000
  const r = reconcileScreenshot({ amount: 28325 - 1000, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "blocked");
  assert.equal(r.remaining, -1700);
});

t("exactly the sum of several trips' excess -> adjust on each", () => {
  const rows = [row("r1", "b", 18325), row("r2", "c", 10000)];
  const r = reconcileScreenshot({ amount: 28325 - 2700, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "adjust");
  assert.deepEqual(r.changes.map(c => [c.rowId, c.newAmount]), [["r1", 17625], ["r2", 8000]]);
});

t("excess is measured against ALL payments on the trip, not just this reference", () => {
  const rows = [row("r1", "a", 12000)];
  // another reference already paid a further 8,500 on trip a (net due 20,000) -> 500 over
  const r = reconcileScreenshot({ amount: 11500, rows, trips, paidByTrip: { a: 20500 } });
  assert.equal(r.status, "adjust");
  assert.equal(r.changes[0].newAmount, 11500);
});

t("reduction never goes below zero and is capped at the row amount", () => {
  const rows = [row("r1", "a", 300)];
  const r = reconcileScreenshot({ amount: 0, rows, trips, paidByTrip: { a: 30000 } }); // excess 10,000 but row only 300
  assert.equal(r.status, "adjust");
  assert.equal(r.changes[0].newAmount, 0);
});

t("screenshot MORE than recorded -> blocked", () => {
  const rows = [row("r1", "a", 20000)];
  const r = reconcileScreenshot({ amount: 21000, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "blocked");
  assert.equal(r.remaining, -1000);
});

t("no driver-payment rows for the reference -> not_recorded", () => {
  const r = reconcileScreenshot({ amount: 5000, rows: [], trips, paidByTrip: {} });
  assert.equal(r.status, "not_recorded");
});

t("a payment row whose trip is missing -> blocked, nothing guessed", () => {
  const r = reconcileScreenshot({ amount: 100, rows: [{ id: "x", tripId: "gone", amount: 200 }], trips, paidByTrip: { gone: 200 } });
  assert.equal(r.status, "blocked");
  assert.match(r.reason, /trip/i);
});

t("two rows on the same trip share the reduction in order, capped by each row", () => {
  const rows = [{ id: "r1", tripId: "b", lrNo: "LB", amount: 100 }, { id: "r2", tripId: "b", lrNo: "LB", amount: 18225 }];
  const r = reconcileScreenshot({ amount: 18325 - 700, rows, trips, paidByTrip: { b: 18325 } });
  assert.equal(r.status, "adjust");
  assert.deepEqual(r.changes.map(c => [c.rowId, c.reduction]), [["r1", 100], ["r2", 600]]);
});

t("paise are exact: no float drift in the totals", () => {
  const rows = [row("r1", "a", 10000.1), row("r2", "a", 9999.9)];
  const r = reconcileScreenshot({ amount: 20000, rows, trips, paidByTrip: paid(rows) });
  assert.equal(r.status, "ok");
});

console.log(`\n${n} tests passed`);
