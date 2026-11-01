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

// A GST release pays back an earlier hold: no TDS, no new hold, and the amount is exactly that invoice's GST hold.
export const GST_MATCH = 0.02;
const near = (a, b) => Math.abs(a - b) <= GST_MATCH;

export const checkInvoiceLine = (line, appTotal, priorHolds = []) => {
  const exp = expectedFor(appTotal);
  const actualPay = +(line?.paymentAmt) || 0;
  const noHoldNoTds = !(+line?.hold > 0) && !(+line?.tds > 0);
  if (noHoldNoTds && actualPay > 0) {
    if ((priorHolds || []).some((h) => near(+h, actualPay))) return { state: "gst_release", source: "earlier_hold", expected: exp, actualPay, shortfall: 0 };
    if (exp.total > 0 && near(exp.gst, actualPay)) return { state: "gst_release", source: "app_value", expected: exp, actualPay, shortfall: 0 };
    return { state: "release_unmatched", expected: exp, actualPay, shortfall: 0 };
  }
  if (!(exp.total > 0)) return { state: "no_app_value", expected: exp, actualPay, shortfall: 0 };
  const diff = r2(exp.pay - actualPay);
  if (diff > TOLERANCE) return { state: "extra_deduction", expected: exp, actualPay, shortfall: diff };
  if (diff < -TOLERANCE) return { state: "overpaid", expected: exp, actualPay, shortfall: 0 };
  return { state: "ok", expected: exp, actualPay, shortfall: 0 };
};

// Invoice value as the app shows it: the sum of the billed DI amounts (this is BEFORE GST).
export const invoiceBaseFromTrips = (trips) => {
  const m = {};
  const add = (no, amt) => { const k = String(no || "").trim(); if (k && +amt > 0) m[k] = r2((m[k] || 0) + +amt); };
  (trips || []).forEach((t) => {
    const lines = t.diLines || [];
    if (lines.length) lines.filter((d) => d.billed && d.invoiceNo).forEach((d) => add(d.invoiceNo, d.billedAmt));
    else if (t.billedToShree && t.invoiceNo) add(t.invoiceNo, t.billedToShree);
  });
  return m;
};

// Invoice total including GST (what Shree's advice calls "Total Bill Amount"): the invoice register's value when there is one
// (it already includes GST), otherwise the trips' billed value + 18%.
export const appInvoiceTotals = (registry, trips) => {
  const m = {};
  const base = invoiceBaseFromTrips(trips);
  Object.keys(base).forEach((k) => { m[k] = r2(base[k] * (1 + GST_RATE)); });
  (registry || []).forEach((r) => { if (r.status !== "deleted" && r.invoiceNo && +r.totalAmt > 0) m[String(r.invoiceNo).trim()] = +r.totalAmt; });
  return m;
};

// GST holds taken on each invoice by OTHER advices paid on or before this one.
export const holdsByInvoice = (advices, current) => {
  const m = {};
  (advices || []).forEach((a) => {
    if (!a || a.utr === current?.utr) return;
    if (current?.paymentDate && a.paymentDate && a.paymentDate > current.paymentDate) return;
    (a.invoices || []).forEach((i) => { const h = +i.hold || 0, k = String(i.invoiceNo || "").trim(); if (h > 0 && k) (m[k] = m[k] || []).push(h); });
  });
  return m;
};

// Open follow-up items (ids are stable per UTR+invoice so saving the same advice twice never duplicates).
export const extraDeductionItems = (advice, appTotalsByInvoice, nowIso, holds = {}) =>
  (advice?.invoices || [])
    .filter((i) => /^invoice$/i.test(i.docType || "Invoice") && (+i.paymentAmt || 0) > 0)
    .map((i) => ({ line: i, c: checkInvoiceLine(i, appTotalsByInvoice?.[(i.invoiceNo || "").trim()], holds?.[(i.invoiceNo || "").trim()]) }))
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

// An advice with nothing for the owner to look at: reconciles, only freight invoices that are all in the app and paid exactly
// as expected (2% TDS, 18% GST held) — no GST release, debit/credit note, shortage, expense, penalty or extra deduction.
export const isCleanAdvice = (advice, { have, appTotals, recordedUtrs, from } = {}) => {
  if (!advice || !advice.reconciled || !(advice.invoices || []).length) return false;
  if (recordedUtrs && recordedUtrs.has(advice.utr)) return false;
  if (from && (advice.paymentDate || "") < from) return false;
  if ((advice.shortages || []).length || (advice.expenses || []).length || (advice.penalties || []).length) return false;
  return advice.invoices.every((i) => {
    const no = String(i.invoiceNo || "").trim();
    if (!/^invoice$/i.test(i.docType || "Invoice") || !(+i.paymentAmt > 0) || !have?.has(no)) return false;
    return checkInvoiceLine(i, appTotals?.[no]).state === "ok";
  });
};

// Drafts that can be saved without looking, oldest payment first.
export const cleanAdvices = (drafts, ctx) =>
  (drafts || []).filter((d) => d.status !== "saved" && d.status !== "discarded" && isCleanAdvice(d.advice, ctx))
    .sort((a, b) => String(a.advice.paymentDate).localeCompare(String(b.advice.paymentDate)));
