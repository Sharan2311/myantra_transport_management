import assert from "node:assert/strict";
import { vehicleMatches, dateWithin, matchBatch, confirmUpdate, attachUpdate, pumpNameMatches, deleteBlockReason, defaultRequestPick, withCorrectedAmount, groupBillsByVehicle, groupCandidates, groupCheck, groupable } from "../src/bill_match.js";
const tests = []; const test = (n, f) => tests.push([n, f]);
const req = (o) => ({ id: "r" + (o.indentNo || 1), indentNo: 1, truckNo: "KA28AB7880", pumpId: "P1", date: "2026-11-21", amount: 32000, dieselAmount: 32000, cashAmount: 0, status: "open", receiptNo: "", ...o });
const bill = (o) => ({ id: "b1", vehicleNo: "7880", amount: 32000, date: "2026-11-21", pumpName: "SHREE VAISHNAVI F/S", receiptNo: "K0589", ...o });
const ctx = { pumpMatches: (name, r) => /VAISHNAVI/i.test(name || "") === (r.pumpId === "P1") };

test("bill showing only the last 4 digits matches the truck", () => {
  assert.equal(vehicleMatches("7880", "KA28AB7880"), true);
  assert.equal(vehicleMatches("7881", "KA28AB7880"), false);
  assert.equal(vehicleMatches("", "KA28AB7880"), false);
});
test("a full vehicle number on the bill must match the whole truck number", () => {
  assert.equal(vehicleMatches("KA28AB7880", "KA28AB7880"), true);
  assert.equal(vehicleMatches("KA 28 AB-7880", "KA28AB7880"), true);
  assert.equal(vehicleMatches("KA29AB7880", "KA28AB7880"), false);
});
test("date within 1 day", () => {
  assert.equal(dateWithin("2026-11-21", "2026-11-21"), true);
  assert.equal(dateWithin("2026-11-22", "2026-11-21"), true);
  assert.equal(dateWithin("2026-11-23", "2026-11-21"), false);
  assert.equal(dateWithin(null, "2026-11-21"), false);
  assert.equal(dateWithin("2026-11-21", "bad"), false);
});
test("exact match: vehicle + amount + pump + date -> match", () => {
  const [r] = matchBatch([bill({})], [req({})], ctx);
  assert.equal(r.state, "match");
  assert.equal(r.request.indentNo, 1);
});
test("amount off by even 1 rupee is not a match", () => {
  const [r] = matchBatch([bill({ amount: 31999 })], [req({})], ctx);
  assert.equal(r.state, "not_found");
});
test("the diesel part is compared, so a request with cash still matches its bill", () => {
  const [r] = matchBatch([bill({ amount: 30000 })], [req({ amount: 32000, dieselAmount: 30000, cashAmount: 2000 })], ctx);
  assert.equal(r.state, "match");
});
test("wrong pump -> not found", () => {
  const [r] = matchBatch([bill({ pumpName: "OTHER PUMP" })], [req({})], ctx);
  assert.equal(r.state, "not_found");
});
test("date more than 1 day away is never an auto match (only a near_match to review)", () => {
  const [r] = matchBatch([bill({ date: "2026-11-25" })], [req({})], ctx);
  assert.equal(r.state, "near_match");
});
test("a request already confirmed by the pump but with no bill yet is matched (bill is only attached)", () => {
  const [r] = matchBatch([bill({})], [req({ status: "confirmed" })], ctx);
  assert.equal(r.state, "match");
  assert.equal(r.request.status, "confirmed");
});
test("an attached request with no bill is also matched", () => {
  assert.equal(matchBatch([bill({})], [req({ status: "attached" })], ctx)[0].state, "match");
});
test("a request that already has a bill, or is reconciled/cancelled, is never a candidate", () => {
  assert.equal(matchBatch([bill({})], [req({ status: "confirmed", receiptNo: "K1" })], ctx)[0].state, "not_found");
  assert.equal(matchBatch([bill({})], [req({ status: "attached", receiptImagePath: "x/1.jpg" })], ctx)[0].state, "not_found");
  assert.equal(matchBatch([bill({})], [req({ status: "reconciled" })], ctx)[0].state, "not_found");
});
test("date read wrongly (bill 27 Nov vs request 21 Nov) but vehicle, pump and amount match exactly -> near_match to review", () => {
  const [r] = matchBatch([bill({ date: "2026-11-27" })], [req({})], ctx);
  assert.equal(r.state, "near_match");
  assert.equal(r.request.indentNo, 1);
});
test("near_match needs exactly one candidate", () => {
  assert.equal(matchBatch([bill({ date: "2026-11-27" })], [req({ indentNo: 1 }), req({ indentNo: 2 })], ctx)[0].state, "not_found");
});
test("pump name misread by one letter still matches (SHREF vs SHREE)", () => {
  assert.equal(pumpNameMatches("SHREF VAISHNAVI F/S SEDAN ROAD KODLA", "SHREE VAISHNAVI F/S"), true);
  assert.equal(pumpNameMatches("SHREE VAISHNAVI F/S SEDAM ROAD KODLA", "SHREE VAISHNAVI F/S"), true);
});
test("different pumps do not match", () => {
  assert.equal(pumpNameMatches("SHREE VAISHNAVI F/S", "SBReddy"), false);
  assert.equal(pumpNameMatches("SLV GURMITKAL", "SHREE VAISHNAVI F/S"), false);
  assert.equal(pumpNameMatches("", "SHREE VAISHNAVI F/S"), false);
  assert.equal(pumpNameMatches("SHREE", "SHREE VAISHNAVI F/S"), false);
});
test("attachUpdate keeps status and every amount, only adds the bill details", () => {
  const r0 = req({ status: "confirmed", dieselAmount: 14000, amount: 14000, confirmedAmount: 14000, confirmedCash: 0, pin: "****" });
  const u = attachUpdate(r0, { receiptNo: "K0656", bill: bill({ amount: 14000 }), method: "bulk_receipt" });
  assert.equal(u.status, "confirmed");
  assert.equal(u.amount, 14000);
  assert.equal(u.confirmedAmount, 14000);
  assert.equal(u.receiptNo, "K0656");
  assert.equal(r0.receiptNo, "");
});
test("two open requests fit one bill -> ambiguous, never auto-picked", () => {
  const [r] = matchBatch([bill({})], [req({ indentNo: 1 }), req({ indentNo: 2 })], ctx);
  assert.equal(r.state, "ambiguous");
  assert.equal(r.candidates.length, 2);
});
test("unreadable bill (no amount or no vehicle)", () => {
  assert.equal(matchBatch([bill({ amount: null })], [req({})], ctx)[0].state, "unreadable");
  assert.equal(matchBatch([bill({ vehicleNo: null })], [req({})], ctx)[0].state, "unreadable");
});
test("receipt number already used on another request -> duplicate_receipt", () => {
  const used = req({ indentNo: 9, status: "confirmed", receiptNo: "K0589", truckNo: "OTHER" });
  const [r] = matchBatch([bill({})], [req({}), used], ctx);
  assert.equal(r.state, "duplicate_receipt");
  assert.equal(r.request.indentNo, 9);
});
test("a receipt that was used as part of a split confirmation ('S1 + S2') is still caught", () => {
  const used = req({ indentNo: 9, status: "confirmed", receiptNo: "S1 + S2", truckNo: "OTHER" });
  assert.equal(matchBatch([bill({ receiptNo: "S2" })], [req({}), used], ctx)[0].state, "duplicate_receipt");
});
test("same receipt number twice in one batch -> second is duplicate_receipt", () => {
  const rs = matchBatch([bill({ id: "b1" }), bill({ id: "b2" })], [req({ indentNo: 1 })], ctx);
  assert.equal(rs[0].state, "match");
  assert.equal(rs[1].state, "duplicate_receipt");
});
test("a request is claimed by only one bill in a batch", () => {
  const rs = matchBatch([bill({ id: "b1", receiptNo: "A1" }), bill({ id: "b2", receiptNo: "A2" })], [req({})], ctx);
  assert.equal(rs[0].state, "match");
  assert.equal(rs[1].state, "not_found");
});
test("split bills (10000 + 8000 vs a request of 18000) are both 'not_found' with a split hint", () => {
  const r18 = req({ indentNo: 5, truckNo: "KA01AA1234", amount: 18000, dieselAmount: 18000 });
  const rs = matchBatch([bill({ id: "b1", vehicleNo: "1234", amount: 10000, receiptNo: "S1" }), bill({ id: "b2", vehicleNo: "1234", amount: 8000, receiptNo: "S2" })], [r18], ctx);
  assert.deepEqual(rs.map(r => r.state), ["not_found", "not_found"]);
  assert.equal(rs[0].splitHint.requestId, r18.id);
  assert.deepEqual([...rs[0].splitHint.billIds].sort(), ["b1", "b2"]);
  assert.deepEqual(rs[1].splitHint.billIds, rs[0].splitHint.billIds);
});
test("no split hint when the bills do not add up exactly", () => {
  const r18 = req({ indentNo: 5, truckNo: "KA01AA1234", amount: 18000, dieselAmount: 18000 });
  const rs = matchBatch([bill({ id: "b1", vehicleNo: "1234", amount: 10000, receiptNo: "S1" }), bill({ id: "b2", vehicleNo: "1234", amount: 7999, receiptNo: "S2" })], [r18], ctx);
  assert.equal(rs[0].splitHint, undefined);
});
test("not_found lists same-vehicle open requests for manual check", () => {
  const [r] = matchBatch([bill({ amount: 5000 })], [req({ indentNo: 1 }), req({ indentNo: 2, truckNo: "KA11ZZ0000" })], ctx);
  assert.deepEqual(r.sameVehicle.map(x => x.indentNo), [1]);
});
test("confirmUpdate keeps cash, sets confirmed fields and never touches the original object", () => {
  const r0 = req({ amount: 32000, dieselAmount: 30000, cashAmount: 2000 });
  const u = confirmUpdate(r0, { amount: 30000, receiptNo: "K0589", bill: bill({}), by: "Sharan", at: "21/11/26, 8:00 pm", method: "bulk_receipt" });
  assert.equal(u.status, "confirmed");
  assert.equal(u.confirmedAmount, 30000);
  assert.equal(u.confirmedCash, 2000);
  assert.equal(u.amount, 32000);
  assert.equal(u.receiptNo, "K0589");
  assert.equal(u.pin, "****");
  assert.equal(u.confirmationMethod, "bulk_receipt");
  assert.equal(r0.status, "open");
});
test("confirmUpdate records a reason when the amount changed", () => {
  const r0 = req({ amount: 18000, dieselAmount: 18000, cashAmount: 0 });
  const u = confirmUpdate(r0, { amount: 18000, receiptNo: "S1 + S2", bill: bill({}), by: "S", at: "t", method: "bulk_receipt_manual", reason: "Served in 2 bills" });
  assert.equal(u.confirmedReason, "Served in 2 bills");
});

