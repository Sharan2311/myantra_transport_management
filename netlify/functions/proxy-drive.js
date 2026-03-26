// netlify/functions/proxy-drive.js
// Proxies a Google Drive public download to bypass browser CORS restrictions.
// The file must be shared as "Anyone with the link" in Google Drive.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let url;
  try {
    ({ url } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!url || !url.startsWith("https://drive.google.com/")) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid Google Drive URL" }) };
  }

  try {
    // Follow redirects (Google Drive download redirects a few times)
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MYantraApp/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`Drive returned HTTP ${response.status}. Make sure the file is shared as "Anyone with the link".`);
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // Check it's actually a file (not an HTML login/warning page)
    if (contentType.includes("text/html")) {
      throw new Error('Google Drive returned an HTML page instead of the file. Make sure sharing is set to "Anyone with the link".');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    // Try to get filename from content-disposition header
    const cd = response.headers.get("content-disposition") || "";
    const fnMatch = cd.match(/filename[^;=\n]*=([^;\n]*)/);
    const filename = fnMatch
      ? fnMatch[1].replace(/['"]/g, "").trim()
      : "drive-file";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mimeType: contentType, filename }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Failed to fetch file from Google Drive" }),
    };
  }
};
