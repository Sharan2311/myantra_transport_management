-- Daily per-employee Driver Pay balance snapshot (last write of the day wins), so a
-- balance can be compared with what it was on an earlier day.
-- Run on EACH project (M Yantra and Kori). Only creates a NEW table; idempotent.
create table if not exists mye_balance_snapshots (
  id text primary key,               -- '<YYYY-MM-DD>|<empId or unassigned>'
  snap_date text default '',
  emp_id text default '',
  emp_name text default '',
  trips integer default 0,           -- unpaid trips counted in the headline
  total numeric default 0,           -- headline balance (payable + pouch held)
  held numeric default 0,            -- pouch held until confirmation
  payable numeric default 0,         -- payable now
  ts bigint default 0
);
create index if not exists mye_balance_snapshots_date_idx on mye_balance_snapshots (snap_date);
alter table mye_balance_snapshots enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anon_all_mye_balance_snapshots') then
    create policy anon_all_mye_balance_snapshots on mye_balance_snapshots for all using (true) with check (true);
  end if;
end $$;
