// netlify/functions/scan-shree.js
// Scans Shree Cement invoices and payment advices using Claude AI
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Netlify env vars" }),
    };
  }

  try {
    const { base64, mediaType, scanType } = JSON.parse(event.body);
    // scanType: "invoice" | "payment"

    const isImage = mediaType && mediaType.startsWith("image/");
    const contentBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const invoicePrompt = `You are extracting data from a freight invoice raised by M Yantra Enterprises to Shree Cement.

Extract the following and respond ONLY with a JSON object (no markdown, no backticks):
{
  "invoiceNo": "invoice number e.g. SMYE107026100308",
  "invoiceDate": "date in DD.MM.YYYY format",
  "totalAmount": numeric total invoice amount,
  "trips": [
    {
      "lrNo": "LR number e.g. 1070/MYE/3513",
      "truckNo": "vehicle number e.g. KA28D7176",
      "qty": numeric quantity in MT,
      "frtRate": numeric freight rate per MT,
      "frtAmt": numeric freight amount (qty * rate)
    }
  ]
}

If a field is not found, use null. For trips array, extract all line items found in the invoice.`;

    const paymentPrompt = `You are extracting data from a Shree Cement payment advice / bank remittance document.

Extract the following and respond ONLY with a JSON object (no markdown, no backticks):
{
  "utr": "UTR or transaction reference number",
  "paymentDate": "payment date in DD.MM.YYYY format",
  "totalPaid": numeric net amount paid,
  "totalBilled": numeric total billed amount,
  "tdsDeducted": numeric TDS deducted,
  "holdAmount": numeric amount put on hold,
  "invoices": [
    {
      "invoiceNo": "invoice number",
      "sapDoc": "SAP document number if present",
      "totalAmt": numeric invoice total,
      "paymentAmt": numeric amount paid for this invoice,
      "tds": numeric TDS for this invoice,
      "hold": numeric hold for this invoice
    }
  ],
  "shortages": [
    {
      "ref": "debit note reference e.g. TL2501018630",
      "lrNo": "LR number extracted from narration e.g. 1070/MYE/3544",
      "invRef": "invoice reference in narration",
      "tonnes": numeric shortage in tonnes,
      "deduction": numeric amount deducted for shortage
    }
  ],
  "penalties": [
    {
      "ref": "reference number",
      "description": "penalty description",
      "amount": numeric penalty amount
    }
  ]
}

For shortages: look for lines with narration containing "SHORTAGE" - extract the LR number and tonnage from the narration text like "SHORTAGE AG INV1104088840 - 0.150 TO".
If a field is not found, use null. For arrays, return empty array [] if nothing found.`;

    const prompt = scanType === "invoice" ? invoicePrompt : paymentPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}`,
        }),
      };
    }

    const rawText = (data.content || []).find((b) => b.type === "text")?.text || "";

    // Strip markdown fences if present
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to parse AI response", raw: rawText }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
