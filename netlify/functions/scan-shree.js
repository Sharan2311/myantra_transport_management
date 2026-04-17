// netlify/functions/scan-shree.js

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

CONSIGNEE NAME:
- May wrap across 2-3 lines — join all parts

DESP QTY: decimal number in MT (e.g. 36.00)
FRT RATE: rate per MT (e.g. 1219.00)
FRT AMT: should equal DESP QTY × FRT RATE — if not, flag it
DATE: trip date

STRICT RULES:
- Return null for any field you cannot clearly read — never guess
- Do NOT use values from memory or previous documents — read THIS document only
- Verify: diNo = exactly 10 digits, grNo has exactly 2 slashes, truckNo is 8-10 chars

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

STRICT RULES:
- Copy all values exactly as printed
- Return null for any field not clearly readable — never guess
- Invoice numbers must be copied verbatim — join wrapped parts

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
    {
      "invoiceNo": "<complete invoice number, join wrapped lines or null>",
      "invDate": "<invoice date or null>",
      "sapDoc": "<SAP document number or null>",
      "totalAmt": <number or null>,
      "paymentAmt": <number or null>,
      "hold": <number or null>,
      "tds": <number or null>
    }
  ],
  "shortages": [
    { "lrNo": "<LR number or null>", "tonnes": <number or null>, "deduction": <number or null>, "ref": "<reference or null>" }
  ],
  "expenses": [
    { "description": "<description or null>", "amount": <number or null> }
  ],
  "penalties": []
}`;

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

      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
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

    // ── Post-process invoice trips ─────────────────────────────────────────────
    if (parsed.trips && Array.isArray(parsed.trips)) {
      parsed.trips = parsed.trips.map(t => {

        // DI number — must be exactly 10 digits
        if (t.diNo != null) {
          const digits = String(t.diNo).replace(/\D/g, "");
          if (digits.length > 0 && digits.length !== 10) {
            t._diNoWarning = `${digits.length} digits extracted, expected 10`;
          }
          t.diNo = digits || null;
        }

        // Truck number — strip spaces, uppercase
        if (t.truckNo != null) {
          t.truckNo = String(t.truckNo).replace(/\s+/g, "").toUpperCase();
        }

        // GR number — must contain 2 slashes
        if (t.grNo != null) {
          const slashes = (String(t.grNo).match(/\//g) || []).length;
          if (slashes !== 2) {
            t._grNoWarning = `GR "${t.grNo}" has ${slashes} slash(es), expected 2`;
          }
        }

        // Rename frtRate → frRate for App.jsx compatibility
        if (t.frtRate !== undefined && t.frRate === undefined) {
          t.frRate = t.frtRate;
          delete t.frtRate;
        }

        // Verify frtAmt = qty × frRate
        if (t.qty != null && t.frRate != null && t.frtAmt != null) {
          const calc = Math.round((t.qty * t.frRate) * 100) / 100;
          if (Math.abs(calc - t.frtAmt) > 5) {
            t._amtWarning = `Calculated ${calc} vs extracted ${t.frtAmt}`;
          }
        }

        return t;
      });

      // Error if no trips extracted at all
      if (parsed.trips.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: "No trip rows found in invoice. Please check the document." })
        };
      }
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
