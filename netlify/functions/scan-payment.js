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
            { type: "text", text: `Extract payment details from this NEFT/bank transfer screenshot.

LR NUMBER EXTRACTION — CRITICAL:
The payment description may show LR numbers like "CEM 2724 2725" or "CEM 2707 2708 2714".
"CEM" is a prefix meaning Cement — the actual LR numbers are the SPACE-SEPARATED NUMBERS after CEM.
So "CEM 2724 2725" = TWO LR numbers: ["2724", "2725"]
And "CEM 2707 2708 2714" = THREE LR numbers: ["2707", "2708", "2714"]
Each number is a SEPARATE element in the array. Never combine them into one string.

OTHER RULES:
- referenceNo: use ONLY the "Reference Number" field value. Do NOT use the "Transaction ID" or "HDFC Transaction ID".
- paidTo: recipient name only (e.g. "BASAVANA GOUDA", "LATA")
- amount: numeric value only, no ₹ or commas
- date: YYYY-MM-DD format

Respond ONLY with JSON, no markdown:
{
  "paidTo": "recipient name",
  "referenceNo": "Reference Number only",
  "amount": 20900,
  "date": "2026-03-10",
  "lrNumbers": ["2724", "2725"]
}` }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Post-process: if any lrNumbers element contains spaces, split it further
    // e.g. ["2724 2725"] → ["2724", "2725"]
    if (Array.isArray(parsed.lrNumbers)) {
      parsed.lrNumbers = parsed.lrNumbers
        .flatMap(lr => String(lr).trim().split(/\s+/))
        .filter(Boolean);
    }

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
