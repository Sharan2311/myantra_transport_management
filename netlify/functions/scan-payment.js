// netlify/functions/scan-payment.js

const PAYMENT_PROMPT = `You are extracting data from an HDFC Bank NEFT payment confirmation screenshot.

CRITICAL ACCURACY REQUIREMENT: This data is used for financial records. Every character must be exact.
DO NOT guess, infer, or fill in any value you are not 100% certain about. Return null for uncertain fields.

THE HDFC NEFT SCREENSHOT HAS THESE EXACT LABELLED FIELDS:

1. Large amount at top → "amount" (number only, no ₹ or commas)
2. Subtitle line below amount → may contain LR numbers like SKLC190, SKLC195
3. Date next to "Request Accepted" → "paymentDate" (YYYY-MM-DD)
4. "Paid To:" → "paidTo" (copy VERBATIM, character by character)
5. "HDFC Transaction ID:" → "transactionId" (copy VERBATIM — starts with HDFC, alphanumeric)
6. "Reference Number:" → "referenceNo" (copy VERBATIM — this is the UTR, starts with HDFC)
   ⚠ CRITICAL: The Reference Number is typically 17-19 characters long starting with "HDFCH".
   Read each digit individually. Do NOT confuse similar characters: 0/O, 1/I, 6/4, 8/3, 5/S.
   Example format: HDFCH00939646487
7. "Savings A/c:" or "Current A/c:" → "recipientAccount"
8. "Paid By:" → "paidBy"

STRICT RULES:
- "referenceNo" and "transactionId" must be copied CHARACTER BY CHARACTER — read each digit separately
- If you are not certain about a character, return null for the entire field rather than guessing
- "paidTo": copy the exact text after "Paid To:" label, verbatim, same capitalisation
- "amount": plain number e.g. 35877 not "₹35,877"
- "lrNumbers": array of LR numbers found (formats: SKLC001, SGNC001, UTCC001, INBL001 etc.) — check subtitle line below amount
- All other fields: return null if not clearly readable

Return ONLY this JSON, no markdown:
{
  "amount": <number or null>,
  "paidTo": "<verbatim text after Paid To: or null>",
  "referenceNo": "<verbatim Reference Number (UTR) or null>",
  "transactionId": "<verbatim HDFC Transaction ID or null>",
  "paymentDate": "<YYYY-MM-DD or null>",
  "recipientAccount": "<account number or null>",
  "paidBy": "<verbatim text after Paid By: or null>",
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
        model: "claude-sonnet-4-6",   // Sonnet for financial accuracy — single character errors matter
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
    if (parsed.referenceNo)     parsed.referenceNo     = String(parsed.referenceNo).trim().toUpperCase();
    if (parsed.transactionId)   parsed.transactionId   = String(parsed.transactionId).trim().toUpperCase();
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
