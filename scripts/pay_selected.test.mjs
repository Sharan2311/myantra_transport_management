// Run: node scripts/pay_selected.test.mjs
import assert from "node:assert/strict";
import { pouchHoldOf, payableAfterSkips, payEligible, paySelectionTotal, payOrder } from "../src/pay_selected_logic.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

// The real case: request ₹16,452 for a party trip carrying a ₹700 pouch hold
const trip = (o = {}) => ({ id: "t", orderType: "party", gross: 21000, advance: 2400, tafal: 0, dieselEstimate: 0, shortage: 0, givenRate: 800,
  shortageRecovery: 1448, loanRecovery: 0, pouchBalance: 700, pouchReleased: false, paidSoFar: 0, balance: 16452, pouchHold: 700, ...o });

t("pouch hold: unreleased party trip holds the pouch", () => assert.equal(pouchHoldOf(trip()), 700));
t("pouch hold: released party pouch is not held", () => assert.equal(pouchHoldOf(trip({ pouchReleased: true, pouchHold: undefined })), 0));
t("pouch hold: godown never holds", () => assert.equal(pouchHoldOf(trip({ orderType: "godown", pouchHold: undefined })), 0));

t("payable with no skips equals the balance shown before pressing Pay Selected (the bug)", () => {
  const p = payableAfterSkips(trip(), {});
  assert.equal(p.payable, 16452);
  assert.equal(p.payable, trip().balance);
});

t("works when only raw trip fields are present (no precomputed pouchHold)", () => {
  assert.equal(payableAfterSkips(trip({ pouchHold: undefined }), {}).payable, 16452);
});

t("skipping a deduction raises the payable by exactly that deduction", () => {
  assert.equal(payableAfterSkips(trip(), { shortage: true }).payable, 16452 + 1448);
});

t("money already paid is subtracted", () => {
  assert.equal(payableAfterSkips(trip({ paidSoFar: 5000, balance: 11452 }), {}).payable, 11452);
});

t("never negative", () => {
  assert.equal(payableAfterSkips(trip({ paidSoFar: 99999 }), {}).payable, 0);
});

t("godown trip: unchanged behaviour", () => {
  const g = trip({ orderType: "godown", pouchBalance: 0, pouchHold: 0, balance: 17152 });
  assert.equal(payableAfterSkips(g, {}).payable, 17152);
});

t("several selected trips: sum equals the sum of balances", () => {
  const list = [trip(), trip({ id: "u", balance: 16452 })];
  assert.equal(list.reduce((s, x) => s + payableAfterSkips(x, {}).payable, 0), list.reduce((s, x) => s + x.balance, 0));
});

t("By Employee selection: only trips with money payable now and not settled are eligible", () => {
  const trips = [{ id: "a", balance: 100 }, { id: "b", balance: 0 }, { id: "c", balance: 50, driverSettled: true }, { id: "d", balance: 25 }];
  assert.deepEqual(payEligible(trips).map(x => x.id), ["a", "d"]);
  assert.equal(paySelectionTotal(trips, new Set(["a", "b", "c", "d"])), 125);
  assert.equal(paySelectionTotal(trips, new Set(["d"])), 25);
  assert.equal(paySelectionTotal(trips, new Set()), 0);
});

t("Pay Selected order: oldest first, then created time", () => {
  const o = payOrder([{ id: "x", date: "2026-10-02", createdAt: "1" }, { id: "y", date: "2026-10-01", createdAt: "9" }, { id: "z", date: "2026-10-01", createdAt: "2" }]);
  assert.deepEqual(o.map(x => x.id), ["z", "y", "x"]);
});

console.log(`\n${n} tests passed`);
