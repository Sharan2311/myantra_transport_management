-- ══════════════════════════════════════════════════════════════
-- Allow a 2nd diesel indent on the same LR (owner-only, manual-only
-- in the app) — additive migration.
-- Paste into: Supabase → SQL Editor → Run
--
-- Background: mye_diesel_requests has had a DB-level UNIQUE INDEX on
-- lr_no (excluding null/empty) that guarantees at most ONE diesel
-- request can ever be attached to a given LR. That's the real
-- concurrency-safety net behind the app's attach flow — see the
-- comment on saveDieselAttachSafe() in src/App.jsx.
--
-- This migration replaces that flat uniqueness with a trigger that
-- allows UP TO TWO 'attached' rows per lr_no, and still rejects a
-- 3rd — so the same concurrency guarantee holds, just raised from a
-- cap of 1 to a cap of 2. The app only ever lets the OWNER create a
-- 2nd attach, and only manually (never auto-attach) — this migration
-- is what makes that legal at the database layer too.
-- ══════════════════════════════════════════════════════════════

-- 1. Drop the old flat-uniqueness index.
--    If your actual index has a different name, find it first with:
--      select indexname from pg_indexes
--      where tablename = 'mye_diesel_requests' and indexdef ilike '%lr_no%';
--    then drop that name instead of the one below.
drop index if exists idx_diesel_requests_lr_unique;

-- 2. Trigger function: on insert/update of a row whose lr_no is
--    non-empty and whose status is 'attached', count how many OTHER
--    rows already share that lr_no with status='attached'. Reject if
--    that count is already 2 or more (i.e. this would make a 3rd+).
create or replace function mye_diesel_requests_lr_cap()
returns trigger
language plpgsql
as $$
declare
  existing_count integer;
begin
  if new.lr_no is null or btrim(new.lr_no) = '' or new.status is distinct from 'attached' then
    return new;
  end if;

  select count(*) into existing_count
  from mye_diesel_requests
  where lr_no = new.lr_no
    and status = 'attached'
    and id <> new.id;

  if existing_count >= 2 then
    raise exception 'idx_diesel_requests_lr_unique: LR "%" already has 2 diesel requests attached', new.lr_no
      using errcode = '23505'; -- same unique_violation code the app's error-message matching already looks for
  end if;

  return new;
end;
$$;

drop trigger if exists trg_diesel_requests_lr_cap on mye_diesel_requests;
create trigger trg_diesel_requests_lr_cap
  before insert or update on mye_diesel_requests
  for each row
  execute function mye_diesel_requests_lr_cap();

-- Note: the app's saveDieselAttachSafe() error-message matching looks for
-- "idx_diesel_requests_lr_unique" OR "duplicate key" in the thrown error —
-- this trigger's RAISE EXCEPTION message includes that same string, and
-- errcode 23505 ('unique_violation') makes Postgres' own "duplicate key"
-- phrasing show up too, so the existing error handling in the app keeps
-- working unchanged, now firing only once a 3rd attach is attempted.
