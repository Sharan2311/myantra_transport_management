// netlify/functions/scan-payment.js

const PAYMENT_PROMPT = `You are extracting data from an HDFC Bank payment confirmation screenshot.
The payment type can be: NEFT, Within HDFC Bank, RTGS, IMPS, or UPI.

CRITICAL: This is used for financial records. Copy every value exactly as shown.
If a field is not visible or unclear, return null — never guess.

FIND THESE FIELDS IN THE SCREENSHOT:

1. The large rupee amount at the top (e.g. ₹41,900)
2. Text below the amount — often contains LR numbers (e.g. SKLC209)
3. The date shown near "Request Accepted" (e.g. Apr 18, 2026)
4. Label "Paid To:" → copy the name exactly
5. Label "HDFC Transaction ID:" → copy the alphanumeric value exactly
6. Label "Reference Number:" → copy the value exactly (may be short like HDFCH... or long numeric)
7. Label with "A/c:" (Savings/Current/A/c) → copy the account number
8. Label "Paid By:" → copy the name exactly

Return ONLY this JSON:
{
  "amount": <number without commas or ₹, or null>,
  "paidTo": "<exact text after Paid To: or null>",
  "referenceNo": "<exact Reference Number value or null>",
  "transactionId": "<exact HDFC Transaction ID value or null>",
  "paymentDate": "<YYYY-MM-DD format or null>",
  "recipientAccount": "<account number or null>",
  "paidBy": "<exact text after Paid By: or null>",
  "lrNumbers": ["LR numbers found, e.g. SKLC209"],
  "narration": null
}`;

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

    if (!base64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No image data provided" }) };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 }
            },
            { type: "text", text: PAYMENT_PROMPT }
          ]
        }]
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || JSON.stringify(data.error) || `API ${response.status}`;
      console.error("scan-payment API error:", errMsg);
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Anthropic API error: " + errMsg })
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      console.error("scan-payment parse error:", clean.slice(0, 500));
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not parse AI response. Raw: " + clean.slice(0, 200) })
      };
    }

    // Strict validation — all critical fields must be extracted
    const missing = [];
    if (parsed.amount == null || parsed.amount <= 0) missing.push("amount");
    if (!parsed.paidTo || !String(parsed.paidTo).trim()) missing.push("paidTo");
    if (!parsed.referenceNo || !String(parsed.referenceNo).trim()) missing.push("referenceNo");
    if (!parsed.paymentDate || !String(parsed.paymentDate).trim()) missing.push("paymentDate");

    if (missing.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not read: " + missing.join(", ") + ". Please fill manually." })
      };
    }

    // Clean up — trim strings
    if (parsed.paidTo)          parsed.paidTo          = String(parsed.paidTo).trim();
    if (parsed.referenceNo)     parsed.referenceNo     = String(parsed.referenceNo).trim();
    if (parsed.transactionId)   parsed.transactionId   = String(parsed.transactionId).trim();
    if (parsed.paidBy)          parsed.paidBy          = String(parsed.paidBy).trim();

    // Normalise LR numbers
    parsed.lrNumbers = Array.isArray(parsed.lrNumbers)
      ? parsed.lrNumbers.map(lr => String(lr).trim().toUpperCase()).filter(lr => lr.length > 0)
      : [];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };

  } catch (error) {
    console.error("scan-payment error:", error);
    return { statusCode: 200, body: JSON.stringify({ error: "Function error: " + error.message }) };
  }
};
