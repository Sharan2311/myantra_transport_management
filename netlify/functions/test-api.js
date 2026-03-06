exports.handler = async (event) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 200, body: JSON.stringify({ result: "ERROR: No GEMINI_API_KEY in env vars" }) };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with just: OK" }] }]
        }),
      }
    );
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    return {
      statusCode: 200,
      body: JSON.stringify({ status: response.status, result: text, error: data.error || null }),
    };
  } catch(e) {
    return { statusCode: 200, body: JSON.stringify({ result: "EXCEPTION: " + e.message }) };
  }
};
