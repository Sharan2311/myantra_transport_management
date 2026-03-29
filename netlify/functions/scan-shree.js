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

  const INVOICE_PROMPT = `You are reading a freight tax invoice from M Yantra Enterprises to Shree Cement or Ultratech Cement.

The invoice has a table. Each row represents one trip and has these columns:
S.No | DI NO | INV NO | DATE | TRUCK NO | GR NO | CONSIGNEE NAME | STATION | GRADE | DESP QTY | FRT RATE | FRT AMT

IMPORTANT - PDF TABLE CELL SPLITTING:
In this PDF, long values in a table cell are often broken across multiple lines within the same cell.
For example, the DI NO cell may show:
  Line 1: "90032993"
  Line 2: "67"
These two lines together form ONE value: "9003299367"

You must reconstruct the complete value for each cell by joining all line fragments that belong to the same cell.
The correct complete value is whatever appears in that column for that row — read the full cell content, not just the first line.

Return ONLY this JSON (no markdown, no explanation):
{
  "invoiceNo": "complete invoice number",
  "invoiceDate": "date as shown",
  "totalAmount": 0.00,
  "trips": [
    {
      "diNo": "complete DI number from DI NO column — join all parts of the cell",
      "grNo": "complete GR number from GR NO column e.g. 1070/MYE/3818",
      "truckNo": "vehicle registration number",
      "qty": 0.0,
      "frtRate": 0.0,
      "frtAmt": 0.00
    }
  ]
}

One object in trips[] per table row. If a field is missing use empty string or 0.`;

  const PAYMENT_PROMPT = `You are reading a payment advice / remittance advice from Shree Cement or Ultratech to M Yantra Enterprises.
Return ONLY this JSON (no markdown, no explanation):
{
  "utr": "UTR/transaction reference number",
  "paymentDate": "payment date",
  "totalPaid": 0.00,
  "totalBilled": 0.00,
  "tdsDeducted": 0.00,
  "holdAmount": 0.00,
  "invoices": [
    {
      "invoiceNo": "invoice reference",
      "invDate": "invoice date",
      "sapDoc": "SAP document number if present",
      "totalAmt": 0.00,
      "paymentAmt": 0.00,
      "hold": 0.00
    }
  ],
  "shortages": [
    { "lrNo": "LR number", "description": "description", "deduction": 0.00 }
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
        max_tokens: 2000,
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
      return { statusCode: 500, body: JSON.stringify({ error: "Could not parse AI response: " + text.slice(0, 300) }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Function error: " + e.message }) };
  }
};
