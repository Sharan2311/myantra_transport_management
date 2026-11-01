import assert from "node:assert/strict";
import { expectedFor, checkInvoiceLine, extraDeductionItems, splitShortage } from "../src/advice_check.js";
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };
const L = (o) => ({ invoiceNo: "PMYE107027100045", invDate: "2026-10-26", docType: "Invoice", totalAmt: 928481.82, paymentAmt: 771112.02, hold: 141632.82, tds: 15736.98, ...o });

t("expected figures from the app's invoice total (real invoice PMYE107027100045)", () => {
  const e = expectedFor(928481.82);
  assert.equal(e.base, 786849); assert.equal(e.tds, 15736.98); assert.equal(e.gst, 141632.82); assert.equal(e.pay, 771112.02);
});
t("a correctly paid invoice is ok", () => { const c = checkInvoiceLine(L(), 928481.82); assert.equal(c.state, "ok"); assert.equal(c.shortfall, 0); });
t("payment less than expected = extra deduction, by exactly the shortfall", () => {
  const c = checkInvoiceLine(L({ paymentAmt: 761112.02 }), 928481.82);
  assert.equal(c.state, "extra_deduction"); assert.equal(c.shortfall, 10000);
});
t("TDS more than 2% shows up as extra deduction (payment drops by the same amount)", () => {
  const c = checkInvoiceLine(L({ tds: 20736.98, paymentAmt: 766112.02 }), 928481.82);
  assert.equal(c.state, "extra_deduction"); assert.equal(c.shortfall, 5000);
});
t("differences under ₹1 are rounding, not a deduction", () => assert.equal(checkInvoiceLine(L({ paymentAmt: 771111.5 }), 928481.82).state, "ok"));
t("paid more than expected is not an extra deduction", () => { const c = checkInvoiceLine(L({ paymentAmt: 780000 }), 928481.82); assert.equal(c.state, "overpaid"); assert.equal(c.shortfall, 0); });
t("invoice not in the app cannot be checked", () => { assert.equal(checkInvoiceLine(L(), 0).state, "no_app_value"); assert.equal(checkInvoiceLine(L(), undefined).state, "no_app_value"); });
t("the app's value is used, not the advice's: advice total differs from the app → shortfall against the APP value", () => {
  const c = checkInvoiceLine(L({ totalAmt: 900000, paymentAmt: 748000 }), 928481.82);
  assert.equal(c.state, "extra_deduction"); assert.equal(Math.round(c.shortfall * 100) / 100, 23112.02);
});
t("follow-up items: one per short-paid freight invoice; credit-note lines and ok lines are skipped", () => {
  const adv = { utr: "U1", paymentDate: "2026-10-30", invoices: [
    L({ invoiceNo: "A", paymentAmt: 761112.02 }), L({ invoiceNo: "B" }),
    { invoiceNo: "KR1", docType: "Service Sales", totalAmt: -28497, paymentAmt: -28497, hold: 0, tds: 0 }] };
  const items = extraDeductionItems(adv, { A: 928481.82, B: 928481.82 }, "2026-11-01T00:00:00Z");
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "extra_deduction"); assert.equal(items[0].status, "open"); assert.equal(items[0].invoiceNo, "A");
  assert.equal(items[0].amount, 10000); assert.equal(items[0].utr, "U1"); assert.equal(items[0].expectedPay, 771112.02); assert.equal(items[0].actualPay, 761112.02);
  // the action-items table has fixed columns: these survive a save → reload round trip
  assert.equal(items[0].invoiceAmt, 928481.82); assert.equal(items[0].expectedAmt, 771112.02); assert.equal(items[0].grNo, "U1");
  assert.equal(items[0].id, "XD-U1-A");   // stable id: saving the same advice twice never duplicates
});
t("shortage split vehicle-wise: part assigned, rest stays open", () => {
  assert.deepEqual(splitShortage({ amount: 28497 }, 10000), { ok: true, assigned: 10000, remaining: 18497 });
  assert.deepEqual(splitShortage({ amount: 28497 }, 28497), { ok: true, assigned: 28497, remaining: 0 });
});
t("shortage split rejects zero, negative, too much or junk", () => {
  for (const a of [0, -5, 30000, NaN, "abc", undefined]) assert.equal(splitShortage({ amount: 28497 }, a).ok, false);
});
t("shortage split handles paise without float drift", () => assert.deepEqual(splitShortage({ amount: 100.3 }, 0.1), { ok: true, assigned: 0.1, remaining: 100.2 }));
console.log(n + " tests passed");
