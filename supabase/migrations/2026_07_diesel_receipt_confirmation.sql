-- ══════════════════════════════════════════════════════════════
-- Diesel Receipt-Scan Confirmation — additive migration
-- Paste into: Supabase → SQL Editor → Run
-- Safe on production: every column is nullable / has a default,
-- existing rows and the PIN-confirm write path are untouched.
-- ══════════════════════════════════════════════════════════════

alter table mye_diesel_requests
  add column if not exists receipt_no            text,
  add column if not exists receipt_image_path     text,          -- storage path, only set when a mismatch needs manager review
  add column if not exists extracted_vehicle_no    text,
  add column if not exists extracted_amount        numeric,
  add column if not exists extracted_date          text,
  add column if not exists extracted_pump_name     text,
  add column if not exists vehicle_mismatch        boolean default false,
  add column if not exists pump_mismatch           boolean default false,
  add column if not exists date_mismatch           boolean default false,
  add column if not exists confirmation_method     text,          -- 'pin' | 'receipt_scan'
  add column if not exists reviewed_by             text,
  add column if not exists reviewed_at             text;

-- Storage bucket for receipt images pending manager review.
-- Create manually in Supabase → Storage if it doesn't already exist:
--   Name: diesel-receipts
--   Public: false (private — access via signed URLs only, same pattern as trip-files)
