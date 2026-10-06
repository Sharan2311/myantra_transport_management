// netlify/functions/scan-shree-background.js
// Background function — no timeout limit (up to 15 min)
// Processes large invoices and saves result to admin Supabase

const INVOICE_PROMPT = `You are reading a freight tax invoice PDF from M Yantra Enterprises to Shree Cement or Ultratech Cement.

══════════════════════════════════════════════════════════════
CRITICAL: HOW TO READ THIS PDF TABLE
══════════════════════════════════════════════════════════════

This PDF uses a fixed-width table layout. When a cell value is too long, it WRAPS
to the next line WITHIN THE SAME CELL. Read column-by-column, NOT line-by-line.

Table columns (in order):
S.No | DI NO | INV NO | DATE | TRUCK NO | GR NO | CONSIGNEE NAME | STATION | GRADE | DESP QTY | FRT RATE | FRT AMT | KA TAX | TOLL TAX | BORDER ENTRY CHARGES | IGST 18.0% | CGST 9.0% | SGST 9.0% | TotalTax AMT

IMPORTANT — the row does NOT end at FRT AMT. FRT AMT is followed by five more columns:
KA TAX, TOLL TAX, BORDER ENTRY CHARGES (these three are usually 0.00 or blank), then
IGST 18.0%, CGST 9.0%, SGST 9.0%, and finally TotalTax AMT. On invoices where only IGST
applies, TotalTax AMT equals the IGST value — a MUCH smaller number than FRT AMT (it is
roughly 18% of FRT AMT, not the freight amount itself). Never extract IGST, CGST, SGST,
or TotalTax AMT as frtAmt — those are tax columns near the right edge of the row.

FIELD RULES — copy values exactly, null if not clearly readable:

INVOICE NUMBER (the top-level "invoiceNo" field):
- Read it from the page HEADER, printed next to the label "Freight Bill No" (e.g. SKOR107027100034
  or a similar PMYE/SMYE/SKOR... style number). Copy it exactly, uppercase, no spaces.
- It is NOT the per-row "INV NO" column in the table (values like KR2602004407) — those are the
  supplier's individual invoice numbers for each row and must never be used as the invoiceNo.
- If the header has no "Freight Bill No" label, use the bill/invoice number printed in the header.
- Return null only if no such header number is clearly readable.

DI NO:
- Always exactly 10 digits (e.g. 9003367634)
- Often wraps: "90033676" line 1, "34" line 2 → join to "9003367634"
- Count digits — if fewer than 10, remaining digits are on the next line
- NEVER include INV NO digits in the DI NO

TRUCK NO:
- Vehicle registration, uppercase, no spaces (e.g. KA28AA4790)
- May wrap: "KA28AA" + "4790" → join to "KA28AA4790"
- Typically 8-10 characters

GR NO:
- Format: 1070/MYE/XXXX — always exactly 2 forward slashes
- May wrap: "1070/MYE/" + "3881" → join to "1070/MYE/3881"

CONSIGNEE NAME: May wrap across 2-3 lines — join all parts
DESP QTY: decimal number in MT (e.g. 36.00)
FRT RATE: rate per MT (e.g. 1219.00)
FRT AMT: the freight amount column, immediately to the right of FRT RATE and immediately
  to the LEFT of KA TAX/TOLL TAX/BORDER ENTRY CHARGES/IGST/CGST/SGST/TotalTax AMT. Copy the
  number PRINTED in that column exactly as shown — never compute it, never substitute
  DESP QTY x FRT RATE in its place. The equation DESP QTY x FRT RATE is only a sanity check
  for WHICH column you are looking at: if a candidate number is wildly different from that
  product (not merely rounded slightly differently), you have the wrong column — look again
  for the actual FRT AMT cell instead of a nearby tax column. Once you have found the right
  column, report the digits printed there, not a recalculated value.
DATE: trip date

STRICT RULES:
- Return null for any field you cannot clearly read — never guess
- Do NOT use values from memory or previous documents — read THIS document only

Return ONLY this JSON, no markdown, no explanation:
{
  "type": "invoice",
  "invoiceNo": "<Freight Bill No from the header, NOT the INV NO table column, or null>",
  "invoiceDate": "<date from header or null>",
  "totalAmount": <total amount as number or null>,
  "trips": [
    {
      "diNo": "<exactly 10 digits, joined if wrapped, or null>",
      "grNo": "<1070/MYE/XXXX format or null>",
      "truckNo": "<uppercase no spaces or null>",
      "consigneeName": "<full name joined from all wrapped lines or null>",
      "to": "<destination station/city or null>",
      "qty": <number or null>,
      "frRate": <number or null>,
      "frtAmt": <number or null>,
      "date": "<date as shown or null>"
    }
  ]
}`;

