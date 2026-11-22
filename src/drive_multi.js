// Helpers for importing many files from Google Drive at once.
export const isImportable = (item) => {
  if (!item || item.isFolder) return false;
  const mt = String(item.mimeType || "").toLowerCase();
  if (mt.startsWith("application/vnd.google-apps.")) return false;
  if (mt === "application/pdf" || mt.startsWith("image/")) return true;
  return /\.(pdf|jpe?g|png|webp|heic)$/i.test(String(item.name || ""));
};

// Runs worker(item) for every item, at most `limit` at a time. Results keep the original order; a failing item is
// reported in `failures` and never stops the others.
export async function runPool(items, worker, limit = 3, onProgress) {
  const results = Array.from({ length: items.length }, () => undefined);
  const failures = [];
  let next = 0, done = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i], i); }
      catch (e) { failures.push({ index: i, item: items[i], error: String(e?.message || e) }); }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  failures.sort((a, b) => a.index - b.index);
  return { results, failures };
}
