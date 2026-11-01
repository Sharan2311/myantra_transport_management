import assert from "node:assert/strict";
import fs from "node:fs";
import { parseAdviceMail, isAdviceMail, draftStatus } from "../src/advice_mail.js";
const fx = (n) => fs.readFileSync(new URL("./fixtures/" + n, import.meta.url), "utf8");
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };

t("two-invoice advice: UTR, date, amount, rows", () => {
  const a = parseAdviceMail(fx("advice_two_invoices.txt"));
  assert.equal(a.utr, "2018318075"); assert.equal(a.paymentDate, "2026-10-15");
  assert.equal(a.totalPaid, 346670.10); assert.equal(a.invoices.length, 2);
  assert.deepEqual(a.invoices[0], { invoiceNo: "SMYE107927100089", invDate: "2026-10-14", sapDoc: "5100280083", totalAmt: 225087.36, paymentAmt: 186936.96, hold: 34335.36, tds: 3815.04, narration: "CEMENT FREIGHT BILL - KODLA", location: "SCL-KODLA II", docType: "Invoice" });
  assert.equal(a.reconciled, true);
});
t("credit-note lines written as '28497.00 -' are negative and the totals still reconcile", () => {
  const a = parseAdviceMail(fx("advice_credit_notes.txt"));
  assert.equal(a.invoices.length, 4);
  assert.equal(a.invoices[2].paymentAmt, -28497); assert.equal(a.invoices[2].totalAmt, -28497); assert.equal(a.invoices[2].docType, "Service Sales");
  assert.equal(a.totalPaid, 316862.44); assert.equal(a.reconciled, true);
  assert.equal(a.tdsDeducted, 7463.56); assert.equal(a.holdAmount, 67172.04); assert.equal(a.totalBilled, 391498.04);
});
t("eleven-invoice advice reconciles", () => { const a = parseAdviceMail(fx("advice_eleven.txt")); assert.equal(a.invoices.length, 11); assert.equal(a.reconciled, true); assert.equal(a.totalPaid, 2390040.98); });
t("a wrong row amount is NOT reconciled (so the owner is warned)", () => {
  const bad = fx("advice_two_invoices.txt").replace("186936.96", "186936.00");
  assert.equal(parseAdviceMail(bad).reconciled, false);
});
t("unreadable mail returns null, never a half-filled draft", () => { assert.equal(parseAdviceMail("hello"), null); assert.equal(parseAdviceMail(""), null); assert.equal(parseAdviceMail(null), null); });
t("only Payment Advise mails from the Shree sender are picked up", () => {
  assert.equal(isAdviceMail({ sender: "noreply@shreecement.com", subject: "Payment Advise" }), true);
  assert.equal(isAdviceMail({ sender: "Shree <NoReply@ShreeCement.com>", subject: "Payment Advise " }), true);
  assert.equal(isAdviceMail({ sender: "noreply@shreecement.com", subject: "Invoice copy" }), false);
  assert.equal(isAdviceMail({ sender: "someone@gmail.com", subject: "Payment Advise" }), false);
});
t("draft status: ready when every invoice is already in the app, else waiting for the missing ones", () => {
  const a = parseAdviceMail(fx("advice_credit_notes.txt"));
  const have = new Set(["PMYE107027100046", "SMYE107027100231"]);
  const s = draftStatus(a, have);
  assert.equal(s.status, "ready"); assert.deepEqual(s.missing, []); // credit-note (Service Sales) lines are not our bills
  const s2 = draftStatus(parseAdviceMail(fx("advice_two_invoices.txt")), new Set(["SMYE107927100089"]));
  assert.equal(s2.status, "waiting"); assert.deepEqual(s2.missing, ["SMYE107027100218"]);
  const s3 = draftStatus(parseAdviceMail(fx("advice_two_invoices.txt")), new Set(["SMYE107927100089", "SMYE107027100218"]));
  assert.equal(s3.status, "ready"); assert.deepEqual(s3.missing, []);
});
t("an advice that does not reconcile is never 'ready'", () => {
  const bad = parseAdviceMail(fx("advice_two_invoices.txt").replace("186936.96", "186936.00"));
  assert.equal(draftStatus(bad, new Set(["SMYE107927100089", "SMYE107027100218"])).status, "check");
});
console.log(n + " tests passed");
