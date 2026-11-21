import assert from "node:assert/strict";
import { shareFile } from "../src/share_file.js";
const tests = [];
const test = (n, f) => tests.push([n, f]);
const file = { name: "pay.jpg", type: "image/jpeg" };

test("shares the file when the browser can", async () => {
  let got; const nav = { canShare: () => true, share: async d => { got = d; } };
  assert.equal(await shareFile(nav, file), "shared");
  assert.deepEqual(got.files, [file]);
});
test("user closing the share sheet is 'cancelled', not an error", async () => {
  const nav = { canShare: () => true, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } };
  assert.equal(await shareFile(nav, file), "cancelled");
});
test("no share support -> 'unsupported'", async () => {
  assert.equal(await shareFile({}, file), "unsupported");
  assert.equal(await shareFile({ canShare: () => false, share: async () => {} }, file), "unsupported");
  assert.equal(await shareFile(undefined, file), "unsupported");
});
test("a real failure is reported, never swallowed", async () => {
  const nav = { canShare: () => true, share: async () => { throw new Error("boom"); } };
  const r = await shareFile(nav, file);
  assert.equal(r, "failed");
});
test("no file -> 'unsupported'", async () => {
  assert.equal(await shareFile({ canShare: () => true, share: async () => {} }, null), "unsupported");
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
