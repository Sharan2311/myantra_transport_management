import assert from "node:assert/strict";
import { groupRequestsByDay, hasBill } from "../src/diesel_by_day.js";
const tests = [];
const test = (n, f) => tests.push([n, f]);
const R = (o) => ({ indentNo: 1, truckNo: "T1", date: "2026-11-20", amount: 1000, status: "confirmed", ownerVerified: false, pumpId: "P1", ...o });

test("groups by date, newest day first", () => {
  const g = groupRequestsByDay([R({ indentNo: 1, date: "2026-11-19" }), R({ indentNo: 2, date: "2026-11-21" }), R({ indentNo: 3, date: "2026-11-21" })]);
  assert.deepEqual(g.map(d => d.date), ["2026-11-21", "2026-11-19"]);
  assert.equal(g[0].items.length, 2);
});
test("within a day the highest indent number is first", () => {
  const g = groupRequestsByDay([R({ indentNo: 5 }), R({ indentNo: 9 }), R({ indentNo: 7 })]);
  assert.deepEqual(g[0].items.map(r => r.indentNo), [9, 7, 5]);
});
test("day totals: count, amount, checked and still-open counts", () => {
  const g = groupRequestsByDay([
    R({ indentNo: 1, amount: 10000, ownerVerified: true }),
    R({ indentNo: 2, amount: 8000, status: "open" }),
    R({ indentNo: 3, amount: 5000, status: "attached", ownerVerified: true }),
  ]);
  assert.equal(g[0].count, 3);
  assert.equal(g[0].total, 23000);
  assert.equal(g[0].checked, 2);
  assert.equal(g[0].open, 1);
});
test("only confirmed/attached requests count as checkable", () => {
  const g = groupRequestsByDay([R({ status: "open", ownerVerified: true })]);
  assert.equal(g[0].checked, 0);
});
test("amount uses confirmed diesel + cash when present, else the request amount", () => {
  const g = groupRequestsByDay([R({ amount: 9000, confirmedAmount: 6000, confirmedCash: 2000 }), R({ indentNo: 2, amount: 4000 })]);
  assert.equal(g[0].total, 12000);
});
test("a request with a bad or missing date goes to an 'Unknown date' group at the end", () => {
  const g = groupRequestsByDay([R({ date: "" }), R({ indentNo: 2, date: "2026-11-21" })]);
  assert.equal(g[g.length - 1].date, "");
  assert.equal(g[0].date, "2026-11-21");
});
test("noBill counts requests with neither a receipt number nor a receipt photo", () => {
  const g = groupRequestsByDay([R({ indentNo: 1 }), R({ indentNo: 2, receiptNo: "K0589" }), R({ indentNo: 3, receiptImagePath: "x/1.jpg" })]);
  assert.equal(g[0].noBill, 1);
  assert.equal(hasBill(R({ receiptNo: "  " })), false);
});
test("empty / missing input gives no groups", () => {
  assert.deepEqual(groupRequestsByDay([]), []);
  assert.deepEqual(groupRequestsByDay(undefined), []);
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
