// Run: node scripts/recover_target.test.mjs
import assert from "node:assert/strict";
import { recoverCapFor, recoverOk, walletAfter, defaultTarget } from "../src/recover_target.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("loan is capped at the loan due", () => {
  assert.equal(recoverCapFor("loan", 77220), 77220);
  assert.equal(recoverOk("loan", 77220, 77220), true);
  assert.equal(recoverOk("loan", 77220, 77221), false);
});
t("wallet has no cap, whatever the wallet balance", () => {
  assert.equal(recoverCapFor("wallet", 0), Infinity);
  assert.equal(recoverOk("wallet", 0, 1_000_000), true);
});
t("nothing selected is never ok", () => {
  assert.equal(recoverOk("wallet", 0, 0), false);
  assert.equal(recoverOk("loan", 100, 0), false);
});
t("wallet balance rises by exactly the recovered total, from negative, zero or positive", () => {
  assert.equal(walletAfter(-3000, 1000), -2000);
  assert.equal(walletAfter(0, 500), 500);
  assert.equal(walletAfter(1176, 24), 1200);
});
t("default target is loan while a loan is due, otherwise wallet", () => {
  assert.equal(defaultTarget(500), "loan");
  assert.equal(defaultTarget(0), "wallet");
});
console.log(`\n${n} tests passed`);
