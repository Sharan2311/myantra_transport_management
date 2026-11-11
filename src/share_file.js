// Opens the phone's share sheet with a file (iPhone Safari 15+ / Android). Must be called from a tap.
// Returns "shared" | "cancelled" | "unsupported" | "failed".
export async function shareFile(nav, file, title = "Payment screenshot") {
  if (!file || !nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return "unsupported";
  const data = { files: [file], title };
  try { if (!nav.canShare(data)) return "unsupported"; } catch { return "unsupported"; }
  try { await nav.share(data); return "shared"; }
  catch (e) { return e && e.name === "AbortError" ? "cancelled" : "failed"; }
}
