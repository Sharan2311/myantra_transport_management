// Shree Cement "Payment Advise" e-mail → the same shape the app's payment-advice scan produces,
// so the existing review screen can show it pre-filled. The advice is plain text in the mail body
// (no PDF), so this is a plain parser: no AI and no cost.
const num = (s) => {
  const x = String(s ?? "").trim().replace(/,/g, "");
  if (!x) return 0;
  const neg = /-\s*$/.test(x) || /^-/.test(x);
  const v = parseFloat(x.replace(/-/g, "").trim());
  return Number.isFinite(v) ? (neg ? -v : v) : 0;
};
const isoDate = (d) => { const m = String(d || "").match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
const r2 = (x) => Math.round(x * 100) / 100;

export const isAdviceMail = ({ sender = "", subject = "" } = {}) =>
  /noreply@shreecement\.com/i.test(sender) && /^\s*payment advise\s*$/i.test(subject);

export const parseAdviceMail = (text) => {
  const body = String(text ?? "");
  const m = body.match(/for Rs\.\s*([\d.,]+)[\s\S]*?dated\s+(\d{2}\.\d{2}\.\d{4})\s+vide UTR No\.\s*(\w+)/);
  if (!m) return null;
  const invoices = [];
  let total = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const c = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
    if (c.length < 11) continue;
    if (/^\d+$/.test(c[0])) {
      invoices.push({ invoiceNo: c[2], invDate: isoDate(c[3]), sapDoc: c[9], totalAmt: num(c[7]), paymentAmt: num(c[4]), hold: num(c[6]), tds: num(c[5]),
        narration: c[8], location: c[10], docType: c[1] });
    } else if (/^total$/i.test(c[1])) {
      total = { pay: num(c[4]), tds: num(c[5]), hold: num(c[6]), bill: num(c[7]) };
    }
  }
  if (!invoices.length) return null;
  const totalPaid = num(m[1]);
  const reconciled = Math.abs(r2(invoices.reduce((s, i) => s + i.paymentAmt, 0)) - totalPaid) < 0.01;
  return { type: "payment", utr: m[3], paymentDate: isoDate(m[2]), totalPaid,
    totalBilled: total ? total.bill : r2(invoices.reduce((s, i) => s + i.totalAmt, 0)),
    tdsDeducted: total ? total.tds : r2(invoices.reduce((s, i) => s + i.tds, 0)),
    holdAmount: total ? total.hold : r2(invoices.reduce((s, i) => s + i.hold, 0)),
    invoices, shortages: [], expenses: [], penalties: [], reconciled, _source: "email" };
};

// Our freight bills are the positive "Invoice" lines. They must already be uploaded in the app
// (haveInvoiceNos) before the advice can be saved. Otherwise the draft waits.
export const draftStatus = (advice, haveInvoiceNos) => {
  const have = haveInvoiceNos instanceof Set ? haveInvoiceNos : new Set(haveInvoiceNos || []);
  const missing = (advice?.invoices || []).filter((i) => /^invoice$/i.test(i.docType || "Invoice") && i.paymentAmt > 0 && !have.has((i.invoiceNo || "").trim())).map((i) => i.invoiceNo);
  if (!advice?.reconciled) return { status: "check", missing };
  return { status: missing.length ? "waiting" : "ready", missing };
};

// The mails are HTML (an unclosed <tr> per row, <th> header, <B> around totals). Turn the table into the
// same pipe-separated lines the text parser reads, so there is ONE parser for both.
const decode = (t) => t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
export const htmlToAdviceText = (html) => decode(String(html ?? "")
  .replace(/<\/t[dh]\s*>/gi, " | ").replace(/<tr\b[^>]*>/gi, "\n| ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/table>/gi, "\n")
  .replace(/<[^>]+>/g, " ")).split("\n").map((l) => l.replace(/[ \t\r]+/g, " ").trim()).join("\n");
export const parseAdviceHtml = (html) => parseAdviceMail(htmlToAdviceText(html));

// Search drafts by UTR or invoice number (case, spaces ignored). Empty query = everything.
export const searchAdvices = (rows, q) => {
  const k = String(q ?? "").replace(/\s+/g, "").toLowerCase();
  if (!k) return rows || [];
  return (rows || []).filter((r) => String(r.utr || "").toLowerCase().includes(k)
    || (r.advice?.invoices || []).some((i) => String(i.invoiceNo || "").replace(/\s+/g, "").toLowerCase().includes(k)));
};
