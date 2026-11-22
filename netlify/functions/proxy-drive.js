// netlify/functions/proxy-drive.js
// Handles two actions:
//   { action: "list",     folderId }
//   { action: "download", fileId, fileName, mimeType }
//
// SETUP: Set GOOGLE_SERVICE_ACCOUNT_JSON env var in Netlify dashboard.
// Steps:
// 1. Google Cloud Console → IAM & Admin → Service Accounts → Create Service Account
// 2. Keys tab → Add Key → Create new key → JSON → download it
// 3. Netlify → Site → Environment variables → GOOGLE_SERVICE_ACCOUNT_JSON = (paste entire JSON content)
// 4. In Google Drive, right-click your M Yantra folder → Share → add the service account email → Viewer

const { google } = require("googleapis");

function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var not set in Netlify.");
  const creds = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  try {
    const drive = getDriveClient();

    // LIST folder contents
    if (body.action === "list") {
      const { folderId } = body;
      if (!folderId) return { statusCode: 400, body: JSON.stringify({ error: "folderId required" }) };

      // Drive answers a listing of a folder this account cannot see with an EMPTY list (no error), which looks like
      // an empty folder. Look the folder up first so "not shared" is reported as such.
      let folderMeta;
      try {
        folderMeta = (await drive.files.get({ fileId: folderId, fields: "id,name,mimeType", supportsAllDrives: true })).data;
      } catch (e) {
        const who = (() => { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email; } catch { return "the service account"; } })();
        return { statusCode: 200, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: `This folder is not shared with the app. In Google Drive, share it (Viewer) with ${who}.` }) };
      }
      if (folderMeta.mimeType === "application/vnd.google-apps.shortcut") {
        return { statusCode: 200, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "This link is a shortcut, not a real folder. Open the original folder and copy its link." }) };
      }

      const res = await drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,size,modifiedTime)",
        orderBy: "folder,name",
        pageSize: 200,
      });

      const items = (res.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size,
        modified: f.modifiedTime,
      }));

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      };
    }

    // DOWNLOAD a file
    if (body.action === "download") {
      const { fileId, fileName, mimeType } = body;
      if (!fileId) return { statusCode: 400, body: JSON.stringify({ error: "fileId required" }) };

      const isGoogleDoc = mimeType && mimeType.startsWith("application/vnd.google-apps.");
      let buffer;
      let finalMime = mimeType || "application/octet-stream";

      if (isGoogleDoc) {
        const res = await drive.files.export(
          { fileId, mimeType: "application/pdf" },
          { responseType: "arraybuffer" }
        );
        buffer = Buffer.from(res.data);
        finalMime = "application/pdf";
      } else {
        const res = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer" }
        );
        buffer = Buffer.from(res.data);
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: buffer.toString("base64"),
          mimeType: finalMime,
          filename: fileName || "drive-file",
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown action: " + body.action }) };

  } catch (err) {
    console.error("proxy-drive error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Drive API error" }),
    };
  }
};
