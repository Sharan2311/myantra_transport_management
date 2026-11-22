import assert from "node:assert/strict";
import { isImportable, runPool } from "../src/drive_multi.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
test("PDFs and images are importable; folders, sheets and docs are not", () => {
  assert.equal(isImportable({ name: "a.pdf", mimeType: "application/pdf" }), true);
  assert.equal(isImportable({ name: "a.JPG", mimeType: "image/jpeg" }), true);
  assert.equal(isImportable({ name: "scan.png", mimeType: "" }), true);
  assert.equal(isImportable({ name: "x", isFolder: true, mimeType: "application/vnd.google-apps.folder" }), false);
  assert.equal(isImportable({ name: "sheet.xlsx", mimeType: "application/vnd.ms-excel" }), false);
  assert.equal(isImportable({ name: "doc", mimeType: "application/vnd.google-apps.document" }), false);
});
test("runPool keeps the original order and runs at most N at a time", async () => {
  let live = 0, peak = 0;
  const items = [1, 2, 3, 4, 5, 6, 7];
  const { results, failures } = await runPool(items, async (n) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5 * (8 - n))); live--; return n * 10; }, 3);
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60, 70]); assert.equal(failures.length, 0); assert.ok(peak <= 3 && peak >= 2);
});
test("a failing item is reported, the others still complete", async () => {
  const { results, failures } = await runPool(["a", "b", "c"], async (x) => { if (x === "b") throw new Error("too big"); return x; }, 2);
  assert.deepEqual(results, ["a", undefined, "c"]);
  assert.deepEqual(failures, [{ index: 1, item: "b", error: "too big" }]);
});
test("progress callback counts finished items", async () => {
  const seen = []; await runPool([1, 2, 3], async (x) => x, 2, (done, total) => seen.push([done, total]));
  assert.deepEqual(seen[seen.length - 1], [3, 3]); assert.equal(seen.length, 3);
});
test("empty list is fine", async () => assert.deepEqual(await runPool([], async () => 1, 3), { results: [], failures: [] }));
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
