-- ══════════════════════════════════════════════════════════════
-- 2nd diesel indent columns on mye_trips — additive migration.
-- Paste into: Supabase → SQL Editor → Run.
-- Safe on production: both columns are nullable with defaults;
-- every existing trip row is untouched and reads as "no 2nd indent".
--
-- Without this, the app's new dieselIndentNo2/dieselEstimate2 fields
-- have nowhere to persist — they'd show correctly in the trip form
-- right after the owner attaches a 2nd indent, then silently vanish
-- on the next page reload or the 45s background poll, because
-- tripToDB()/tripFromDB() in src/db.js now write/read these two
-- columns by name and the table needs to actually have them.
-- ══════════════════════════════════════════════════════════════

alter table mye_trips
  add column if not exists diesel_indent_no_2 text default '',
  add column if not exists diesel_estimate_2  numeric default 0;
