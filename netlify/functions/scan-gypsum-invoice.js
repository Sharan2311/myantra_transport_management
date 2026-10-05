// netlify/functions/scan-gypsum-invoice.js
//
// Gypsum invoices come from a different origin entity in Vishakapatnam, not
// Shree Cement's Kodla/Guntur plants — there's no GR/DI document to cross-
// check against, no consignor whitelist that applies here. This is a
// deliberately separate, much simpler extraction-only function: read the
// fields off the invoice, no rejection/validation logic at all. The person
// reviewing the extraction is expected to check the values before saving,
// same as any AI-assisted field-fill elsewhere in the app.

const GYPSUM_INVOICE_PROMPT = `You are reading a Gypsum supply Tax Invoice.

Your ONLY job is to locate specific labelled fields and copy their values exactly.
DO NOT guess, infer, derive, or paraphrase. If a field is not clearly readable, return null.

FIELDS TO EXTRACT:
1. Invoice Number / Tax Invoice No → copy exactly as printed
2. Invoice Date → in YYYY-MM-DD format
3. Vehicle/Truck registration number → uppercase, no spaces (e.g. AP31Z1234)
4. Quantity in MT (metric tons) → number only, from the quantity/net weight column
5. Invoice Amount / Total Amount → number only (no currency symbol, no commas)
6. Vendor/Supplier name → the company issuing the invoice (top of the document, above "Invoice")
7. Consignee / Ship To name → who the material is being delivered to

Return null (not 0, not "") for any field you cannot read clearly.

Return ONLY a JSON object:
{
  "invoiceNo": "<string or null>",
  "invoiceDate": "<YYYY-MM-DD or null>",
  "truckNo": "<string or null>",
  "qty": <number or null>,
  "amount": <number or null>,
  "vendorName": "<string or null>",
  "consignee": "<string or null>"
}`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body_parsed = JSON.parse(event.body);
    const { base64, mediaType } = body_parsed;
    const apiKey = body_parsed.anthropicKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
    }
    if (!base64) {
      return { statusCode: 400, body: JSON.stringify({ error: "No file provided" }) };
    }

    const isPdf = (mediaType || "").includes("pdf");
    const content = isPdf
      ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }]
      : [{ type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } }];
    content.push({ type: "text", text: GYPSUM_INVOICE_PROMPT });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: "Anthropic API error: " + errText }) };
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find(c => c.type === "text");
    if (!textBlock) {
      return { statusCode: 500, body: JSON.stringify({ error: "No text response from model" }) };
    }

    let parsed;
    try {
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: "Could not parse extraction result" }) };
    }

    return { statusCode: 200, body: JSON.stringify(parsed) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