const MANUAL_INVOICE_PROMPT = `You are reading a freight "Tax Invoice" / bill PDF issued BY M Yantra Enterprises TO Shree Cement Limited for transportation of cement (GTA). The page is printed ROTATED 90 degrees (landscape table) — mentally rotate it so the header "Tax Invoice" reads normally before extracting. The table CONTINUES onto the next page(s): extract EVERY numbered row on ALL pages, and stop at the row labelled TOTAL.

HEADER (top / right-hand block): FREIGHT BILL NO (e.g. FGL/MYE/27/1), BILL DATE, and the document number.

TABLE COLUMNS (left to right after rotation):
Sr | SHIPMENT | Inv Date | GR/TR No | GR Date | DI No | Truck No | Consignee | Destination | Weight (MT) | Rate/MT | Freight | Total Amount | CGST 9% | SGST 9% | IGST 18% | Sht-BG/Wt

There is also a "DI - NOTE" column printed down the far edge that repeats the DI numbers — use it only to cross-check the DI No column.

FIELD RULES — copy exactly, null if not clearly readable, NEVER guess:
- diNo: the "DI No" column, exactly 10 digits, normally starting with 9 (e.g. 9002126867). Do NOT confuse it with SHIPMENT, which also has 10 digits but starts with 13 (e.g. 1301661495). Never put the shipment number in diNo.
- shipment: the SHIPMENT column value (10 digits starting 13...).
- grNo: the "GR/TR No" column, format 1070/MYE/XXXX (two forward slashes), e.g. 1070/MYE/2375.
- grDate: the "GR Date" column, as printed (DD-MM-YYYY).
- truckNo: uppercase, no spaces (e.g. KA32B4418). Join wrapped parts.
- consigneeName: join wrapped lines.  to: the Destination column.
- qty: Weight (MT) column (e.g. 35.00).  frRate: Rate/MT column.
- frtAmt: the FREIGHT column — the amount BEFORE GST. Copy the printed number exactly. It is NOT the Total Amount column (which is usually equal for these bills) and NOT CGST/SGST. Sanity check: qty x frRate should be close to frtAmt.
- sr: the Sr number of the row.

Return ONLY this JSON, no markdown, no explanation:
{
  "type": "manual_invoice",
  "invoiceNo": "<FREIGHT BILL NO or null>",
  "invoiceDate": "<BILL DATE as printed or null>",
  "totalFreight": <freight total from the TOTAL row or null>,
  "gstTotal": <GST Total shown near the bottom or null>,
  "totalAmount": <grand Total Amt shown near the bottom or null>,
  "trips": [
    { "sr": <number or null>, "diNo": "<10 digits or null>", "shipment": "<or null>", "grNo": "<1070/MYE/XXXX or null>",
      "grDate": "<as printed or null>", "truckNo": "<or null>", "consigneeName": "<or null>", "to": "<or null>",
      "qty": <number or null>, "frRate": <number or null>, "frtAmt": <number or null>, "date": "<same as grDate or null>" }
  ]
}`;

const PAYMENT_PROMPT = `You are reading a payment advice / remittance advice PDF from Shree Cement or Ultratech to M Yantra Enterprises.
This PDF may have wrapped cell values — read each cell completely before moving to the next column.
STRICT RULES: Copy all values exactly as printed. Return null for any field not clearly readable.

Return ONLY this JSON, no markdown, no explanation:
{
  "type": "payment",
  "utr": "<UTR/transaction reference number or null>",
  "paymentDate": "<payment date or null>",
  "totalPaid": <number or null>,
  "totalBilled": <number or null>,
  "tdsDeducted": <number or null>,
  "holdAmount": <number or null>,
  "invoices": [
    { "invoiceNo": "<complete invoice number or null>", "invDate": "<invoice date or null>",
      "sapDoc": "<SAP document number or null>", "totalAmt": <number or null>,
      "paymentAmt": <number or null>, "hold": <number or null>, "tds": <number or null> }
  ],
  "shortages": [
    { "lrNo": "<LR number or null>", "tonnes": <number or null>, "deduction": <number or null>, "ref": "<reference or null>" }
  ],
  "expenses": [{ "description": "<description or null>", "amount": <number or null>,
    "categoryHint": "<best guess at ONE of: Rent, Rebidding Charges, SD Deposit, Electricity, Penalties, TDS, Miscellaneous, or null if unclear>" }],
  "penalties": []
}`;

// Save result to admin Supabase via REST API (no npm package needed)
async function saveResult(adminUrl, adminKey, jobId, clientId, status, result) {
  try {
    await fetch(`${adminUrl}/rest/v1/scan_results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminKey}`,
        "apikey": adminKey,
        "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify({ id: jobId, client_id: clientId, status, result_json: JSON.stringify(result) })
    });
  } catch(e) {
    console.error("[scan-shree-bg] saveResult failed:", e.message);
  }
}

