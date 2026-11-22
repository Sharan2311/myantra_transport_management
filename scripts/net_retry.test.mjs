import test from "node:test"; import assert from "node:assert/strict";
import { retryNet } from "../src/net_retry.js";
const fast = { delayMs: 1 };
test("succeeds first time", async () => { let n=0; assert.equal(await retryNet(async()=>{n++;return "ok";}, fast), "ok"); assert.equal(n,1); });
test("retries a network failure and then succeeds", async () => {
  let n=0; const r = await retryNet(async()=>{ n++; if(n<3) throw new TypeError("Failed to fetch"); return "ok"; }, fast);
  assert.equal(r,"ok"); assert.equal(n,3);
});
test("gives up after the allowed tries and throws the last error", async () => {
  let n=0; await assert.rejects(retryNet(async()=>{ n++; throw new TypeError("Failed to fetch"); }, {...fast, tries:3}), /Failed to fetch/); assert.equal(n,3);
});
test("a real database/validation error is NOT retried", async () => {
  let n=0; await assert.rejects(retryNet(async()=>{ n++; throw new Error("Receipt K1 is already attached to Indent # 5"); }, fast), /already attached/); assert.equal(n,1);
});
test("Safari wording 'Load failed' is also treated as a network failure", async () => {
  let n=0; await retryNet(async()=>{ n++; if(n<2) throw new TypeError("Load failed"); return 1; }, fast); assert.equal(n,2);
});
