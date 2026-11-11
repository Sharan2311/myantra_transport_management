// Run: node scripts/tonnage_logic.test.mjs
import assert from "node:assert/strict";
import { blockOf, blockRange, tonnageByBlock } from "../src/tonnage_logic.js";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const tr = (date, qty, o = {}) => ({ id: date + qty + Math.random(), date, qty, lrNo: "SK1", truckNo: "KA01", ...o });
const many = (date, qty, k = 12) => Array.from({ length: k }, () => tr(date, qty));

t("blocks: 1-10, 11-20, 21-end (incl. 31st)", () => {
  assert.equal(blockOf("2026-03-01"), 1); assert.equal(blockOf("2026-03-10"), 1);
  assert.equal(blockOf("2026-03-11"), 2); assert.equal(blockOf("2026-03-20"), 2);
  assert.equal(blockOf("2026-03-21"), 3); assert.equal(blockOf("2026-03-31"), 3);
  assert.equal(blockOf("01-05-2026"), null); assert.equal(blockOf(""), null);
});
t("block ranges handle short months", () => {
  assert.deepEqual(blockRange("2026-02", 3), { from: "2026-02-21", to: "2026-02-28" });
  assert.deepEqual(blockRange("2026-03", 3), { from: "2026-03-21", to: "2026-03-31" });
  assert.deepEqual(blockRange("2024-02", 3), { from: "2024-02-21", to: "2024-02-29" });
  assert.deepEqual(blockRange("2026-03", 1), { from: "2026-03-01", to: "2026-03-10" });
});
t("sums tons per month and block", () => {
  const r = tonnageByBlock([...many("2026-03-05", 10), ...many("2026-03-15", 20), ...many("2026-03-25", 30)], "2026-04-02");
  const m = r.months[0];
  assert.equal(m.month, "2026-03");
  assert.deepEqual(m.blocks.map(b => b.tons), [120, 240, 360]);
  assert.deepEqual(m.blocks.map(b => b.complete), [true, true, true]);
});
t("a block counts only after its last day has passed", () => {
  const trips = [...many("2026-11-05", 10), ...many("2026-11-12", 5)];
  const onTenth = tonnageByBlock(trips, "2026-11-10").months.at(-1).blocks;
  assert.equal(onTenth[0].complete, false);
  const eleventh = tonnageByBlock(trips, "2026-11-11").months.at(-1).blocks;
  assert.equal(eleventh[0].complete, true);
  assert.equal(eleventh[1].complete, false);
});
t("highest and lowest per block come from complete blocks only", () => {
  const trips = [...many("2026-03-05", 10), ...many("2026-04-05", 30), ...many("2026-05-05", 20), ...many("2026-05-15", 1, 12)];
  const r = tonnageByBlock(trips, "2026-05-16");
  assert.equal(r.summary[0].highest.month, "2026-04"); assert.equal(r.summary[0].lowest.month, "2026-03");
  // 11-20 of May is still running on 16 May -> not ranked
  assert.equal(r.summary[1].highest, null);
});
t("ties: earlier month is reported first, all tied months listed", () => {
  const r = tonnageByBlock([...many("2026-03-05", 10), ...many("2026-04-05", 10), ...many("2026-05-05", 5)], "2026-06-01");
  assert.deepEqual(r.summary[0].highest.months, ["2026-03", "2026-04"]);
});
t("clinker bills and bad dates are ignored; stray early months before real data are ignored", () => {
  const stray = [tr("2026-02-06", 15, { lrNo: "" })];
  const clk = [tr("2026-03-05", 30.91, { lrNo: "CLK-7DBBX3S", truckNo: "CLINKER-BILL" })];
  const bad = [tr("01-05-2026", 9)];
  const r = tonnageByBlock([...stray, ...clk, ...bad, ...many("2026-03-05", 10)], "2026-04-02");
  assert.equal(r.months[0].month, "2026-03");
  assert.equal(r.months[0].blocks[0].tons, 120);
  assert.equal(r.ignored.clinker, 1); assert.equal(r.ignored.badDate, 1); assert.equal(r.ignored.beforeStart, 1);
});
t("months with no trips between real months appear as zero (not skipped)", () => {
  const r = tonnageByBlock([...many("2026-03-05", 10), ...many("2026-05-05", 10)], "2026-06-01");
  assert.deepEqual(r.months.map(m => m.month), ["2026-03", "2026-04", "2026-05"]);
  assert.equal(r.months[1].blocks[0].tons, 0);
});
t("string quantities and missing quantities are handled", () => {
  const r = tonnageByBlock([...many("2026-03-05", "10", 11), tr("2026-03-06", undefined)], "2026-04-02");
  assert.equal(r.months[0].blocks[0].tons, 110);
});
console.log(n + " tests passed");
