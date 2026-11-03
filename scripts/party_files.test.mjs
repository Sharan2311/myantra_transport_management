// Run: node scripts/party_files.test.mjs
import assert from "node:assert/strict";
import { normDI, partyGrFile, partyDocsMissing, matchInvoices, routeDroppedDocs } from "../src/party_files.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const F = (name, size = 1) => ({ name, size });

t("normDI keeps digits only", () => {
  assert.equal(normDI(" 9004-845792 "), "9004845792");
  assert.equal(normDI(null), "");
});

t("scanned DI/GR file counts as the GR copy for party", () => {
  const scan = F("di.pdf");
  assert.equal(partyGrFile({ orderType: "party", file: scan }), scan);
});

t("manually uploaded GR wins over the scan", () => {
  const scan = F("di.pdf"), manual = F("gr2.pdf");
  assert.equal(partyGrFile({ orderType: "party", file: scan, grFile: manual }), manual);
});

t("godown has no party GR requirement", () => {
  assert.equal(partyGrFile({ orderType: "godown", file: F("a.pdf") }), null);
});

t("partyDocsMissing: only invoice missing when scan exists", () => {
  assert.deepEqual(partyDocsMissing({ orderType: "party", file: F("di.pdf") }), ["Invoice"]);
});

t("partyDocsMissing: nothing missing when invoice attached", () => {
  assert.deepEqual(partyDocsMissing({ orderType: "party", file: F("di.pdf"), invoiceFile: F("inv.pdf") }), []);
});

t("partyDocsMissing: godown never missing", () => {
  assert.deepEqual(partyDocsMissing({ orderType: "godown", file: F("di.pdf") }), []);
});

const items = [
  { id: "i1", orderType: "party", extracted: { diNo: "9004845792" } },
  { id: "i2", orderType: "party", extracted: { diNo: "9004845800" }, invoiceFile: F("old.pdf") },
  { id: "i3", orderType: "godown", extracted: { diNo: "9004845811" } },
];

t("invoice attaches to the item with the same DI", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("inv1.pdf"), diNo: "9004845792" }]);
  assert.deepEqual(r.attach, [{ itemId: "i1", scanId: "s1" }]);
  assert.deepEqual(r.unmatched, []);
});

t("order of the dropped files does not matter", () => {
  const r = matchInvoices(items, [
    { id: "s2", file: F("b.pdf"), diNo: "9004845792" },
  ]);
  assert.equal(r.attach[0].itemId, "i1");
});

t("DI not among scanned trips -> unmatched no_trip", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("x.pdf"), diNo: "9999999999" }]);
  assert.equal(r.attach.length, 0);
  assert.equal(r.unmatched[0].reason, "no_trip");
});

t("unreadable DI -> unmatched no_di keeps the error text", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("x.pdf"), diNo: "", error: "Document rejected" }]);
  assert.equal(r.unmatched[0].reason, "no_di");
  assert.equal(r.unmatched[0].error, "Document rejected");
});

t("invoice for a godown DI is not needed", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("g.pdf"), diNo: "9004845811" }]);
  assert.equal(r.attach.length, 0);
  assert.equal(r.unmatched[0].reason, "not_party");
});

t("item that already has an invoice -> second file is a duplicate, never replaces", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("new.pdf"), diNo: "9004845800" }]);
  assert.equal(r.attach.length, 0);
  assert.equal(r.unmatched[0].reason, "duplicate");
});

t("same identical file seen again is silently idempotent", () => {
  const withSame = [{ id: "i2", orderType: "party", extracted: { diNo: "9004845800" }, invoiceFile: F("old.pdf", 5) }];
  const r = matchInvoices(withSame, [{ id: "s1", file: F("old.pdf", 5), diNo: "9004845800" }]);
  assert.equal(r.attach.length, 0);
  assert.equal(r.unmatched.length, 0);
});

t("two files for one DI: first attaches, second is a duplicate", () => {
  const r = matchInvoices(items, [
    { id: "s1", file: F("a.pdf"), diNo: "9004845792" },
    { id: "s2", file: F("b.pdf"), diNo: "9004845792" },
  ]);
  assert.deepEqual(r.attach, [{ itemId: "i1", scanId: "s1" }]);
  assert.equal(r.unmatched[0].scanId, "s2");
  assert.equal(r.unmatched[0].reason, "duplicate");
});

t("spaces/dashes in a read DI still match", () => {
  const r = matchInvoices(items, [{ id: "s1", file: F("a.pdf"), diNo: "9004 845792" }]);
  assert.equal(r.attach[0].itemId, "i1");
});

const G = (id, di) => ({ file: F(id + ".pdf"), kind: "gr", diNo: di });
const I = (id, di, error = "") => ({ file: F(id + ".pdf"), kind: "invoice", diNo: di, error });

t("route: one GR + its invoice -> both used", () => {
  const r = routeDroppedDocs([G("g", "9004845792"), I("i", "9004845792")], "");
  assert.equal(r.gr.file.name, "g.pdf");
  assert.deepEqual(r.invoices.map(x => x.name), ["i.pdf"]);
  assert.deepEqual(r.notices, []);
  assert.equal(r.blocked, "");
});

t("route: invoice order before GR does not matter", () => {
  const r = routeDroppedDocs([I("i", "9004845792"), G("g", "9004845792")], "");
  assert.equal(r.gr.file.name, "g.pdf");
  assert.equal(r.invoices.length, 1);
});

t("route: invoice with another DI is refused with a notice, never attached", () => {
  const r = routeDroppedDocs([G("g", "9004845792"), I("i", "9004845800")], "");
  assert.equal(r.invoices.length, 0);
  assert.match(r.notices[0], /9004845800/);
  assert.match(r.notices[0], /9004845792/);
});

t("route: invoice only, DI of the open trip is used", () => {
  const r = routeDroppedDocs([I("i", "9004845792")], "9004845792");
  assert.equal(r.gr, null);
  assert.equal(r.invoices.length, 1);
});

t("route: invoice only with no DI to compare -> refused", () => {
  const r = routeDroppedDocs([I("i", "9004845792")], "");
  assert.equal(r.invoices.length, 0);
  assert.match(r.notices[0], /GR/i);
});

t("route: unreadable invoice -> notice with the reason", () => {
  const r = routeDroppedDocs([G("g", "9004845792"), I("i", "", "Document rejected")], "");
  assert.equal(r.invoices.length, 0);
  assert.match(r.notices[0], /Document rejected/);
});

t("route: two GR/DI copies in one drop -> blocked (single trip = one DI)", () => {
  const r = routeDroppedDocs([G("g1", "9004845792"), G("g2", "9004845800")], "");
  assert.match(r.blocked, /one/i);
  assert.equal(r.gr, null);
});

t("route: two invoices for the same DI -> only the first is used", () => {
  const r = routeDroppedDocs([G("g", "9004845792"), I("a", "9004845792"), I("b", "9004845792")], "");
  assert.deepEqual(r.invoices.map(x => x.name), ["a.pdf"]);
  assert.equal(r.notices.length, 1);
});

console.log(`\n${n} tests passed`);
