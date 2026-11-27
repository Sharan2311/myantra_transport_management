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
2. amount — the "Amount(Rs)" field, written as a plain number WITHOUT leading zeros and without ₹ or commas
   (e.g. "07000.00" -> 7000.00, "00271.73" -> 271.73, "09949.00" -> 9949.00). Never write leading zeros.
3. date — the "Date" field, converted to YYYY-MM-DD. Receipts show DD/MM/YY (e.g. "10/07/26" -> "2026-07-10").
4. pumpName — the pump/outlet name and location, usually printed below the company logo
   (e.g. "KHASA MATH CIRCLE GURMITKAL"). Do not include the oil company brand name
   (HP/IOC/BPCL) itself, and do not include lines like "Duplicate Receipt Copy" or "Welcomes You":
   just the outlet name/location lines.
5. receiptNo — the value on the line that starts with "Receipt No." (a short code such as "G0649" or "K0713").
   It is NOT the "FCC ID" (a long number of 15+ digits printed on the next line). Never use the FCC ID.

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

// The model sometimes copies the printed amount with its leading zeros ("amount": 09949.00), which is not valid JSON.
// Take the JSON object out of the reply, strip leading zeros from numbers, then parse. Returns null if it still cannot be read.
function parseReceiptText(text) {
  let t = String(text || "").replace(/```json|```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1).replace(/(:\s*)0+(?=\d)/g, "$1");
  try { const o = JSON.parse(t); return o && typeof o === "object" ? o : null; } catch (e) { return null; }
}
function cleanPumpName(name) {
  return String(name).replace(/duplicate\s+receipt\s+copy/ig, "").replace(/welcomes\s+you/ig, "").replace(/\s+/g, " ").trim() || null;
}
exports.parseReceiptText = parseReceiptText;
exports.cleanPumpName = cleanPumpName;

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

    const parsed = parseReceiptText(text);
    if (!parsed) {
      return { statusCode: 200, body: JSON.stringify({ error: "Could not read the receipt. Please upload a clearer image." }) };
    }

    // A pump's own wording is not part of the outlet name; a long all-digit "receipt no" is the FCC ID, not the receipt number.
    if (parsed.pumpName) parsed.pumpName = cleanPumpName(parsed.pumpName);
    if (parsed.receiptNo != null && /^\d{10,}$/.test(String(parsed.receiptNo).replace(/\s/g, ""))) parsed.receiptNo = null;

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
