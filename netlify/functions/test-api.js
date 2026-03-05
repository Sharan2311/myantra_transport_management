// Quick test — checks if API key works with a simple text request
exports.handler = async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 200, body: JSON.stringify({ result: "ERROR: No API key found in env vars" }) };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{ role: "user", content: "Reply with just: OK" }],
      }),
    });
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: response.status,
        result: data.content?.[0]?.text || null,
        error: data.error || null,
      }),
    };
  } catch(e) {
    return { statusCode: 200, body: JSON.stringify({ result: "EXCEPTION: " + e.message }) };
  }
};
