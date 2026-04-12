// netlify/functions/scan-payment.js

const PAYMENT_PROMPT = `You are a precise data extractor reading an HDFC Bank NEFT payment confirmation screenshot.

Your ONLY job is to find and copy exact text values from specific labelled fields in the image.
DO NOT reason, infer, guess, or derive any value. If you cannot read a field clearly, return null for that field.

The HDFC NEFT screenshot has these labelled fields — read each label and copy the value next to it exactly:

FIELD LABELS TO FIND:
1. The large amount at the top of the screen (e.g. ₹67,300)
2. The line immediately below the amount — may contain LR numbers (e.g. "SKLC141 SKLC142")
3. "Paid To:" — copy the name on this line verbatim, character for character
4. "Reference Number:" — copy this value exactly (e.g. HDFCH00929440594)
5. "HDFC Transaction ID:" — copy this value exactly (e.g. HDFCB8776F6F7E3B)
6. The date shown next to "Request Accepted" (e.g. Apr 12, 2026)
7. "Savings A/c:" or "Current A/c:" — copy the account number
8. "Paid By:" — copy the sender name verbatim

Return ONLY this JSON, no other text, no markdown:
{
  "amount": <number only, no commas, no ₹ symbol, or null if not found>,
  "paidTo": "<exact text after 'Paid To:' label, or null>",
  "referenceNo": "<exact text after 'Reference Number:' label, or null>",
  "transactionId": "<exact text after 'HDFC Transaction ID:' label, or null>",
  "paymentDate": "<date converted to YYYY-MM-DD format, or null>",
  "recipientAccount": "<account number after 'Savings A/c:' or 'Current A/c:', or null>",
  "paidBy": "<exact text after 'Paid By:' label, or null>",
  "lrNumbers": ["<LR numbers found in subtitle line below amount, formats: SKLC001 SGNC001 SGNGP001 SKLGP001 UTCC001 INBL001 INBGP001 INBH001 or old CEM26 CEM27>"],
  "narration": "<full narration/remarks text if present, or null>"
}

STRICT RULES:
- If a label is not visible or value is not clearly readable → set that field to null
- NEVER guess or fill in a value you cannot directly read from the image
- Copy text exactly — same capitalisation, same spacing, same characters
- lrNumbers: return [] if none found, never return null for this field
- amount: return as plain integer or decimal, e.g. 67300 not "₹67,300"`;

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
        model: "claude-haiku-4-5-20251001",
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
        body: JSON.stringify({ error: "Could not parse response from scan. Please fill manually." })
      };
    }

    // Validate — if critical fields all null, return error
    const hasAmount  = parsed.amount != null && parsed.amount > 0;
    const hasPaidTo  = parsed.paidTo != null && String(parsed.paidTo).trim().length > 0;
    const hasRef     = parsed.referenceNo != null && String(parsed.referenceNo).trim().length > 0;

    if (!hasAmount && !hasPaidTo && !hasRef) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not read payment details from image. Please fill manually." })
      };
    }

    // Clean up
    if (parsed.paidTo)       parsed.paidTo       = String(parsed.paidTo).trim();
    if (parsed.referenceNo)  parsed.referenceNo  = String(parsed.referenceNo).trim();
    if (parsed.transactionId)parsed.transactionId= String(parsed.transactionId).trim();
    if (parsed.paidBy)       parsed.paidBy       = String(parsed.paidBy).trim();

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
