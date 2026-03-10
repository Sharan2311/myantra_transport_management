// netlify/functions/scan-payment.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  try {
    const { base64, mediaType } = JSON.parse(event.body);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
            { type: "text", text: `Extract payment details from this screenshot.
Look carefully for LR numbers — they may appear as "CEM 2717 2720" or "LR 47 48" meaning MULTIPLE LRs in one payment.

IMPORTANT RULES:
- For the reference number: use ONLY the "Reference Number" field (e.g. HDFCH00853198382). Do NOT use the Transaction ID.
- For paidTo: use the recipient name only (e.g. "LATA", "BASAVANA GOUDA")

Respond ONLY with JSON, no markdown:
{
  "paidTo": "recipient name only",
  "referenceNo": "Reference Number value only (NOT Transaction ID)",
  "amount": "total numeric amount only",
  "date": "date in YYYY-MM-DD format if visible",
  "lrNumbers": ["list", "of", "LR", "numbers", "found"]
}
If only one LR found, lrNumbers should be a single-element array. If no LR numbers visible, use empty array.` }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
