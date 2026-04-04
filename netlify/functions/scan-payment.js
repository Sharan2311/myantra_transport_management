// netlify/functions/scan-payment.js
// Scans a driver payment screenshot/receipt and extracts payment details
// Updated to recognize SKLC/SGNC/UTCC LR number formats

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

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
- The narration/remarks may contain multiple LR numbers separated by spaces or commas
- Example narrations: "SKLC026 SKLC027 BASAVANA GOUDA", "CEM 26 27 PAYMENT", "LR SKLC030 SKLC031"
- Extract ALL LR numbers found, return as array
- If a number like "26" or "027" appears near "SKLC" or "CEM", combine them: ["SKLC026", "SKLC027"]
- If no LR numbers found, return empty array []

Return ONLY the JSON object, no other text.`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { base64, mediaType } = JSON.parse(event.body);

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: base64,
              },
            },
            {
              type: "text",
              text: PAYMENT_PROMPT,
            },
          ],
        },
      ],
    });

    const text = message.content[0].text;
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "Could not parse payment details from image" }),
      };
    }

    // Normalize lrNumbers — handle case where AI returns numbers without prefix
    if (parsed.lrNumbers && Array.isArray(parsed.lrNumbers)) {
      parsed.lrNumbers = parsed.lrNumbers
        .map(lr => String(lr).trim().toUpperCase())
        .filter(lr => lr.length > 0);
    } else {
      parsed.lrNumbers = [];
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (error) {
    console.error("scan-payment error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
