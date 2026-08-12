// netlify/functions/scan-di.js

// Known-good Consignor PAN/GST pairs for Shree Cement plants. A DI/GR whose
// consignor is "Shree Cement" but whose PAN/GST doesn't exactly match one of
// these is rejected outright — this is what actually pins the document to a
// real, known plant instead of trusting whatever text the OCR/AI produced.
const SHREE_CONSIGNOR_WHITELIST = [
  { plant: "Shree Cement Kodla",  pan: "AACCS8796G", gst: "29AACCS8796G1ZN" },
  { plant: "Shree Cement Guntur", pan: "AACCS8796G", gst: "37AACCS8796G1ZQ" },
];

const DI_PROMPT = `You are reading a Shree Cement Delivery Instruction (DI) / GR Copy PDF.

Your ONLY job is to locate specific labelled fields and copy their values exactly.
DO NOT guess, infer, derive, or paraphrase. If a field is not clearly readable, return null.

FIELDS TO EXTRACT — find each label and copy the value next to it verbatim:

1. "D.I. No." or "DI No" or "Delivery Instruction No" → exactly 10 digits (e.g. 9003367634)
2. "G.R. No." or "GR No" or "Consignment Note No" → format like 1070/MYE/3881 (contains two slashes)
3. Truck/Vehicle registration number → uppercase no spaces (e.g. KA28AA4790)
4. Consignee name → full name as printed
5. Consignor / Plant name → e.g. "Shree Cement Limited KODLA" or "KARNATAKA CEMENT PROJECT"
5b. Consignor PAN No → the PAN printed directly under/beside the CONSIGNOR block specifically (the cement plant, e.g. "Shree Cement Limited ... KODLA"). Do NOT use the PAN from the transporter's own letterhead (top-left of GR copies) or from the consignee block — those are different companies with different PAN/GST. Format like AACCS8796G.
5c. Consignor GST No → the GST/GSTN printed directly under/beside the CONSIGNOR block specifically, same rules as 5b. Format like 29AACCS8796G1ZN.
6. Transporter name → this document is one of two formats, check in this order:
   a) INVOICE format: look for an explicitly labeled field such as "Transported By", "Transporter", or "Carrier" — usually near "Transportation Mode/Type", "Delivery Term", "E-way Bill No". Use the exact company name from that field.
   b) GR/RECEIPT format: has NO such labeled field. Instead the document is PRINTED/ISSUED BY the transporter, so their name is the company letterhead at the very TOP-LEFT of the page (above the Consignor/Consignee table) — usually followed by an address line and "PAN No / GSTN" on the next line, and it repeats near "For [Company Name] / Authorized Signatory" at the bottom.
   In both cases, do not confuse it with the Consignor (the cement plant, e.g. "Shree Cement Limited"), the Consignee/Bill To/Ship To (the buyer), or any bank/logistics-software branding. If neither pattern is clearly present, leave this empty rather than guessing.
7. Loading point / From → city/location where cement is loaded
8. Destination / To → city/location where cement is delivered
9. Material grade → use exactly "Cement Packed" or "Cement Bulk" — look for "PACKED" or "BULK" near the material description
10. Destination district → district name from consignee address
11. Destination state → state name from consignee address or pincode
    (pincode clues: 585xxx=Karnataka, 5xxxxx starting 50/51=Telangana, 4xxxxx=Maharashtra)
12. Quantity in MT → number only from "Qty" or "Quantity" or "Net Wt" column (e.g. 36.00)
13. Number of bags → number only, 0 if not shown
14. Freight rate per MT → number from "Rate PMT" or "Rate/MT" column — THIS document's rate only, do not reuse from memory
15. Date → in YYYY-MM-DD format
16. Party Name (Ship To) → ONLY relevant for INVOICE-format documents. Find the "Ship To" address block specifically — this is different from "Bill To" (the billing entity) and different from the Consignor. Copy the company/party name printed at the top of the Ship To block. Leave null if the document has no Ship To section (e.g. a GR copy).

STRICT RULES:
- diNo: must be exactly 10 digits. Count the digits — if wrapped across lines in the PDF, join them.
- grNo: must contain exactly 2 forward slashes. If wrapped, join the parts.
- truckNo: uppercase, no spaces, no hyphens
- frRate: extract ONLY from the rate column of THIS specific document. Return null if not clearly visible.
- Return null (not 0, not "") for any numeric field you cannot read clearly
- Return null (not "") for any text field you cannot read clearly
- DIGIT ACCURACY FOR diNo IS CRITICAL — read each digit individually:
  - "8" and "6" look similar: 8 has two loops, 6 has one loop and a tail
  - "8" and "3" look similar: 8 is closed top and bottom, 3 is open on left
  - "0" and "9" look similar: check carefully
  - "4" and "9" look similar: check carefully
  - After reading diNo, count again: must be exactly 10 digits
  - If unsure about any digit, look at it a second time before returning

Return ONLY this JSON, no markdown, no explanation:
{
  "diNo": "<10-digit number or null>",
  "grNo": "<format 1070/MYE/XXXX or null>",
  "truckNo": "<uppercase no spaces or null>",
  "consignee": "<full name or null>",
  "consignor": "<plant name or null>",
  "consignorPAN": "<PAN from the CONSIGNOR block specifically, e.g. AACCS8796G, or null>",
  "consignorGST": "<GST from the CONSIGNOR block specifically, e.g. 29AACCS8796G1ZN, or null>",
  "transporterName": "<transporter company name — from an explicit 'Transported By'/'Transporter' field if the document has one (common on invoices), otherwise the company letterhead at the very top-left of the document (common on GRs). null if genuinely unclear>",
  "from": "<loading location or null>",
  "to": "<destination or null>",
  "grade": "<'Cement Packed' or 'Cement Bulk' or null>",
  "district": "<district name or null>",
  "state": "<state name or null>",
  "qty": <number or null>,
  "bags": <number or null>,
  "frRate": <number or null>,
  "date": "<YYYY-MM-DD or null>",
  "partyName": "<company/party name from the Ship To block on an invoice, or null>"
}`;

