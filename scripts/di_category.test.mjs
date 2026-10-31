import assert from "node:assert/strict";
import { diCategory, diCat, goodsFor, tripHasCategory, followupByVehicle, followupHtml } from "../src/di_category.js";
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };

// RULE: if the Goods text has NT → NT (non trade), else T (trade)
t("real goods strings from the database", () => {
  assert.equal(diCategory("SC NT OPC53 LOOSE"), "NT");
  assert.equal(diCategory("SC NT OPC43 PP 50KG"), "NT");
  assert.equal(diCategory("SC NT PPC PP 50KG"), "NT");
  assert.equal(diCategory("Shree JUNGRODHAK TR PPC PP 50 KG"), "T");
  assert.equal(diCategory("Bangur POWERMAX TR PPC PP 50KG"), "T");
  assert.equal(diCategory("Bangur Roofon Plus PPC Prem LPP 50KG"), "T");
  assert.equal(diCategory("Clinker"), "T");
});
t("NT must be its own word — CEMENT / PAYMENT / AGENT contain 'nt' but are trade", () => {
  assert.equal(diCategory("Portland CEMENT PPC"), "T");
  assert.equal(diCategory("Shree Cement Packed"), "T");
  assert.equal(diCategory("AGENT PAYMENT"), "T");
});
t("case, punctuation and the written-out form", () => {
  assert.equal(diCategory("sc nt opc53"), "NT");
  assert.equal(diCategory("Goods :SC NT OPC53 PP"), "NT");
  assert.equal(diCategory("SC-NT-OPC53"), "NT");
  assert.equal(diCategory("NON TRADE OPC"), "NT");
  assert.equal(diCategory("Non-Trade"), "NT");
});
t("no goods text: NA while not billed, T once billed (history)", () => {
  assert.equal(diCategory("", false), "NA"); assert.equal(diCategory(null, false), "NA"); assert.equal(diCategory(undefined), "NA");
  assert.equal(diCategory("", true), "T"); assert.equal(diCategory(null, true), "T");
  assert.equal(diCategory("SC NT OPC", false), "NT"); assert.equal(diCategory("Shree TR PPC", false), "T");
});
t("diCat reads goods and billing from the DI line, else the trip", () => {
  const trip = { grParticulars: { goods: "" } };
  assert.equal(diCat(trip, { billed: false }), "NA");
  assert.equal(diCat(trip, { billed: true }), "T");
  assert.equal(diCat(trip, { paid: true }), "T");
  assert.equal(diCat({ invoiceNo: "INV1" }, null), "T");
  assert.equal(diCat({ status: "Paid" }, null), "T");
  assert.equal(diCat({}, null), "NA");
  assert.equal(diCat({ grParticulars: { goods: "SC NT PPC" } }, { billed: true }), "NT");
});

t("goods come from the DI line first, else the trip's GR particulars", () => {
  const trip = { grParticulars: { goods: "SC NT OPC53 LOOSE" } };
  assert.equal(goodsFor(trip, { goods: "Shree TR OPC43 PP 50 KG" }), "Shree TR OPC43 PP 50 KG");
  assert.equal(goodsFor(trip, {}), "SC NT OPC53 LOOSE");
  assert.equal(goodsFor({}, {}), "");
});
t("trip filter: a trip matches a category if any of its DIs is in it", () => {
  const mixed = { grParticulars: { goods: "Shree TR PPC" }, diLines: [{ diNo: "1" }, { diNo: "2", goods: "SC NT OPC53" }] };
  assert.equal(tripHasCategory(mixed, "NT"), true);
  assert.equal(tripHasCategory(mixed, "T"), true);
  assert.equal(tripHasCategory({ grParticulars: { goods: "SC NT PPC" } }, "T"), false);
  assert.equal(tripHasCategory({ grParticulars: { goods: "SC NT PPC" } }, "NT"), true);
  assert.equal(tripHasCategory({}, "T"), false);         // single-DI trip, no goods, not billed → NA
  assert.equal(tripHasCategory({}, "NA"), true);
  assert.equal(tripHasCategory({ invoiceNo: "I" }, "T"), true);   // billed, no goods → T
  assert.equal(tripHasCategory({}, "all"), true);
});

const E = (o) => ({ truckNo: "KA1", date: "2026-10-01", lrNo: "L1", partyName: "P", diNo: "D1", cat: "T", pouch: false, email: false, ready: false, amount: 1000, ...o });
t("vehicle-wise grouping: totals, counts, sort by amount desc, oldest date", () => {
  const r = followupByVehicle([
    E({ truckNo: "KA1", diNo: "D1", lrNo: "L1", amount: 1000, date: "2026-10-05" }),
    E({ truckNo: "KA1", diNo: "D2", lrNo: "L1", amount: 500, date: "2026-10-05" }),
    E({ truckNo: "KA1", diNo: "D3", lrNo: "L2", amount: 250, date: "2026-09-01" }),
    E({ truckNo: "KA2", diNo: "D4", lrNo: "L3", amount: 5000, date: "2026-10-10" }),
  ]);
  assert.deepEqual(r.vehicles.map(v => v.truckNo), ["KA2", "KA1"]);
  const v = r.vehicles[1];
  assert.equal(v.dis, 3); assert.equal(v.lrs, 2); assert.equal(v.amount, 1750); assert.equal(v.oldest, "2026-09-01");
  assert.equal(r.totals.trips, 3); assert.equal(r.totals.dis, 4); assert.equal(r.totals.vehicles, 2); assert.equal(r.totals.amount, 6750);
  assert.equal(r.totals.amount, r.vehicles.reduce((s, x) => s + x.amount, 0));
  assert.deepEqual(v.entries.map(e => e.diNo), ["D1", "D2", "D3"]);   // newest date first
});
t("same DI number on two trucks stays separate; blank truck is grouped as unassigned", () => {
  const r = followupByVehicle([E({ truckNo: "", diNo: "X" }), E({ truckNo: "KA9", diNo: "X" })]);
  assert.equal(r.vehicles.length, 2);
  assert.ok(r.vehicles.some(v => v.truckNo === "—"));
});
t("html lists every DI, vehicle headings, T/NT tags, filters and escapes text", () => {
  const r = followupByVehicle([E({ partyName: "A<script>", diNo: "9001", cat: "NT" }), E({ truckNo: "KA2", diNo: "9002", amount: 20 })]);
  const h = followupHtml(r, { company: "M Yantra", filterSummary: "Category: NT", generated: "31 Oct 2026", fmt: (x) => "₹" + x, logo: "" });
  assert.ok(h.includes("9001") && h.includes("9002") && h.includes("KA1") && h.includes("KA2"));
  assert.ok(h.includes("Category: NT") && h.includes("Vehicle Summary"));
  assert.ok(h.includes("A&lt;script&gt;") && !h.includes("A<script>"));
  assert.ok(h.includes(">NT<") && h.includes(">T<"));
  const h2 = followupHtml(followupByVehicle([E({ cat: "NA" })]), { fmt: (x) => x });
  assert.ok(h2.includes(">NA<"));
});
console.log(n + " tests passed");
