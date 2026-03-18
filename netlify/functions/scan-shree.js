// netlify/functions/scan-shree.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };

  try {
    const { base64, mediaType, scanType } = JSON.parse(event.body);
    const isImage = mediaType && mediaType.startsWith("image/");
    const contentBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const invoicePrompt = `Extract data from this M Yantra Enterprises freight invoice to Shree Cement.
Respond ONLY with JSON (no markdown, no backticks):
{
  "invoiceNo": "e.g. SMYE107026100308",
  "invoiceDate": "DD.MM.YYYY",
  "totalAmount": numeric,
  "trips": [{ "lrNo": "e.g. 1070/MYE/3513", "truckNo": "e.g. KA28D7176", "qty": numeric, "frtRate": numeric, "frtAmt": numeric }]
}`;

    const paymentPrompt = `Extract data from this Shree Cement payment advice / bank remittance PDF.
This document may have MANY rows (30+ invoices) — extract ALL of them without skipping any.

Every row in the table has a Document Description. Classify EACH row:
- "Invoice" rows with narration like "PRIMARY FREIGHT CEMENT TPT" → goes into "invoices" array
- "Debit Note" rows where narration contains "SHORTAGE" → goes into "shortages" array
- "Debit Note" rows where narration does NOT contain "SHORTAGE" (e.g. "ELECTRICITY CHARGES", "PENALTY", "WATER CHARGES") → goes into "expenses" array

IMPORTANT: For each invoice row, extract ALL columns including Hold Amount and TDS Deducted even if they are zero.
Hold Amount = the GST portion withheld by Shree, to be released later separately.

Respond ONLY with valid JSON (no markdown, no backticks, no trailing commas):
{
  "utr": "UTR number from intro text e.g. 1527531918",
  "paymentDate": "DD.MM.YYYY",
  "totalPaid": numeric (net amount transferred e.g. 1909642.08),
  "totalBilled": numeric (Total Bill Amount column sum),
  "tdsDeducted": numeric (TDS Deducted column sum),
  "holdAmount": numeric (Hold Amount column sum),
  "invoices": [
    {
      "invoiceNo": "e.g. SMYE107026100275",
      "invDate": "DD.MM.YYYY",
      "sapDoc": "SAP Doc No e.g. 5100452866",
      "totalAmt": numeric (Total Bill Amount column, use paymentAmt if blank),
      "paymentAmt": numeric (Payment Amount column),
      "tds": numeric (TDS Deducted column, 0 if blank),
      "hold": numeric (Hold Amount column, 0 if blank)
    }
  ],
  "shortages": [
    { "ref": "Inv/Ref Number", "lrNo": "LR number from narration", "tonnes": numeric, "deduction": numeric }
  ],
  "expenses": [
    { "ref": "Inv/Ref Number e.g. KR2513001067", "description": "full narration text", "amount": numeric, "month": "month/year e.g. FEB'26", "category": "electricity|water|penalty|safety|other" }
  ]
}

Rules:
- Extract EVERY row — do not truncate or summarise
- EVERY Debit Note row must appear in either shortages or expenses
- For expenses category: electricity→'electricity', water→'water', PENALTY/PPE/SAFETY→'safety', otherwise 'other'
- If Hold Amount cell is blank/empty for a row, use 0
- If TDS cell is blank/empty for a row, use 0
- Use empty arrays [] if nothing found`;

    const prompt = scanType === "invoice" ? invoicePrompt : paymentPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,   // increased from 2000 — needed for 30+ invoice rows
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return {
      statusCode: response.status,
      body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message}` })
    };

    const rawText = (data.content || []).find(b => b.type === "text")?.text || "";
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      };
    } catch (e) {
      // Try to extract partial JSON if truncated
      const partialMatch = cleaned.match(/^\{[\s\S]*/);
      if (partialMatch) {
        try {
          // Attempt to close unclosed JSON
          const partial = partialMatch[0];
          // Count unclosed braces/brackets to give a better error
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              error: "AI response was truncated — PDF may be too large. Try splitting into fewer pages.",
              parseError: e.message,
              raw: rawText.slice(0, 500)
            })
          };
        } catch (_) {}
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to parse AI response", raw: rawText.slice(0, 500) })
      };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
