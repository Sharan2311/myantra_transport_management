-- Party Portal: per-DI "Sent for billing" stage (+ rejection note when it is sent back to Not Billed).
-- Multi-DI trips keep these inside di_lines (jsonb); single-DI trips use these flat columns.
-- Run on EACH project (M Yantra and Kori). Additive and idempotent.
alter table mye_trips
  add column if not exists sent_for_billing boolean default false,
  add column if not exists sent_for_billing_by text default '',
  add column if not exists sent_for_billing_at text default '',
  add column if not exists billing_rejected_by text default '',
  add column if not exists billing_rejected_at text default '',
  add column if not exists billing_reject_note text default '';
