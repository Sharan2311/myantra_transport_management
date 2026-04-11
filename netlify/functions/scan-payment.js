// netlify/functions/scan-payment.js
// Uses fetch directly — no SDK dependency needed

const PAYMENT_PROMPT = `You are reading a bank payment screenshot or NEFT/RTGS/UPI payment confirmation for a transport company.

Extract the following fields and return ONLY a JSON object:
{
  "amount": <total payment amount as number, no commas>,
  "referenceNo": "UTR/reference/transaction ID — the unique payment reference number",
  "paymentDate": "date in DD/MM/YYYY or YYYY-MM-DD format",
  "paidTo": "recipient/beneficiary name",
  "narration": "full narration or remarks text as-is",
  "lrNumbers": ["array of LR numbers found in narration/remarks/description"],
  "note": "any other relevant info"
}

IMPORTANT — LR Number extraction rules:
- LR numbers follow these formats used by M Yantra Enterprises:
  * SKLC001, SKLC026, SKLC027 (Shree Cement Kodla - Cement)
  * SKLGP001 (Shree Cement Kodla - Gypsum)
  * SGNC001 (Shree Cement Guntur - Cement)
  * SGNGP001 (Shree Cement Guntur - Gypsum)
  * UTCC001 (Ultratech Malkhed - Cement)
  * INBL001, INBGP001, INBH001 (Inbound trips)
- Also look for old-format numbers like: CEM 26, CEM 27, CEM26, CEM27
- The narration may contain multiple LR numbers separated by spaces or commas
- Example: "SKLC026 SKLC027 BASAVANA GOUDA" -> ["SKLC026","SKLC027"]
- Extract ALL LR numbers found. If none found, return []

Return ONLY the JSON object, no other text.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const { base64, mediaType } = JSON.parse(event.body);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
            { type: "text", text: PAYMENT_PROMPT }
          ]
        }]
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || "API error");
    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch(e) { return { statusCode: 200, body: JSON.stringify({ error: "Could not parse payment details" }) }; }
    if (parsed.lrNumbers && Array.isArray(parsed.lrNumbers)) {
      parsed.lrNumbers = parsed.lrNumbers.map(lr => String(lr).trim().toUpperCase()).filter(lr => lr.length > 0);
    } else {
      parsed.lrNumbers = [];
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
  } catch (error) {
    console.error("scan-payment error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
