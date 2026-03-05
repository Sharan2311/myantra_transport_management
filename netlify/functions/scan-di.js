// netlify/functions/scan-di.js
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured in Netlify env vars" }) };
  }

  try {
    const { base64, mediaType, prompt } = JSON.parse(event.body);

    const isImage = mediaType && mediaType.startsWith("image/");

    // For PDFs: extract text via url source isn't available, use document block
    // For images: use image block
    let userContent;
    if (isImage) {
      userContent = [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: prompt }
      ];
    } else {
      // PDF — send as document block
      userContent = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: prompt }
      ];
    }

    const reqBody = {
      model: "claude-opus-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: userContent }],
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Anthropic ${response.status}: ${data.error?.message || JSON.stringify(data.error)}` }),
      };
    }

    const text = (data.content || []).find(b => b.type === "text")?.text || "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Function error: " + e.message }),
    };
  }
};