exports.handler = async (event) => {
  let jobId, adminUrl, adminKey, clientId;
  try {
    const body = JSON.parse(event.body);
    jobId    = body.jobId;
    adminUrl = process.env.ADMIN_SUPABASE_URL  || body.adminSupabaseUrl;
    adminKey = process.env.ADMIN_SUPABASE_ANON_KEY || body.adminSupabaseAnonKey;
    clientId = body.clientId;
    const { base64, mediaType, scanType, anthropicKey, fileUrl } = body;

    const prompt = scanType === "invoice" ? INVOICE_PROMPT : scanType === "manual_invoice" ? MANUAL_INVOICE_PROMPT : PAYMENT_PROMPT;
    // Large PDFs exceed the background-function request-size cap, so the client can upload the
    // file to storage and send only a URL — Anthropic fetches the PDF from that URL itself.
    const contentBlock = fileUrl
      ? { type: "document", source: { type: "url", url: fileUrl } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 16000,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }] }),
    });

    const data = await response.json();

    // Calculate cost
    let _costInr = 0;
    if (data.usage) {
      const { input_tokens, output_tokens } = data.usage;
      const costUSD = (input_tokens * 3.00 + output_tokens * 15.00) / 1_000_000;
      _costInr = +(costUSD * 84).toFixed(4);
      console.log(`[scan-shree-bg:${scanType}] ${input_tokens} in / ${output_tokens} out | $${costUSD.toFixed(6)} (~Rs.${_costInr})`);
    }

    if (!response.ok) {
      await saveResult(adminUrl, adminKey, jobId, clientId, "error",
        { error: `Anthropic ${response.status}: ${data.error?.message}` });
      return { statusCode: 200 };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    // Extract JSON object directly - handles trailing notes after closing }
    const jsonMatch = text.match(/{[\s\S]*}/);
    const clean = jsonMatch ? jsonMatch[0].trim() : text.replace(/```json|```/g, "").trim();
    // Fix unescaped control chars inside JSON string values from PDF
    const fixJsonStrings = s => s.replace(/"(?:[^"\\]|\\.)*"/gs, m =>
      m.replace(/\n/g, " ").replace(/\r/g, " ").replace(/\t/g, " ")
        .replace(/[\x00-\x1f]/g, " ")
    );
    console.log("[scan-shree-bg] RAW text length:", text.length);
    console.log("[scan-shree-bg] CLEAN to parse:\n", fixJsonStrings(clean));
    let parsed;
    try {
      // Fix invalid leading zeros in JSON numbers: 05.050 -> 5.050
      const fixedClean = fixJsonStrings(clean).replace(/([:\[,]\s*)0(\d)/g, '$1$2');
      parsed = JSON.parse(fixedClean);
    }
    catch(e) {
      await saveResult(adminUrl, adminKey, jobId, clientId, "error",
        { error: "Could not parse AI response: " + text.slice(0, 200) });
      return { statusCode: 200 };
    }

    // Post-process invoice trips
    if (parsed.trips && Array.isArray(parsed.trips)) {
      parsed.trips = parsed.trips.map(t => {
        if (t.diNo != null) {
          const digits = String(t.diNo).replace(/\D/g, "");
          if (digits.length > 0 && digits.length !== 10) t._diNoWarning = `${digits.length} digits, expected 10`;
          t.diNo = digits || null;
        }
        if (t.truckNo != null) t.truckNo = String(t.truckNo).replace(/\s+/g, "").toUpperCase();
        if (t.grNo != null) {
          const slashes = (String(t.grNo).match(/\//g) || []).length;
          if (slashes !== 2) t._grNoWarning = `GR has ${slashes} slash(es), expected 2`;
        }
        if (t.frtRate !== undefined && t.frRate === undefined) { t.frRate = t.frtRate; delete t.frtRate; }
        if (t.qty != null && t.frRate != null && t.frtAmt != null) {
          const calc = Math.round((t.qty * t.frRate) * 100) / 100;
          if (Math.abs(calc - t.frtAmt) > 5) t._amtWarning = `Calc ${calc} vs extracted ${t.frtAmt}`;
        }
        return t;
      });
      if (parsed.trips.length === 0) {
        await saveResult(adminUrl, adminKey, jobId, clientId, "error",
          { error: "No trip rows found in invoice." });
        return { statusCode: 200 };
      }
    }

    parsed._costInr = _costInr;
    parsed._scanType = (scanType === "invoice" || scanType === "manual_invoice") ? "shree_scan" : "shree_payment_scan";
    await saveResult(adminUrl, adminKey, jobId, clientId, "done", parsed);

  } catch(e) {
    console.error("[scan-shree-bg] Error:", e.message);
    if (adminUrl && jobId)
      await saveResult(adminUrl, adminKey, jobId, clientId, "error", { error: "Function error: " + e.message });
  }

  return { statusCode: 200 };
};
