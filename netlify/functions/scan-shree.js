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

    const paymentPrompt = `Extract data from this Shree Cement payment advice / bank remittance.

Every row in the table has a Document Description. Classify EACH row carefully:
- "Invoice" rows with narration like "PRIMARY FREIGHT CEMENT TPT" → goes into "invoices" array
- "Debit Note" rows where narration contains "SHORTAGE" → goes into "shortages" array  
- "Debit Note" rows where narration does NOT contain "SHORTAGE" (e.g. "ELECTRICITY CHARGES RECOVERY", "PENALTY IMPOSED NOT USING SAFETY PPE", "WATER CHARGES") → goes into "expenses" array

Respond ONLY with JSON (no markdown, no backticks):
{
  "utr": "UTR number from intro text",
  "paymentDate": "DD.MM.YYYY",
  "totalPaid": numeric (net amount paid from intro e.g. 'fund transfer for Rs. 338202.12'),
  "totalBilled": numeric (Total Bill Amount column sum),
  "tdsDeducted": numeric (TDS Deducted column sum),
  "holdAmount": numeric (Hold Amount column sum),
  "invoices": [
    { "invoiceNo": "e.g. SMYE107026100311", "sapDoc": "SAP Doc No", "totalAmt": numeric, "paymentAmt": numeric, "tds": numeric, "hold": numeric }
  ],
  "shortages": [
    { "ref": "Inv/Ref Number value", "lrNo": "LR number from narration e.g. 1070/MYE/3544", "tonnes": numeric (look for 'X.XX TO' in narration), "deduction": numeric (Total Bill Amount for this row) }
  ],
  "expenses": [
    { "ref": "Inv/Ref Number value e.g. KR2513001067", "description": "full narration text exactly as written", "amount": numeric (Total Bill Amount for this row), "month": "month/year from narration e.g. FEB'26", "category": "electricity|water|penalty|safety|other" }
  ]
}

Rules:
- EVERY Debit Note row must appear in either shortages or expenses — do not skip any
- For expenses category: electricity→'electricity', water→'water', PENALTY/PPE/SAFETY→'safety', otherwise 'other'
- Use empty arrays [] if nothing found`;

    const prompt = scanType === "invoice" ? invoicePrompt : paymentPrompt;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "pdfs-2024-09-25" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 2000,
        messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return { statusCode: response.status, body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message}` }) };

    const rawText = (data.content||[]).find(b=>b.type==="text")?.text || "";
    const cleaned = rawText.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
    try {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(JSON.parse(cleaned)) };
    } catch(e) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to parse AI response", raw: rawText }) };
    }
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