const PUMP_PROMPT = `You are reading a diesel pump statement Excel screenshot.
This is a financial document — read every cell value exactly as shown.

Extract ALL vehicle data rows. For each row extract:
- truckNo: vehicle registration number — uppercase, remove all spaces (e.g. "KA 34 B 4788" -> "KA34B4788")
- indentNo: the INDENT NO / serial number column — copy exactly as shown, or null
- date: date in YYYY-MM-DD format (e.g. "16-May-26" -> "2026-05-16"), or null
- hsd: the HSD column — diesel fuel amount — number only, no Rs. no commas (e.g. "Rs.13,000.00" -> 13000)
- advance: the ADVANCE column — cash advance amount — number only, no Rs. no commas.
  CRITICAL: Read the ADVANCE column carefully. Return the actual value shown.
  "Rs.3,000.00" -> 3000. "Rs.2,000.00" -> 2000. Only return 0 if the cell is blank or shows Rs.0.00

STRICT RULES:
- Skip total/summary/header rows
- Include ALL vehicle data rows
- Remove Rs. symbol and commas from amounts before returning
- Return ONLY the JSON array, no other text

Return ONLY a JSON array:
[{"truckNo":"KA32D2753","indentNo":"25748","date":"2026-05-16","hsd":13000,"advance":3000},...]`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body_parsed = JSON.parse(event.body);
    const { base64, mediaType, promptType, expectedDI, expectedTransporter, docType } = body_parsed;
    const apiKey = body_parsed.anthropicKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }) };
    }

    // promptType: "di" | "pump" | undefined (legacy — falls back to client prompt if passed)
    const clientPrompt = body_parsed.prompt; // legacy: app sends prompt directly

    let selectedPrompt =
      promptType === "pump" ? PUMP_PROMPT :
      promptType === "di"   ? DI_PROMPT   :
      clientPrompt          ? clientPrompt :  // legacy fallback
      DI_PROMPT;

    // When caller provides expectedDI (from GR scan), hint the AI to cross-check
    if (expectedDI && (promptType === "di" || !promptType)) {
      const cleanExpected = String(expectedDI).replace(/\D/g, "");
      if (cleanExpected.length === 10) {
        selectedPrompt += `\n\nIMPORTANT VERIFICATION HINT: The GR for this trip has already been verified and shows DI No = ${cleanExpected}. If you extract a different 10-digit number, re-examine every digit of that field very carefully — a single digit OCR misread is likely. The correct DI should be ${cleanExpected}.`;
      }
    }

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

      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [contentBlock, { type: "text", text: selectedPrompt }]
        }],
      }),
    });

    const data = await response.json();

    // Calculate actual cost from token usage
    let _costInr = 0;
    if (data.usage) {
      const { input_tokens, output_tokens } = data.usage;
      const costUSD = (input_tokens * 0.80 + output_tokens * 4.00) / 1_000_000;
      _costInr = +(costUSD * 84).toFixed(4);
      console.log(`[scan-di:${promptType||"di"}] tokens: ${input_tokens} in / ${output_tokens} out | cost: $${costUSD.toFixed(6)} (~₹${_costInr})`);
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}` }),
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    // For DI scans, post-process and validate. This runs whenever the response
    // is DI-shaped (a single object carrying a diNo or grNo key) regardless of
    // whether promptType==="di" or a caller supplied its own richer clientPrompt
    // (e.g. BatchDIScanner/DIUploader on the client) — validation must not be
    // skippable just by omitting promptType, since that was previously a hole
    // that let unvalidated hallucinated data through. Non-DI callers on this
    // same endpoint (payment-screenshot scan, pump-slip scan without promptType)
    // return arrays or objects with no diNo/grNo key and fall through untouched.
    let parsedProbe;
    try { parsedProbe = JSON.parse(clean); } catch(e) { parsedProbe = null; }
    const isDIShaped = parsedProbe && !Array.isArray(parsedProbe) &&
      ("diNo" in parsedProbe || "grNo" in parsedProbe);

    if (promptType === "di" || isDIShaped) {
      let parsed = parsedProbe;
      if (!parsed) {
        return { statusCode: 200, body: JSON.stringify({ error: "Could not parse DI details. Please fill manually." }) };
      }

      // Normalise truckNo
      if (parsed.truckNo) {
        parsed.truckNo = String(parsed.truckNo).replace(/\s+/g, "").toUpperCase();
      }

      // Flag transporter mismatch — caller passes expectedTransporter (own company name)
      // to validate the DI/GR actually belongs to this transporter, not someone else's
      if (expectedTransporter && parsed.transporterName) {
        const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g, "");
        const scanned = norm(parsed.transporterName);
        const expected = norm(expectedTransporter);
        // Substring match either direction — handles "M Yantra Enterprises" vs "M YANTRA ENT."
        const matches = scanned && expected && (scanned.includes(expected) || expected.includes(scanned));
        if (!matches) {
          parsed._transporterMismatch = true;
          parsed._transporterMismatchMsg = `Document shows transporter "${parsed.transporterName}", expected "${expectedTransporter}"`;
        }
      }

      // ── HARD VALIDATION — any failure here rejects the document outright.  ──
      // These are not warnings the caller can choose to ignore; a document
      // that fails any of these is not saved as a trip, period.
      const rejections = [];

      // diNo: exactly 10 digits AND must start with "9" (Shree's DI numbering scheme).
      // Reject rather than "extract what digits we found" — a partial/garbled
      // extraction (e.g. 7 digits from a hallucinated read) must not sneak through.
      const diDigits = parsed.diNo != null ? String(parsed.diNo).replace(/\D/g, "") : "";
      if (diDigits.length !== 10 || diDigits[0] !== "9") {
        rejections.push(`DI No "${parsed.diNo ?? "(not found)"}" is invalid — must be exactly 10 digits starting with 9`);
        parsed.diNo = null;
      } else {
        parsed.diNo = diDigits;
      }

      // grNo: exactly 2 slashes, shape like 1070/MYE/3169 or 1070/KOR/354
      const grPattern = /^\d{2,5}\/[A-Z]{2,5}\/\d{1,6}$/;
      const grClean = parsed.grNo != null ? String(parsed.grNo).trim().toUpperCase() : "";
      if (!grPattern.test(grClean)) {
        rejections.push(`GR No "${parsed.grNo ?? "(not found)"}" is invalid — expected format like 1070/MYE/3169`);
        parsed.grNo = null;
      } else {
        parsed.grNo = grClean;
      }

      // Mandatory presence — a trip with any of these missing is not usable data
      if (!parsed.consignee) rejections.push("Consignee is missing or unreadable");
      if (!parsed.qty || Number(parsed.qty) <= 0) rejections.push("Quantity (qty) is missing or zero");
      if (!parsed.date) rejections.push("Date is missing or unreadable");

      // Consignor identity — if the consignor is Shree Cement, its PAN/GST must
      // exactly match one of the known plants. This is what actually pins the
      // document to a real plant rather than trusting the printed plant name text.
      // ONLY applied to GR documents. Invoices are validated a different way —
      // by DI-number cross-check against the already-verified GR (done
      // client-side in verifyPartyFileDI) and the Transported By check above —
      // since an invoice's own printed PAN/GST can legitimately differ from
      // what's on the GR (different template/software) without that meaning
      // the invoice is fraudulent.
      if (docType !== "invoice") {
        const consignorNorm = String(parsed.consignor || "").toUpperCase();
        if (consignorNorm.includes("SHREE CEMENT")) {
          const pan = String(parsed.consignorPAN || "").trim().toUpperCase();
          const gst = String(parsed.consignorGST || "").trim().toUpperCase();
          const match = SHREE_CONSIGNOR_WHITELIST.find(w => w.pan === pan && w.gst === gst);
          if (!pan || !gst) {
            rejections.push("Consignor PAN/GST could not be read from the document");
          } else if (!match) {
            rejections.push(`Consignor PAN/GST (${pan} / ${gst}) does not match any known Shree Cement plant`);
          } else {
            parsed._consignorPlant = match.plant;
          }
        }
      }

      if (rejections.length) {
        return {
          statusCode: 200,
          body: JSON.stringify({ error: `Document rejected — ${rejections.join("; ")}.` })
        };
      }

      parsed._costInr = _costInr;
      parsed._scanType = promptType||"di_scan";
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) };
    }

    // For pump scans and legacy: return raw text for client-side parsing
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, _costInr, _scanType: promptType||"pump_scan" }),
    };

  } catch (e) {
    console.error("scan-di error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "Function error: " + e.message }) };
  }
};
