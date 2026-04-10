// netlify/functions/scan-shree.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { base64, mediaType, scanType } = body;

  const INVOICE_PROMPT = `You are reading a freight tax invoice PDF from M Yantra Enterprises to Shree Cement or Ultratech Cement.

══════════════════════════════════════════════════════════════
CRITICAL: HOW TO READ THIS PDF TABLE
══════════════════════════════════════════════════════════════

This PDF was generated from a database and uses a fixed-width table layout.
When a cell value is too long to fit on one line, it WRAPS to the next line
WITHIN THE SAME CELL. This means:

1. A single cell's value may appear across 2, 3, or more lines in the PDF.
2. The next column's value starts in a new column position, NOT on the next line.
3. You must read the PDF column-by-column, NOT line-by-line.

The table columns are (in order):
S.No | DI NO | INV NO | DATE | TRUCK NO | GR NO | CONSIGNEE NAME | STATION | GRADE | DESP QTY | FRT RATE | FRT AMT

HOW TO HANDLE EACH COLUMN:

DI NO — Always exactly 10 digits (e.g. 9003367634)
  ⚠ Most common wrap: "90033676" on line 1, "34" on line 2 → full value = "9003367634"
  ⚠ Do NOT confuse the second line of DI NO with the INV NO column
  ✓ Rule: count digits — if fewer than 10, the remaining digits are on the next line

INV NO — A separate column (e.g. "KR25020302 34" or just "34")
  ⚠ Do NOT include INV NO digits in the DI NO value
  ✓ The INV NO is separate and you do NOT need to extract it

TRUCK NO — Vehicle registration number, e.g. "KA28AA4790" or "MH29BE1340"
  ⚠ May wrap: "KA28AA" on line 1, "4790" on line 2 → full value = "KA28AA4790"
  ✓ Rule: uppercase, no spaces, typically 8-10 characters

GR NO — Format: 1070/MYE/XXXX (e.g. 1070/MYE/3881)
  ⚠ May wrap: "1070/MYE/" on line 1, "3881" on line 2 → full value = "1070/MYE/3881"
  ✓ Must always contain two forward slashes

CONSIGNEE NAME — Long names often wrap across 2-3 lines
  ✓ Join all lines that belong to the same cell

DESP QTY — Quantity in MT, a decimal number (e.g. 36.00)
FRT RATE — Rate per MT, a decimal number (e.g. 1219.00)
FRT AMT — Amount = QTY × RATE (e.g. 43884.00)
  ✓ Verify: FRT AMT should equal DESP QTY × FRT RATE

DATE — Trip date (e.g. "22-Mar-2026")

══════════════════════════════════════════════════════════════
VERIFICATION STEP (do this before returning):
- Each diNo must be exactly 10 digits — if not, find and append missing digits
- Each truckNo must be 8-10 uppercase alphanumeric characters
- Each grNo must contain exactly 2 forward slashes
- Each frtAmt should approximately equal qty × frRate
══════════════════════════════════════════════════════════════

Return ONLY this JSON (no markdown, no extra text):
{
  "type": "invoice",
  "invoiceNo": "complete invoice number from header",
  "invoiceDate": "date as shown in header",
  "totalAmount": 0.00,
  "trips": [
    {
      "diNo": "EXACTLY 10 digits — join all wrapped parts of the DI NO cell",
      "grNo": "complete GR number with slashes e.g. 1070/MYE/3881",
      "truckNo": "complete vehicle registration uppercase no spaces",
      "consigneeName": "complete consignee name joined from all wrapped lines",
      "to": "destination station/city",
      "qty": 0.0,
      "frRate": 0.0,
      "frtAmt": 0.00
    }
  ]
}

One object in trips[] per table row. Use empty string or 0 for missing fields.`;

  const PAYMENT_PROMPT = `You are reading a payment advice / remittance advice from Shree Cement or Ultratech to M Yantra Enterprises.

This PDF may also have wrapped cell values — read each cell completely before moving to the next column.

Return ONLY this JSON (no markdown, no explanation):
{
  "type": "payment",
  "utr": "UTR/transaction reference number",
  "paymentDate": "payment date",
  "totalPaid": 0.00,
  "totalBilled": 0.00,
  "tdsDeducted": 0.00,
  "holdAmount": 0.00,
  "invoices": [
    {
      "invoiceNo": "invoice reference — complete value, join wrapped lines",
      "invDate": "invoice date",
      "sapDoc": "SAP document number if present",
      "totalAmt": 0.00,
      "paymentAmt": 0.00,
      "hold": 0.00,
      "tds": 0.00
    }
  ],
  "shortages": [
    { "lrNo": "LR number", "tonnes": 0.0, "deduction": 0.00, "ref": "reference" }
  ],
  "expenses": [
    { "description": "description", "amount": 0.00 }
  ],
  "penalties": []
}
If a field is missing use empty string or 0.`;

  const prompt = scanType === "invoice" ? INVOICE_PROMPT : PAYMENT_PROMPT;
  const isImage = mediaType && mediaType.startsWith("image/");

  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}` }),
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Could not parse AI response: " + text.slice(0, 300) })
      };
    }

    // ── Post-process and validate invoice trips ────────────────────────────────
    if (parsed.trips && Array.isArray(parsed.trips)) {
      parsed.trips = parsed.trips.map(t => {

        // 1. DI number — must be exactly 10 digits
        const diDigits = String(t.diNo || "").replace(/\D/g, "");
        if (diDigits.length > 0 && diDigits.length !== 10) {
          console.warn(`scan-shree: DI "${t.diNo}" → ${diDigits.length} digits, expected 10`);
          t._diNoWarning = `${diDigits.length} digits extracted, expected 10`;
        }
        t.diNo = diDigits;

        // 2. Truck number — strip spaces, uppercase
        t.truckNo = String(t.truckNo || "").replace(/\s+/g, "").toUpperCase();

        // 3. GR number — must contain slashes (1070/MYE/XXXX)
        const grNo = String(t.grNo || "");
        if (grNo && !grNo.includes("/")) {
          console.warn(`scan-shree: GR "${grNo}" missing slashes — may be truncated`);
          t._grNoWarning = "GR number may be incomplete";
        }

        // 4. Normalize frtRate → frRate for App.jsx compatibility
        if (t.frtRate !== undefined && t.frRate === undefined) {
          t.frRate = t.frtRate;
          delete t.frtRate;
        }

        // 5. Verify frtAmt = qty × frRate (flag large discrepancies)
        const calcAmt = (t.qty || 0) * (t.frRate || 0);
        if (calcAmt > 0 && t.frtAmt > 0 && Math.abs(calcAmt - t.frtAmt) > 5) {
          console.warn(`scan-shree: frtAmt ${t.frtAmt} ≠ qty(${t.qty}) × frRate(${t.frRate}) = ${calcAmt}`);
          t._amtWarning = `Calculated ${calcAmt} vs extracted ${t.frtAmt}`;
        }

        return t;
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };

  } catch(e) {
    console.error("scan-shree error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Function error: " + e.message }) };
  }
};
