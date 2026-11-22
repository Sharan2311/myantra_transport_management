// Retries a call only when the phone/browser could not reach the server ("Failed to fetch" / "Load failed" / network / timeout).
// Real errors from the database (a rule refused the save) are thrown straight away and never retried.
export const isNetworkError = (e) => /failed to fetch|load failed|network ?error|networkerror|timed? ?out|fetch failed/i.test(String(e?.message || e || ""));
export async function retryNet(fn, { tries = 3, delayMs = 700 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (!isNetworkError(e) || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw last;
}