test("deleteBlockReason: open or pump-confirmed requests with no bill and no LR may be deleted", () => {
  assert.equal(deleteBlockReason(req({ status: "open" })), "");
  assert.equal(deleteBlockReason(req({ status: "confirmed" })), "");
});
test("deleteBlockReason: never for attached/reconciled, or ones holding a bill or an LR", () => {
  assert.match(deleteBlockReason(req({ status: "attached" })), /attached/i);
  assert.match(deleteBlockReason(req({ status: "reconciled" })), /reconciled/i);
  assert.match(deleteBlockReason(req({ status: "confirmed", receiptNo: "K1" })), /bill/i);
  assert.match(deleteBlockReason(req({ status: "open", receiptImagePath: "a/b.jpg" })), /bill/i);
  assert.match(deleteBlockReason(req({ status: "open", lrNo: "SKLC1" })), /LR/);
  assert.match(deleteBlockReason(req({ status: "open", tripId: "t1" })), /LR|trip/i);
});
test("same receipt number as a stored bill but a different vehicle/amount is NOT a duplicate; the owner gets a notice", () => {
  const stored = req({ indentNo: 9, status: "confirmed", receiptNo: "K0596", extractedVehicleNo: "5499", extractedAmount: 15396, receiptImagePath: "x.jpg" });
  const target = req({ indentNo: 10, truckNo: "KA28AB8840", amount: 10000, dieselAmount: 10000 });
  const [r] = matchBatch([bill({ vehicleNo: "8840", amount: 10000, receiptNo: "K0596" })], [stored, target], ctx);
  assert.equal(r.state, "match"); assert.equal(r.request.indentNo, 10);
  assert.equal(r.notices.length, 1); assert.equal(r.notices[0].indentNo, 9);
});
test("the same bill uploaded again (same receipt, vehicle, amount) is still a duplicate", () => {
  const stored = req({ indentNo: 9, status: "confirmed", receiptNo: "K0596", extractedVehicleNo: "5499", extractedAmount: 15396, receiptImagePath: "x.jpg" });
  const [r] = matchBatch([bill({ vehicleNo: "5499", amount: 15396, receiptNo: "K0596" })], [stored], ctx);
  assert.equal(r.state, "duplicate_receipt"); assert.equal(r.request.indentNo, 9);
});
test("two bills in one batch with the same receipt number but different vehicle/amount are both fine", () => {
  const a = req({ indentNo: 1, truckNo: "TS07UH5499", amount: 15396, dieselAmount: 15396 });
  const b = req({ indentNo: 2, truckNo: "KA28AB8840", amount: 10000, dieselAmount: 10000 });
  const res = matchBatch([bill({ id: "b1", vehicleNo: "5499", amount: 15396, receiptNo: "K0596" }), bill({ id: "b2", vehicleNo: "8840", amount: 10000, receiptNo: "K0596" })], [a, b], ctx);
  assert.deepEqual(res.map((r) => r.state), ["match", "match"]);
});
test("the same bill twice in one batch: second is a duplicate", () => {
  const a = req({ indentNo: 1, truckNo: "TS07UH5499", amount: 15396, dieselAmount: 15396 });
  const res = matchBatch([bill({ id: "b1", vehicleNo: "5499", amount: 15396, receiptNo: "K0596" }), bill({ id: "b2", vehicleNo: "5499", amount: 15396, receiptNo: "K0596" })], [a], ctx);
  assert.equal(res[1].state, "duplicate_receipt");
});
test("manual check pre-selects the open request, not an old attached one of the same vehicle", () => {
  const att = req({ indentNo: 727, truckNo: "MH25AJ4078", status: "attached", amount: 19270, dieselAmount: 19270 });
  const open = req({ indentNo: 2190, truckNo: "MH25AJ4078", amount: 19700, dieselAmount: 19700 });
  assert.equal(defaultRequestPick({ sameVehicle: [att, open] }), open.id);
  assert.equal(defaultRequestPick({ sameVehicle: [att] }), "");
  assert.equal(defaultRequestPick({ candidates: [open, att], sameVehicle: [] }), open.id);
  assert.equal(defaultRequestPick(null), "");
});
test("a corrected amount keeps the original scan and re-matches", () => {
  const d = withCorrectedAmount({ vehicleNo: "4078", amount: 9700 }, "19,700");
  assert.equal(d.amount, 19700); assert.equal(d.scanAmount, 9700); assert.equal(d.edited, true);
  const again = withCorrectedAmount(d, "19700.50"); assert.equal(again.scanAmount, 9700);
  assert.equal(withCorrectedAmount(d, "").amount, null);
  assert.equal(withCorrectedAmount({ amount: 500 }, "500").edited, false);
  const a = req({ indentNo: 2190, truckNo: "MH25AJ4078", amount: 19700, dieselAmount: 19700 });
  const b = (amt) => matchBatch([bill({ id: "b1", vehicleNo: "4078", amount: amt, receiptNo: "K0749" })], [a], ctx)[0].state;
  assert.notEqual(b(9700), "match"); assert.equal(b(d.amount), "match");
});
test("bills of one vehicle are grouped; a last-4 bill joins the one full number; singles are not groups", () => {
  const bs = [bill({ id: "a", vehicleNo: "KA28AB7880", amount: 10000 }), bill({ id: "b", vehicleNo: "7880", amount: 22000 }), bill({ id: "c", vehicleNo: "TS07UH5499", amount: 5000 }), bill({ id: "d", vehicleNo: "", amount: 5 }), bill({ id: "e", vehicleNo: "7880", amount: 0 })];
  const g = groupBillsByVehicle(bs);
  assert.equal(g.length, 1); assert.deepEqual(g[0].bills.map((b) => b.id), ["a", "b"]); assert.equal(g[0].vehicleNo, "KA28AB7880");
  assert.equal(groupable(bs[3]), false); assert.equal(groupable(bs[4]), false);
});
test("two different trucks ending in the same 4 digits are not silently merged with a short bill", () => {
  const g = groupBillsByVehicle([bill({ id: "a", vehicleNo: "KA28AB7880", amount: 1 }), bill({ id: "b", vehicleNo: "TS07UH7880", amount: 1 }), bill({ id: "c", vehicleNo: "7880", amount: 1 })]);
  assert.equal(g.length, 0);
});
test("group check: exact total has no reason needed; any difference or odd bill needs one", () => {
  const r = req({ indentNo: 9, amount: 32000, dieselAmount: 32000 });
  const ok = groupCheck([bill({ amount: 20000, receiptNo: "A1" }), bill({ amount: 12000, receiptNo: "A2" })], r, ctx);
  assert.equal(ok.total, 32000); assert.equal(ok.diff, 0); assert.equal(ok.exact, true); assert.equal(ok.needsReason, false);
  const less = groupCheck([bill({ amount: 20000 }), bill({ amount: 11000 })], r, ctx);
  assert.equal(less.diff, -1000); assert.equal(less.needsReason, true);
  const odd = groupCheck([bill({ amount: 20000 }), bill({ amount: 12000, pumpName: "OTHER PUMP", date: "2026-11-25" })], r, ctx);
  assert.equal(odd.diff, 0); assert.equal(odd.needsReason, true); assert.equal(odd.issues.length, 2);
  assert.equal(groupCheck([bill({ amount: 20000 })], null, ctx).needsReason, false);
});
test("group candidates: same vehicle, never an attached/billed request; open and exact total first", () => {
  const exactConfirmed = req({ indentNo: 1, status: "confirmed", amount: 32000, dieselAmount: 32000 });
  const openOther = req({ indentNo: 2, amount: 9000, dieselAmount: 9000 });
  const openExact = req({ indentNo: 3, amount: 32000, dieselAmount: 32000 });
  const attached = req({ indentNo: 4, status: "attached", amount: 32000, dieselAmount: 32000, lrNo: "LR1", receiptNo: "X" });
  const other = req({ indentNo: 5, truckNo: "TS07UH5499", amount: 32000, dieselAmount: 32000 });
  const c = groupCandidates([exactConfirmed, openOther, openExact, attached, other], "KA28AB7880", 32000);
  assert.deepEqual(c.map((r) => r.indentNo), [3, 1, 2]);
});
let ok = 0;
for (const [n, f] of tests) { try { await f(); console.log("ok -", n); ok++; } catch (e) { console.log("not ok -", n, e.message); process.exitCode = 1; } }
console.log(ok + " tests passed");
