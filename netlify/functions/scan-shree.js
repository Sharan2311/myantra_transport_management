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

  const INVOICE_PROMPT = `You are reading a freight invoice / tax invoice from M Yantra Enterprises to Shree Cement or Ultratech.
Extract the following and return ONLY a valid JSON object:
{
  "invoiceNo": "Invoice number e.g. SMYE107026100318",
  "invoiceDate": "Date in DD.MM.YYYY or DD-MM-YYYY format",
  "totalAmount": 351227.00,
  "trips": [
    {
      "diNo": "DI number from the DI NO column e.g. 9003299367",
      "grNo": "GR number from the GR NO column e.g. 1070/MYE/3818",
      "truckNo": "Truck/vehicle registration number",
      "qty": 35.0,
      "frtAmt": 53200.00
    }
  ]
}

Rules:
- Return ONLY the JSON object, no explanation, no markdown, no backticks
- trips array must have one entry per line item in the invoice table
- diNo: extract the DI number column — it looks like 9003299367 or 9003487470
- grNo: extract the GR number column — it looks like 1070/MYE/3818 or 1070/MYE/3969
- truckNo: vehicle registration e.g. KA28AA9261
- qty: quantity in MT as a decimal number
- frtAmt: freight amount in rupees as a decimal number
- If a field is not found, use empty string for text or 0 for numbers`;

  const PAYMENT_PROMPT = `You are reading a payment advice / remittance advice from Shree Cement or Ultratech to M Yantra Enterprises.
Extract the following and return ONLY a valid JSON object:
{
  "utr": "UTR/transaction reference number",
  "paymentDate": "Payment date in DD.MM.YYYY or YYYY-MM-DD format",
  "totalPaid": 0.00,
  "totalBilled": 0.00,
  "tdsDeducted": 0.00,
  "holdAmount": 0.00,
  "invoices": [
    {
      "invoiceNo": "Invoice reference number",
      "invDate": "Invoice date",
      "sapDoc": "SAP document number if present",
      "totalAmt": 0.00,
      "paymentAmt": 0.00,
      "hold": 0.00
    }
  ],
  "shortages": [
    {
      "lrNo": "LR number",
      "description": "Shortage description",
      "deduction": 0.00
    }
  ],
  "expenses": [
    {
      "description": "Expense description",
      "amount": 0.00
    }
  ],
  "penalties": []
}

Rules:
- Return ONLY the JSON object, no markdown, no backticks
- utr: the NEFT/RTGS/IMPS transaction reference number
- holdAmount: GST hold / retention amount
- tdsDeducted: TDS amount deducted
- shortages: any shortage deductions with LR reference
- If a field is not found, use empty string for text or 0 for numbers`;

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
    try { parsed = JSON.parse(clean); } catch(e) {
      return { statusCode: 500, body: JSON.stringify({ error: "Could not parse AI response: " + text.slice(0, 200) }) };
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
