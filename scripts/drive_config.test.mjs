import test from "node:test"; import assert from "node:assert/strict";
import { extractDriveId, parseDriveLink, setDriveFolders, getDriveRoot, DRIVE_KEYS } from "../src/drive_config.js";
const ID = "1xa6W-u-Q91u5QDS_AFPhrXzmwdjc2QEf";
test("folder link formats", () => {
  assert.equal(extractDriveId(`https://drive.google.com/drive/folders/${ID}`), ID);
  assert.equal(extractDriveId(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`), ID);
  assert.equal(extractDriveId(`https://drive.google.com/open?id=${ID}`), ID);
  assert.equal(extractDriveId("https://example.com/x"), null);
});
test("parseDriveLink accepts a link or a bare folder id, trims spaces", () => {
  assert.deepEqual(parseDriveLink(`  https://drive.google.com/drive/folders/${ID}  `), { ok: true, id: ID });
  assert.deepEqual(parseDriveLink(ID), { ok: true, id: ID });
});
test("parseDriveLink: empty means 'use the default' (ok, no id)", () => {
  assert.deepEqual(parseDriveLink(""), { ok: true, id: "" });
  assert.deepEqual(parseDriveLink("   "), { ok: true, id: "" });
  assert.deepEqual(parseDriveLink(null), { ok: true, id: "" });
});
test("parseDriveLink rejects junk and file links", () => {
  assert.equal(parseDriveLink("hello").ok, false);
  assert.equal(parseDriveLink("https://google.com").ok, false);
  assert.equal(parseDriveLink(`https://drive.google.com/file/d/${ID}/view`).ok, false);
  assert.match(parseDriveLink("hello").error, /folder/i);
});
test("getDriveRoot: configured folder wins, otherwise the fallback", () => {
  setDriveFolders({ trips: `https://drive.google.com/drive/folders/${ID}` });
  assert.equal(getDriveRoot("trips", "DEFAULT"), ID);
  assert.equal(getDriveRoot("payments", "DEFAULT"), "DEFAULT");
  assert.equal(getDriveRoot(undefined, "DEFAULT"), "DEFAULT");
});
test("getDriveRoot: a broken saved value falls back instead of breaking the picker", () => {
  setDriveFolders({ trips: "garbage" });
  assert.equal(getDriveRoot("trips", "DEFAULT"), "DEFAULT");
  setDriveFolders(null);
  assert.equal(getDriveRoot("trips", "DEFAULT"), "DEFAULT");
});
test("the four screens", () => { assert.deepEqual(DRIVE_KEYS.map(k => k.key), ["trips", "payments", "invoices", "advices"]); });
