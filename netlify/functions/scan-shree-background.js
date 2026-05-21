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
S.No | DI NO | INV NO | DATE | TRUCK NO | GR NO | CONSIGNEE NAME | STATION | GRADE | DESP QTY | FRT RATE | FRT AMT

FIELD RULES — copy values exactly, null if not clearly readable:

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
FRT AMT: should equal DESP QTY x FRT RATE
DATE: trip date

STRICT RULES:
- Return null for any field you cannot clearly read — never guess
- Do NOT use values from memory or previous documents — read THIS document only

Return ONLY this JSON, no markdown, no explanation:
{
  "type": "invoice",
  "invoiceNo": "<invoice number from header or null>",
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
  "expenses": [{ "description": "<description or null>", "amount": <number or null> }],
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
    const { base64, mediaType, scanType, anthropicKey } = body;

    const prompt = scanType === "invoice" ? INVOICE_PROMPT : PAYMENT_PROMPT;
    const contentBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

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
    let parsed;
    try { parsed = JSON.parse(fixJsonStrings(clean)); }
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
    parsed._scanType = scanType === "invoice" ? "shree_scan" : "shree_payment_scan";
    await saveResult(adminUrl, adminKey, jobId, clientId, "done", parsed);

  } catch(e) {
    console.error("[scan-shree-bg] Error:", e.message);
    if (adminUrl && jobId)
      await saveResult(adminUrl, adminKey, jobId, clientId, "error", { error: "Function error: " + e.message });
  }

  return { statusCode: 200 };
};
