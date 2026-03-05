-- ══════════════════════════════════════════════════════════════
-- M. YANTRA ENTERPRISES — SUPABASE SCHEMA
-- Paste this entire file into: Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════

create table if not exists mye_users (
  id text primary key, name text, username text unique,
  pin text, role text default 'operator', active boolean default true, created_at text
);
create table if not exists mye_trips (
  id text primary key, type text default 'outbound',
  lr_no text, di_no text, truck_no text, gr_no text, consignee text,
  "from" text, "to" text, grade text,
  qty numeric default 0, bags integer default 0,
  fr_rate numeric default 0, given_rate numeric default 0,
  date text, advance numeric default 0, shortage numeric default 0,
  tafal numeric default 0, diesel_estimate numeric default 0,
  status text default 'Pending Bill', invoice_no text,
  payment_status text default 'Unpaid', driver_settled boolean default false,
  settled_by text, net_paid numeric default 0,
  billed_by text, billed_at text, edited_by text, edited_at text,
  created_by text, created_at text
);
create table if not exists mye_vehicles (
  id text primary key, truck_no text unique, owner_name text, phone text,
  loan numeric default 0, loan_recovered numeric default 0,
  deduct_per_trip numeric default 0, tafal_exempt boolean default false,
  shortage_owed numeric default 0, shortage_recovered numeric default 0,
  created_by text
);
create table if not exists mye_employees (
  id text primary key, name text, phone text, role text,
  loan numeric default 0, loan_recovered numeric default 0,
  linked_trucks text[] default '{}', created_by text
);
create table if not exists mye_payments (
  id text primary key, invoice_no text, date text,
  total_bill numeric default 0, tds numeric default 0,
  gst_hold numeric default 0, hold numeric default 0,
  shortage_total numeric default 0, shortage_lines jsonb default '[]',
  other_deduct numeric default 0, other_deduct_label text,
  paid numeric default 0, utr text, created_by text, created_at text
);
create table if not exists mye_settlements (
  id text primary key, trip_id text, date text,
  truck_no text, lr_no text, gr_no text, "to" text,
  qty numeric, given_rate numeric, owner_name text,
  gross numeric default 0, tafal numeric default 0,
  loan_deduct numeric default 0, diesel numeric default 0,
  advance numeric default 0, shortage numeric default 0, net numeric default 0,
  notes text, settled_by text, settled_at text
);
create table if not exists mye_pumps (
  id text primary key, name text, contact text, address text,
  account_no text, ifsc text, created_by text
);
create table if not exists mye_indents (
  id text primary key, pump_id text, truck_no text, trip_id text,
  indent_no text, date text, litres numeric default 0,
  rate_per_litre numeric default 0, amount numeric default 0,
  confirmed boolean default false, paid boolean default false,
  paid_date text, paid_ref text, created_by text, created_at text
);
create table if not exists mye_driver_payments (
  id text primary key, trip_id text, truck_no text, lr_no text,
  amount numeric default 0, utr text, date text, notes text,
  created_by text, created_at text
);
create table if not exists mye_expenses (
  id text primary key, date text, label text,
  amount numeric default 0, category text, notes text,
  created_by text, created_at text
);
create table if not exists mye_gst_releases (
  id text primary key, date text, invoice_ref text,
  amount numeric default 0, utr text, notes text,
  created_by text, created_at text
);
create table if not exists mye_activity (
  id text primary key, "user" text, role text,
  action text, detail text, time text
);
create table if not exists mye_settings (
  key text primary key, value jsonb
);

insert into mye_settings(key,value) values('app_settings','{"tafalPerTrip":300}')
on conflict(key) do nothing;

alter table mye_users           enable row level security;
alter table mye_trips           enable row level security;
alter table mye_vehicles        enable row level security;
alter table mye_employees       enable row level security;
alter table mye_payments        enable row level security;
alter table mye_settlements     enable row level security;
alter table mye_pumps           enable row level security;
alter table mye_indents         enable row level security;
alter table mye_driver_payments enable row level security;
alter table mye_expenses        enable row level security;
alter table mye_gst_releases    enable row level security;
alter table mye_activity        enable row level security;
alter table mye_settings        enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where policyname='anon_all_users')    then create policy anon_all_users    on mye_users           for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_trips')    then create policy anon_all_trips    on mye_trips           for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_vehicles') then create policy anon_all_vehicles on mye_vehicles        for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_employees')then create policy anon_all_employees on mye_employees      for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_payments') then create policy anon_all_payments on mye_payments        for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_settl')    then create policy anon_all_settl    on mye_settlements     for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_pumps')    then create policy anon_all_pumps    on mye_pumps           for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_indents')  then create policy anon_all_indents  on mye_indents         for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_dp')       then create policy anon_all_dp       on mye_driver_payments for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_exp')      then create policy anon_all_exp      on mye_expenses        for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_gst')      then create policy anon_all_gst      on mye_gst_releases    for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_activity') then create policy anon_all_activity on mye_activity        for all using(true) with check(true); end if;
  if not exists(select 1 from pg_policies where policyname='anon_all_settings') then create policy anon_all_settings on mye_settings        for all using(true) with check(true); end if;
end $$;

insert into mye_users(id,name,username,pin,role,active,created_at) values
  ('U001','Incharge','owner',   '1234','owner',   true,now()::text),
  ('U002','Raju',    'raju',    '2222','manager', true,now()::text),
  ('U003','Suresh',  'suresh',  '3333','operator',true,now()::text),
  ('U004','Accounts','accounts','4444','accounts',true,now()::text)
on conflict(id) do nothing;
