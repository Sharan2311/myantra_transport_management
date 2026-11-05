// Run: node scripts/diesel_report.test.mjs
import assert from "node:assert/strict";
import { dieselReportRows, dieselReportHtml } from "../src/diesel_report.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const pumps = [{ id: "p1", name: "Shree Pump" }];
const req = (o = {}) => ({ id: "r" + Math.random(), indentNo: 10, truckNo: "KA10A3373", pumpId: "p1", date: "2026-10-12", amount: 15000,
  dieselAmount: 12000, cashAmount: 3000, status: "open", confirmedAmount: null, lrNo: "", requestedBy: "SH", ...o });

t("rows are sorted by date, then indent number", () => {
  const rows = dieselReportRows([req({ indentNo: 5, date: "2026-10-13" }), req({ indentNo: 9, date: "2026-10-12" }), req({ indentNo: 3, date: "2026-10-12" })], pumps);
  assert.deepEqual(rows.map(r => r.indentNo), [3, 9, 5]);
});

t("pump name is resolved; unknown pump shows a dash", () => {
  const rows = dieselReportRows([req(), req({ pumpId: "zzz" })], pumps);
  assert.deepEqual(rows.map(r => r.pump), ["Shree Pump", "—"]);
});

t("status labels: pending, confirmed, attached, attached without pump confirmation, reconciled", () => {
  const rows = dieselReportRows([
    req({ indentNo: 1, status: "open" }), req({ indentNo: 2, status: "confirmed", confirmedAmount: 15000 }),
    req({ indentNo: 3, status: "attached", confirmedAmount: 15000 }), req({ indentNo: 4, status: "attached", confirmedAmount: null }),
    req({ indentNo: 5, status: "reconciled" })], pumps);
  assert.deepEqual(rows.map(r => r.status), ["Pending", "Confirmed", "Attached", "Attached (no pump confirm)", "Reconciled"]);
});

t("diesel/cash default to the total when the split is missing", () => {
  const r = dieselReportRows([req({ dieselAmount: null, cashAmount: null, amount: 8000 })], pumps)[0];
  assert.equal(r.diesel, 8000); assert.equal(r.cash, 0); assert.equal(r.total, 8000);
});

t("html has the filter label, one row per request and the exact grand total", () => {
  const html = dieselReportHtml([req({ amount: 15000 }), req({ amount: 5000, dieselAmount: 5000, cashAmount: 0 })], { filterLabel: "Pending", company: "Kori", date: "05/11/2026", pumps });
  assert.match(html, /Pending/);
  assert.match(html, /2 request/);
  assert.match(html, /20,000/);
  assert.equal((html.match(/<tr class="d">/g) || []).length, 2);
});

t("html escapes text so a name can't break the page", () => {
  const html = dieselReportHtml([req({ truckNo: "<b>X</b>", requestedBy: "a&b" })], { filterLabel: "All", pumps });
  assert.ok(!html.includes("<b>X</b>"));
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.match(html, /a&amp;b/);
});

t("empty list still produces a valid report that says so", () => {
  const html = dieselReportHtml([], { filterLabel: "Confirmed", pumps });
  assert.match(html, /0 request/);
  assert.match(html, /No requests/);
});

t("includes date range and search when given", () => {
  const html = dieselReportHtml([req()], { filterLabel: "Pending", from: "2026-10-01", to: "2026-10-31", search: "KA10", pumps });
  assert.match(html, /2026-10-01/);
  assert.match(html, /KA10/);
});

console.log(`\n${n} tests passed`);
