import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
const out = new URL("./_tmp_advice_reader.gs", import.meta.url).pathname;
execFileSync("node", [new URL("./build_apps_script.mjs", import.meta.url).pathname, "https://x.supabase.co", "KEY123", out]);
const code = fs.readFileSync(out, "utf8"); fs.unlinkSync(out);
const html = fs.readFileSync(new URL("./fixtures/advice_real.html", import.meta.url), "utf8");
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };
const mk = (o) => ({ getId: () => o.id, getFrom: () => o.from ?? "Shree <noreply@shreecement.com>", getSubject: () => o.subject ?? "Payment Advise", getBody: () => o.body ?? html, getPlainBody: () => o.plain ?? "", getDate: () => new Date("2026-10-15") });
const run = (messages, fn = "backfill", extra = {}) => {
  const calls = [], logs = []; let page = 0;
  const ctx = { GmailApp: { search: (q, s) => { calls.push({ q, s }); return s === 0 ? [{ getMessages: () => messages }] : []; } },
    UrlFetchApp: { fetch: (u, o) => { calls.push({ u, o }); return { getResponseCode: () => extra.code || 201, getContentText: () => "err" }; } },
    Logger: { log: (x) => logs.push(x) }, ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => logs.push("trigger") }) }) }), deleteTrigger() {} }, console };
  vm.createContext(ctx); vm.runInContext(code, ctx); ctx[fn]();
  return { calls, logs };
};
t("backfill searches from 1 April 2026 and saves drafts safely (never overwrites)", () => {
  const { calls, logs } = run([mk({ id: "m1" })]);
  assert.ok(calls[0].q.includes("after:2026/04/01") && calls[0].q.includes("noreply@shreecement.com"));
  const post = calls.find((c) => c.u);
  assert.ok(post.u.startsWith("https://x.supabase.co/rest/v1/mye_advice_drafts?on_conflict=id"));
  assert.equal(post.o.headers.Prefer, "resolution=ignore-duplicates,return=minimal"); assert.equal(post.o.headers.apikey, "KEY123");
  const rows = JSON.parse(post.o.payload);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, "EML-2018318075"); assert.equal(rows[0].total, 346670.1); assert.equal(rows[0].advice.invoices.length, 2);
  assert.equal(rows[0].status, "waiting"); assert.equal(rows[0].source, "email");
  assert.ok(logs.some((l) => /BACKFILL/.test(l) && /"sent":1/.test(l)));
});
t("hourly only looks at the last 3 days", () => assert.ok(run([mk({ id: "m1" })], "hourly").calls[0].q.includes("newer_than:3d")));
t("other mails are skipped, unreadable ones are logged and never saved", () => {
  const { calls, logs } = run([mk({ id: "a", subject: "Invoice copy" }), mk({ id: "b", from: "x@gmail.com" }), mk({ id: "c", body: "<html>garbage</html>" })]);
  assert.equal(calls.filter((c) => c.u).length, 0);
  assert.ok(logs.some((l) => /UNREADABLE mail c/.test(l)));
});
t("a mail whose totals don't add up is saved with status 'check'", () => {
  const bad = html.replace("186936.96", "186936.00");
  const rows = JSON.parse(run([mk({ id: "m", body: bad })]).calls.find((c) => c.u).o.payload);
  assert.equal(rows[0].status, "check"); assert.equal(rows[0].advice.reconciled, false);
});
t("a database error is not swallowed", () => assert.throws(() => run([mk({ id: "m1" })], "backfill", { code: 401 }), /Supabase 401/));
t("installHourlyTrigger installs one", () => assert.ok(run([], "installHourlyTrigger").logs.includes("trigger")));
console.log(n + " tests passed");
