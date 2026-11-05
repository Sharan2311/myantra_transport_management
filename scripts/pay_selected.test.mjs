// Run: node scripts/pay_selected.test.mjs
import assert from "node:assert/strict";
import { pouchHoldOf, payableAfterSkips, payEligible, paySelectionTotal, payOrder, allocateTotal, splitReduction, reductionCheck } from "../src/pay_selected_logic.js";

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

t("allocateTotal fills oldest first and reports what does not fit", () => {
  const items = [{ id: "a", payable: 100 }, { id: "b", payable: 200 }, { id: "c", payable: 50 }];
  assert.deepEqual(allocateTotal(items, 250), { alloc: { a: 100, b: 150 }, unallocated: 0 });
  assert.equal(allocateTotal(items, 400).unallocated, 50);
  assert.deepEqual(allocateTotal(items, 0).alloc, {});
});

t("splitReduction: reductions from the oldest trips first, bank covers the rest, every trip still sums to its allocation", () => {
  const alloc = { a: 100, b: 200, c: 50 };
  const r = splitReduction(alloc, ["a", "b", "c"], 150);
  assert.deepEqual(r.red, { a: 100, b: 50 });
  assert.deepEqual(r.bank, { b: 150, c: 50 });
  for (const id of ["a", "b", "c"]) assert.equal((r.red[id] || 0) + (r.bank[id] || 0), alloc[id]);
  assert.deepEqual(splitReduction(alloc, ["a", "b", "c"], 0).red, {});
  assert.deepEqual(splitReduction(alloc, ["a", "b", "c"], 350).bank, {});
});

t("example: 50,000 ticked, wallet 10,000 + loan 5,000 -> bank 35,000", () => {
  const items = [{ id: "a", payable: 30000 }, { id: "b", payable: 20000 }];
  const { alloc } = allocateTotal(items, 50000);
  const { red, bank } = splitReduction(alloc, ["a", "b"], 15000);
  assert.equal(Object.values(red).reduce((x, y) => x + y, 0), 15000);
  assert.equal(Object.values(bank).reduce((x, y) => x + y, 0), 35000);
});

t("reductionCheck: loan over due, wallet zero, and over-settling are rejected", () => {
  const base = { loanDue: 5000, walletBal: -3000, loanRed: 0, walletRed: 0, settle: 100, totalPayable: 100 };
  assert.equal(reductionCheck(base).ok, true);
  assert.equal(reductionCheck({ ...base, loanRed: 5001 }).ok, false);
  assert.equal(reductionCheck({ ...base, walletBal: 0, walletRed: 10 }).ok, false);
  assert.equal(reductionCheck({ ...base, settle: 200 }).ok, false);
  assert.equal(reductionCheck({ ...base, loanRed: -1 }).ok, false);
  assert.equal(reductionCheck({ ...base, walletBal: 1176, walletRed: 2000, settle: 2000, totalPayable: 2000 }).ok, true);
});

console.log(`\n${n} tests passed`);
