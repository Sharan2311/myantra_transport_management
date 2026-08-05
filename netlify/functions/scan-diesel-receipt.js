// netlify/functions/scan-diesel-receipt.js
// Dedicated scanner for a SINGLE diesel pump receipt (photo of the printed slip),
// used by the Diesel Confirmation "Upload Receipt" flow (PumpPortal).
// Kept separate from scan-di.js on purpose — different document type, different
// output shape (single object, not an array), different validation rules.

const RECEIPT_PROMPT = `You are reading a single diesel fuel pump receipt (printed slip, e.g. HP/IOC/BPCL).
This may be photographed at an angle, on top of a notebook, partially held by a hand,
or have handwritten notes near/over it. Read ONLY the printed receipt text, ignore any
handwritten notes.

Extract exactly these fields:
1. vehicleNo — the "Vehicle No" field. Uppercase, remove all spaces/hyphens (e.g. "KA 56 5567" -> "KA565567").
2. amount — the "Amount(Rs)" field. Number only, no ₹, no commas (e.g. "07000.00" -> 7000).
3. date — the "Date" field, converted to YYYY-MM-DD. Receipts show DD/MM/YY (e.g. "10/07/26" -> "2026-07-10").
4. pumpName — the pump/outlet name and location, usually printed below the company logo
   (e.g. "KHASA MATH CIRCLE GURMITKAL"). Do not include the oil company brand name
   (HP/IOC/BPCL) itself, just the outlet name/location line.
5. receiptNo — the "Receipt No." field, exactly as printed (e.g. "G0649").

STRICT RULES:
- Only extract from the PRINTED receipt. Never read handwritten numbers/names into these fields.
- If a field is not clearly legible, return null for that field — do not guess.
- vehicleNo must be uppercase with no spaces or hyphens.
- amount must be a plain number (no currency symbol, no commas, no decimals rounding tricks — read exactly what's printed).
- date must be YYYY-MM-DD or null.

Return ONLY this JSON, no markdown, no explanation:
{
  "vehicleNo": "<uppercase no spaces or null>",
  "amount": <number or null>,
  "date": "<YYYY-MM-DD or null>",
  "pumpName": "<outlet name or null>",
  "receiptNo": "<string or null>"
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
      return { statusCode: 400, body: JSON.stringify({ error: "No image provided" }) };
    }

    const isImage = mediaType && mediaType.startsWith("image/");
    if (!isImage) {
      return { statusCode: 400, body: JSON.stringify({ error: "Receipt scan only accepts images" }) };
    }
    const contentBlock = { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [contentBlock, { type: "text", text: RECEIPT_PROMPT }]
        }],
      }),
    });

    const data = await response.json();

    let _costInr = 0;
    if (data.usage) {
      const { input_tokens, output_tokens } = data.usage;
      const costUSD = (input_tokens * 0.80 + output_tokens * 4.00) / 1_000_000;
      _costInr = +(costUSD * 84).toFixed(4);
      console.log(`[scan-diesel-receipt] tokens: ${input_tokens} in / ${output_tokens} out | cost: $${costUSD.toFixed(6)} (~₹${_costInr})`);
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}` }),
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (e) {
      return { statusCode: 200, body: JSON.stringify({ error: "Could not read the receipt. Please upload a clearer image." }) };
    }

    // Normalise vehicleNo
    if (parsed.vehicleNo) {
      parsed.vehicleNo = String(parsed.vehicleNo).replace(/[\s-]+/g, "").toUpperCase();
    }
    // Normalise amount
    if (parsed.amount != null) {
      const n = +String(parsed.amount).replace(/[^\d.]/g, "");
      parsed.amount = Number.isFinite(n) ? n : null;
    }

    // Required-field check — if any of the 4 core fields are missing, treat as unclear image.
    // receiptNo is nice-to-have, not required for the match/confirm logic.
    const missing = [];
    if (!parsed.vehicleNo) missing.push("vehicle number");
    if (parsed.amount == null) missing.push("amount");
    if (!parsed.date) missing.push("date");
    if (!parsed.pumpName) missing.push("pump name");

    if (missing.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          error: `Could not clearly read: ${missing.join(", ")}. Please upload a clearer image.`,
          _unclear: true,
        }),
      };
    }

    parsed._costInr = _costInr;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };

  } catch (e) {
    console.error("scan-diesel-receipt error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Function error: " + e.message }) };
  }
};
