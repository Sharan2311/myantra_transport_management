import assert from "node:assert/strict";
import { expectedFor, checkInvoiceLine, extraDeductionItems, splitShortage, invoiceBaseFromTrips, appInvoiceTotals, holdsByInvoice, isCleanAdvice, cleanAdvices } from "../src/advice_check.js";
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

// ── GST release + invoice value from trips (1 Nov 2026) ─────────────────────────────────────────
// Real case SMYE107027100090: July advice paid 145817.14, TDS 2975.86, hold 26782.74 on a bill of 175575.74;
// the August advice paid 26782.74 with no TDS and no hold = the GST release. The app shows this invoice as ₹1,48,793 (before GST).
const JUL = { invoiceNo: "SMYE107027100090", docType: "Invoice", totalAmt: 175575.74, paymentAmt: 145817.14, hold: 26782.74, tds: 2975.86 };
const AUG = { invoiceNo: "SMYE107027100090", docType: "Invoice", totalAmt: 26782.74, paymentAmt: 26782.74, hold: 0, tds: 0 };
const trips = [
  { id: "a", diLines: [{ billed: true, invoiceNo: "SMYE107027100090", billedAmt: 32025 }, { billed: true, invoiceNo: "SMYE107027100090", billedAmt: 20130 }, { billed: false, invoiceNo: "X", billedAmt: 5 }] },
  { id: "b", diLines: [{ billed: true, invoiceNo: "SMYE107027100090", billedAmt: 29280 }, { billed: true, invoiceNo: "SMYE107027100090", billedAmt: 28608 }] },
  { id: "c", diLines: [{ billed: true, invoiceNo: "SMYE107027100090", billedAmt: 31000 }, { billed: true, invoiceNo: "SMYE107027100090", billedAmt: 7750 }] },
  { id: "d", invoiceNo: "SINGLE1", billedToShree: 1000 },
  { id: "e", invoiceNo: "NOTBILLED", billedToShree: 0 },
];
t("invoice value in the app = sum of its billed DI amounts (before GST), single-DI trips too", () => {
  const m = invoiceBaseFromTrips(trips);
  assert.equal(m["SMYE107027100090"], 148793); assert.equal(m["SINGLE1"], 1000); assert.equal(m["X"], undefined); assert.equal(m["NOTBILLED"], undefined);
});
t("app invoice total: register value (GST included) wins, otherwise trips value + 18% GST", () => {
  const totals = appInvoiceTotals([{ invoiceNo: "REG1", totalAmt: 11800, status: "active" }, { invoiceNo: "DEL", totalAmt: 5, status: "deleted" }], trips);
  assert.equal(totals["REG1"], 11800); assert.equal(totals["SMYE107027100090"], 175575.74); assert.equal(totals["DEL"], undefined); assert.equal(totals["SINGLE1"], 1180);
});
t("the July advice (hold taken) is a normal line and ok against the trips-based value", () => {
  assert.equal(checkInvoiceLine(JUL, 175575.74).state, "ok");
});
t("GST release: payment exactly equals the hold of an earlier advice → gst_release, never an extra deduction", () => {
  const c = checkInvoiceLine(AUG, 175575.74, [26782.74]);
  assert.equal(c.state, "gst_release"); assert.equal(c.shortfall, 0); assert.equal(c.source, "earlier_hold");
});
t("GST release is recognised without the earlier advice when it equals 18% of the app invoice value", () => {
  const c = checkInvoiceLine(AUG, 175575.74, []);
  assert.equal(c.state, "gst_release"); assert.equal(c.source, "app_value");
});
t("GST release is recognised even when the invoice value is not known, if the earlier hold matches", () => {
  assert.equal(checkInvoiceLine(AUG, 0, [26782.74]).state, "gst_release");
});
t("zero hold, zero TDS but the amount matches nothing → release_unmatched (warn, no follow-up item)", () => {
  const c = checkInvoiceLine({ ...AUG, paymentAmt: 20000, totalAmt: 20000 }, 175575.74, [26782.74]);
  assert.equal(c.state, "release_unmatched"); assert.equal(c.shortfall, 0);
});
t("a normal line (hold > 0) that happens to equal an old hold is NOT a release", () => {
  assert.notEqual(checkInvoiceLine({ ...JUL, paymentAmt: 26782.74 }, 175575.74, [26782.74]).state, "gst_release");
});
t("a line with TDS is not a release", () => assert.notEqual(checkInvoiceLine({ ...AUG, tds: 10 }, 175575.74, [26782.74]).state, "gst_release"));
t("holdsByInvoice: holds from OTHER advices on or before this payment date", () => {
  const advs = [
    { utr: "U1", paymentDate: "2026-07-02", invoices: [JUL] },
    { utr: "U2", paymentDate: "2026-08-17", invoices: [AUG] },
    { utr: "U3", paymentDate: "2026-09-30", invoices: [{ ...JUL, hold: 5 }] },
  ];
  const h = holdsByInvoice(advs, { utr: "U2", paymentDate: "2026-08-17" });
  assert.deepEqual(h["SMYE107027100090"], [26782.74]);
});
t("follow-up items skip GST releases and unmatched releases", () => {
  const adv = { utr: "U2", paymentDate: "2026-08-17", invoices: [AUG, { ...AUG, invoiceNo: "Z", paymentAmt: 20000, totalAmt: 20000 }] };
  const items = extraDeductionItems(adv, { "SMYE107027100090": 175575.74, Z: 175575.74 }, "2026-11-01T00:00:00Z", { "SMYE107027100090": [26782.74], Z: [26782.74] });
  assert.equal(items.length, 0);
});

