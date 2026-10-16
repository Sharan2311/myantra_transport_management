-- Frozen copy of every driver-payment batch (one row per UTR / bank transfer), so a
-- Payment Advice can be re-sent for any employee and any day exactly as it was paid.
-- Run on EACH project (M Yantra and Kori). Only creates a NEW table; idempotent.
create table if not exists mye_payment_advices (
  id text primary key,
  utr text default '',
  pay_date text default '',          -- payment date (YYYY-MM-DD)
  paid_to text default '',
  notes text default '',
  total numeric default 0,
  rows jsonb default '[]'::jsonb,    -- [{tripId, truckNo, lrNo, amount, empId}]
  emp_ids jsonb default '[]'::jsonb, -- employee ids present in rows ("" = unassigned)
  created_by text default '',
  created_at text default '',
  ts bigint default 0
);
create index if not exists mye_payment_advices_date_idx on mye_payment_advices (pay_date);
alter table mye_payment_advices enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anon_all_mye_payment_advices') then
    create policy anon_all_mye_payment_advices on mye_payment_advices for all using (true) with check (true);
  end if;
end $$;
