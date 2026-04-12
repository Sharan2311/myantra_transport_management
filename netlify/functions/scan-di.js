// netlify/functions/scan-di.js

const DI_PROMPT = `You are reading a Shree Cement Delivery Instruction (DI) / GR Copy PDF.

Your ONLY job is to locate specific labelled fields and copy their values exactly.
DO NOT guess, infer, derive, or paraphrase. If a field is not clearly readable, return null.

FIELDS TO EXTRACT — find each label and copy the value next to it verbatim:

1. "D.I. No." or "DI No" or "Delivery Instruction No" → exactly 10 digits (e.g. 9003367634)
2. "G.R. No." or "GR No" or "Consignment Note No" → format like 1070/MYE/3881 (contains two slashes)
3. Truck/Vehicle registration number → uppercase no spaces (e.g. KA28AA4790)
4. Consignee name → full name as printed
5. Consignor / Plant name → e.g. "Shree Cement Limited KODLA" or "KARNATAKA CEMENT PROJECT"
6. Loading point / From → city/location where cement is loaded
7. Destination / To → city/location where cement is delivered
8. Material grade → use exactly "Cement Packed" or "Cement Bulk" — look for "PACKED" or "BULK" near the material description
9. Destination district → district name from consignee address
10. Destination state → state name from consignee address or pincode
    (pincode clues: 585xxx=Karnataka, 5xxxxx starting 50/51=Telangana, 4xxxxx=Maharashtra)
11. Quantity in MT → number only from "Qty" or "Quantity" or "Net Wt" column (e.g. 36.00)
12. Number of bags → number only, 0 if not shown
13. Freight rate per MT → number from "Rate PMT" or "Rate/MT" column — THIS document's rate only, do not reuse from memory
14. Date → in YYYY-MM-DD format

STRICT RULES:
- diNo: must be exactly 10 digits. Count the digits — if wrapped across lines in the PDF, join them.
- grNo: must contain exactly 2 forward slashes. If wrapped, join the parts.
- truckNo: uppercase, no spaces, no hyphens
- frRate: extract ONLY from the rate column of THIS specific document. Return null if not clearly visible.
- Return null (not 0, not "") for any numeric field you cannot read clearly
- Return null (not "") for any text field you cannot read clearly

Return ONLY this JSON, no markdown, no explanation:
{
  "diNo": "<10-digit number or null>",
  "grNo": "<format 1070/MYE/XXXX or null>",
  "truckNo": "<uppercase no spaces or null>",
  "consignee": "<full name or null>",
  "consignor": "<plant name or null>",
  "from": "<loading location or null>",
  "to": "<destination or null>",
  "grade": "<'Cement Packed' or 'Cement Bulk' or null>",
  "district": "<district name or null>",
  "state": "<state name or null>",
  "qty": <number or null>,
  "bags": <number or null>,
  "frRate": <number or null>,
  "date": "<YYYY-MM-DD or null>"
}`;

const PUMP_PROMPT = `You are reading a diesel pump slip or Excel screenshot from a petrol pump.

Extract ALL vehicle rows. For each row copy these values exactly as printed:
- truckNo: vehicle registration number — uppercase, remove all spaces (e.g. "KA 34 B 4788" → "KA34B4788")
- indentNo: the indent or serial number — copy exactly, or null if not visible
- date: date in YYYY-MM-DD format, or null if not visible
- hsd: the HSD/diesel amount column — number only, no ₹ no commas
- advance: the Advance column — number only, 0 if blank or zero

STRICT RULES:
- Skip total/summary/header rows
- Include ALL vehicle rows even if advance is 0
- If a value is not clearly readable, use null for that field (not 0 or "")
- Return ONLY the JSON array, no other text

Return ONLY a JSON array:
[{"truckNo":"KA32D2753","indentNo":"25748","date":"2026-03-05","hsd":31596,"advance":3000},...]`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
  }

  try {
    const { base64, mediaType, promptType } = JSON.parse(event.body);

    // promptType: "di" | "pump" | undefined (legacy — falls back to client prompt if passed)
    // For legacy compatibility, also accept a "prompt" field from old app versions
    const body_parsed = JSON.parse(event.body);
    const clientPrompt = body_parsed.prompt; // legacy: app sends prompt directly

    const selectedPrompt =
      promptType === "pump" ? PUMP_PROMPT :
      promptType === "di"   ? DI_PROMPT   :
      clientPrompt          ? clientPrompt :  // legacy fallback
      DI_PROMPT;

    const isImage = mediaType && mediaType.startsWith("image/");
    const contentBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [contentBlock, { type: "text", text: selectedPrompt }]
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}` }),
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    // For DI scans, post-process and validate
    if (promptType === "di" || (!promptType && !clientPrompt)) {
      let parsed;
      try { parsed = JSON.parse(clean); } catch(e) {
        return { statusCode: 200, body: JSON.stringify({ error: "Could not parse DI details. Please fill manually." }) };
      }

      // Validate DI number — must be 10 digits
      if (parsed.diNo != null) {
        const digits = String(parsed.diNo).replace(/\D/g, "");
        if (digits.length === 10) {
          parsed.diNo = digits;
        } else {
          parsed._diNoWarning = `${digits.length} digits extracted, expected 10`;
          parsed.diNo = digits || null;
        }
      }

      // Validate GR number — must have 2 slashes
      if (parsed.grNo != null) {
        const slashes = (String(parsed.grNo).match(/\//g) || []).length;
        if (slashes !== 2) {
          parsed._grNoWarning = `GR "${parsed.grNo}" has ${slashes} slash(es), expected 2`;
        }
      }

      // Normalise truckNo
      if (parsed.truckNo) {
        parsed.truckNo = String(parsed.truckNo).replace(/\s+/g, "").toUpperCase();
      }

      // Check we got at least diNo or grNo — otherwise likely wrong document
      if (!parsed.diNo && !parsed.grNo) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: "Could not find DI or GR number in document. Please check the file and try again." })
        };
      }

      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
    }

    // For pump scans and legacy: return raw text for client-side parsing
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    };

  } catch (e) {
    console.error("scan-di error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Function error: " + e.message }) };
  }
};
