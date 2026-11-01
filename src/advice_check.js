// Payment-advice checks against the invoice value already in the app.
// Rule (owner, 1 Nov 2026), verified on 27 real invoices: the app's invoice total includes 18% GST.
//   base = total / 1.18 · TDS = 2% of base · GST (18%) is shown as "Hold" · payment = base - TDS.
// Any payment below that is an EXTRA DEDUCTION without a reason → follow up with the company.
// Differences under ₹1 are rounding.
export const GST_RATE = 0.18, TDS_RATE = 0.02, TOLERANCE = 1;
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export const expectedFor = (appTotal) => {
  const total = +appTotal || 0;
  const base = r2(total / (1 + GST_RATE));
  const tds = r2(base * TDS_RATE);
  return { total, base, tds, gst: r2(total - base), pay: r2(base - tds) };
};

export const checkInvoiceLine = (line, appTotal) => {
  const exp = expectedFor(appTotal);
  const actualPay = +(line?.paymentAmt) || 0;
  if (!(exp.total > 0)) return { state: "no_app_value", expected: exp, actualPay, shortfall: 0 };
  const diff = r2(exp.pay - actualPay);
  if (diff > TOLERANCE) return { state: "extra_deduction", expected: exp, actualPay, shortfall: diff };
  if (diff < -TOLERANCE) return { state: "overpaid", expected: exp, actualPay, shortfall: 0 };
  return { state: "ok", expected: exp, actualPay, shortfall: 0 };
};

// Open follow-up items (ids are stable per UTR+invoice so saving the same advice twice never duplicates).
export const extraDeductionItems = (advice, appTotalsByInvoice, nowIso) =>
  (advice?.invoices || [])
    .filter((i) => /^invoice$/i.test(i.docType || "Invoice") && (+i.paymentAmt || 0) > 0)
    .map((i) => ({ line: i, c: checkInvoiceLine(i, appTotalsByInvoice?.[(i.invoiceNo || "").trim()]) }))
    .filter(({ c }) => c.state === "extra_deduction")
    .map(({ line, c }) => ({
      id: `XD-${advice.utr}-${line.invoiceNo}`, type: "extra_deduction", status: "open",
      invoiceNo: line.invoiceNo, invoiceDate: line.invDate || "", utr: advice.utr, payDate: advice.paymentDate || "",
      // action-items table columns that survive a reload: invoiceAmt = invoice value, expectedAmt = expected payment, grNo = UTR
      invoiceAmt: c.expected.total, expectedAmt: c.expected.pay, grNo: advice.utr,
      amount: c.shortfall, expectedPay: c.expected.pay, actualPay: c.actualPay, appTotal: c.expected.total,
      note: `Paid ₹${c.actualPay} against expected ₹${c.expected.pay} (invoice ₹${c.expected.total}, TDS 2%) — extra ₹${c.shortfall} deducted with no reason. Follow up with Shree.`,
      createdAt: nowIso,
    }));

// Assign part (or all) of a debit-note shortage to one vehicle; the rest stays open.
export const splitShortage = (item, amount) => {
  const total = r2(+item?.amount || 0), a = typeof amount === "number" ? r2(amount) : NaN;
  if (!Number.isFinite(a) || a <= 0 || a > total) return { ok: false };
  return { ok: true, assigned: a, remaining: r2(total - a) };
};
