// netlify/functions/scan-payment.js

const PAYMENT_PROMPT = `You are extracting data from an HDFC Bank payment confirmation screenshot.
This could be an NEFT transfer, Within HDFC Bank transfer, RTGS, or IMPS payment.

CRITICAL ACCURACY REQUIREMENT: This data is used for financial records. Every character must be exact.
DO NOT guess, infer, or fill in any value you are not 100% certain about. Return null for uncertain fields.

THE HDFC SCREENSHOT HAS THESE LABELLED FIELDS — find each and copy the value exactly:

1. Large amount at top (e.g. ₹41,900) → "amount" (number only, no ₹ or commas)
2. Subtitle line below amount → may contain LR numbers like SKLC209, SGNC010
3. Date next to "Request Accepted" → "paymentDate" (convert to YYYY-MM-DD)
4. "Paid To:" → "paidTo" (copy VERBATIM, character by character)
5. "HDFC Transaction ID:" → "transactionId" (copy VERBATIM, alphanumeric)
6. "Reference Number:" → "referenceNo" (copy VERBATIM — this is the UTR)
   ⚠ For NEFT: starts with "HDFC", typically 17-19 characters
   ⚠ For Within HDFC Bank: much longer numeric string (30+ digits)
   ⚠ Read each digit individually. Do NOT confuse: 0/O, 1/I, 6/4, 8/3, 5/S
7. "Savings A/c:" or "A/c:" or "Current A/c:" → "recipientAccount"
8. "Paid By:" → "paidBy" (copy VERBATIM)
9. "Payment Method:" → note if it says "NEFT", "Within HDFC Bank", "RTGS", or "IMPS"

STRICT RULES:
- Copy "referenceNo" and "transactionId" CHARACTER BY CHARACTER
- If uncertain about any character, return null for the entire field
- "paidTo": exact text after "Paid To:" label, verbatim
- "amount": plain number e.g. 41900 not "₹41,900"
- "lrNumbers": array of LR numbers found anywhere (SKLC001, SGNC001, UTCC001, INBL001 etc.)
- Return null for any field not clearly readable

Return ONLY this JSON, no markdown:
{
  "amount": <number or null>,
  "paidTo": "<verbatim or null>",
  "referenceNo": "<verbatim Reference Number or null>",
  "transactionId": "<verbatim HDFC Transaction ID or null>",
  "paymentDate": "<YYYY-MM-DD or null>",
  "recipientAccount": "<account number or null>",
  "paidBy": "<verbatim or null>",
  "lrNumbers": ["<LR numbers found>"],
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
    if (!response.ok || data.error) throw new Error(data.error?.message || "API error");

    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch(e) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not parse payment details. Please fill manually." })
      };
    }

    // Validate — if all critical fields null, return error
    const hasAmount   = parsed.amount != null && parsed.amount > 0;
    const hasPaidTo   = parsed.paidTo != null && String(parsed.paidTo).trim().length > 0;
    const hasRef      = parsed.referenceNo != null && String(parsed.referenceNo).trim().length > 0;

    if (!hasAmount && !hasPaidTo && !hasRef) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not read payment details from image. Please fill manually." })
      };
    }

    // Clean up
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
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
