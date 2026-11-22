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

// Base64 of raw bytes without FileReader (which fails on some phones) and without a huge string spread.
export function bytesToBase64(u8) {
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

// On a flaky phone connection the server can finish the job while the reply is lost, so the app shows "Failed to
// fetch" although it worked. After a NETWORK failure only, ask the database whether the change really happened.
// Returns "done" (no failure), or "verified" (failed to hear back, but the database confirms it). Anything else throws
// the ORIGINAL error: a failed or unverifiable save is never reported as success.
export async function settleAfterNetFail(action, verify) {
  try { await action(); return "done"; }
  catch (e) {
    if (!isNetworkError(e)) throw e;
    let ok = false;
    try { ok = !!(await retryNet(verify, { tries: 2, delayMs: 500 })); } catch { ok = false; }
    if (ok) return "verified";
    throw e;
  }
}