// ── "Save clean advices" (owner, 1 Nov 2026): only advices with nothing to look at ─────────────────────────────
const CL = (o) => ({ utr: "C1", paymentDate: "2026-10-16", reconciled: true, shortages: [], expenses: [], penalties: [],
  invoices: [L({ invoiceNo: "A" }), L({ invoiceNo: "B" })], ...o });
const ctx = (o) => ({ have: new Set(["A", "B"]), appTotals: { A: 928481.82, B: 928481.82 }, recordedUtrs: new Set(), ...o });
t("clean: every freight invoice in the app and paid exactly as expected", () => assert.equal(isCleanAdvice(CL(), ctx()), true));
t("not clean: an invoice is not in the app", () => assert.equal(isCleanAdvice(CL(), ctx({ have: new Set(["A"]) })), false));
t("not clean: one invoice paid less than expected (extra deduction)", () => assert.equal(isCleanAdvice(CL({ invoices: [L({ invoiceNo: "A" }), L({ invoiceNo: "B", paymentAmt: 761112.02 })] }), ctx()), false));
t("not clean: invoice value unknown (cannot check)", () => assert.equal(isCleanAdvice(CL(), ctx({ appTotals: { A: 928481.82 } })), false));
t("not clean: GST release lines stay for manual review", () => assert.equal(isCleanAdvice(CL({ invoices: [L({ invoiceNo: "A", hold: 0, tds: 0, paymentAmt: 141632.82 })] }), ctx()), false));
t("not clean: debit note / credit note line", () => assert.equal(isCleanAdvice(CL({ invoices: [L({ invoiceNo: "A" }), { invoiceNo: "KR1", docType: "Service Sales", totalAmt: -28497, paymentAmt: -28497, hold: 0, tds: 0 }] }), ctx()), false));
t("not clean: shortages, expenses or penalties present", () => {
  assert.equal(isCleanAdvice(CL({ shortages: [{ lrNo: "1" }] }), ctx()), false);
  assert.equal(isCleanAdvice(CL({ expenses: [{ x: 1 }] }), ctx()), false);
  assert.equal(isCleanAdvice(CL({ penalties: [{ x: 1 }] }), ctx()), false);
});
t("not clean: totals did not reconcile, empty advice, or UTR already recorded", () => {
  assert.equal(isCleanAdvice(CL({ reconciled: false }), ctx()), false);
  assert.equal(isCleanAdvice(CL({ invoices: [] }), ctx()), false);
  assert.equal(isCleanAdvice(CL(), ctx({ recordedUtrs: new Set(["C1"]) })), false);
});
t("not clean: before the start date", () => assert.equal(isCleanAdvice(CL({ paymentDate: "2026-03-30" }), ctx({ from: "2026-04-01" })), false));
t("cleanAdvices: skips saved/discarded drafts and lists oldest payment first", () => {
  const d = (id, utr, date, status = "waiting") => ({ id, status, utr, advice: CL({ utr, paymentDate: date }) });
  const out = cleanAdvices([d("1", "U3", "2026-10-20"), d("2", "U1", "2026-09-01"), d("3", "U2", "2026-09-15", "saved"), d("4", "U4", "2026-09-16", "discarded")], ctx());
  assert.deepEqual(out.map((x) => x.id), ["2", "1"]);
});
console.log(n + " tests passed");
