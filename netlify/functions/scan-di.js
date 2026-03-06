// netlify/functions/scan-di.js
// Uses Google Gemini API — free up to 1500 requests/day

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "GEMINI_API_KEY not set in Netlify environment variables" }),
    };
  }

  try {
    const { base64, mediaType, prompt } = JSON.parse(event.body);

    // Gemini accepts both images and PDFs as inline_data
    const requestBody = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mediaType,
              data: base64,
            }
          },
          {
            text: prompt
          }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1000,
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Gemini ${response.status}: ${data.error?.message || JSON.stringify(data)}` }),
      };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
