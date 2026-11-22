import test from "node:test"; import assert from "node:assert/strict";
import { retryNet, bytesToBase64, settleAfterNetFail } from "../src/net_retry.js";
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

test("bytesToBase64 matches Buffer for small and large (chunked) input", () => {
  for (const n of [0, 1, 2, 3, 100, 32768, 100003]) {
    const u = new Uint8Array(n).map((_, i) => (i * 7 + 3) % 256);
    assert.equal(bytesToBase64(u), Buffer.from(u).toString("base64"));
  }
});
test("settleAfterNetFail: action ok -> 'done', verify never called", async () => {
  let v=0; assert.equal(await settleAfterNetFail(async()=>1, async()=>{v++;return true;}), "done"); assert.equal(v,0);
});
test("settleAfterNetFail: network failure but the server did it (verify true) -> 'verified'", async () => {
  assert.equal(await settleAfterNetFail(async()=>{throw new TypeError("Failed to fetch");}, async()=>true), "verified");
});
test("settleAfterNetFail: network failure and verify false -> throws the original error", async () => {
  await assert.rejects(settleAfterNetFail(async()=>{throw new TypeError("Failed to fetch");}, async()=>false), /Failed to fetch/);
});
test("settleAfterNetFail: verify itself failing -> throws the original error, never claims success", async () => {
  await assert.rejects(settleAfterNetFail(async()=>{throw new TypeError("Failed to fetch");}, async()=>{throw new Error("also offline");}), /Failed to fetch/);
});
test("settleAfterNetFail: a real database error is not verified, just thrown", async () => {
  let v=0; await assert.rejects(settleAfterNetFail(async()=>{throw new Error("Receipt K1 is already attached");}, async()=>{v++;return true;}), /already attached/); assert.equal(v,0);
});
