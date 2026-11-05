// Run: node scripts/recover_target.test.mjs
import assert from "node:assert/strict";
import { recoverCapFor, recoverOk, walletAfter, walletDelta, defaultTarget } from "../src/recover_target.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("loan is capped at the loan due", () => {
  assert.equal(recoverCapFor("loan", 77220), 77220);
  assert.equal(recoverOk("loan", 77220, 77220), true);
  assert.equal(recoverOk("loan", 77220, 77221), false);
});
t("negative wallet (employee owes) is credited: moves toward zero", () => {
  assert.equal(walletDelta(-3000, 1000), 1000);
  assert.equal(walletAfter(-3000, 1000), -2000);
});
t("positive wallet (employee holds cash) is debited: moves toward zero", () => {
  assert.equal(walletDelta(1176, 1000), -1000);
  assert.equal(walletAfter(1176, 1000), 176);
});
t("a total larger than the wallet crosses zero (allowed)", () => {
  assert.equal(walletAfter(1176, 2000), -824);
  assert.equal(walletAfter(-500, 2000), 1500);
  assert.equal(recoverOk("wallet", 0, 2000, 1176), true);
});
t("a wallet of exactly 0 has nothing to reduce: wallet target not allowed, wallet unchanged", () => {
  assert.equal(recoverOk("wallet", 0, 500, 0), false);
  assert.equal(walletAfter(0, 500), 0);
});
t("nothing selected is never ok", () => {
  assert.equal(recoverOk("wallet", 0, 0, 100), false);
  assert.equal(recoverOk("loan", 100, 0), false);
});
t("default target is loan while a loan is due, otherwise wallet", () => {
  assert.equal(defaultTarget(500), "loan");
  assert.equal(defaultTarget(0), "wallet");
});
console.log(`\n${n} tests passed`);
