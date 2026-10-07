-- ═══════════════════════════════════════════════════════════════════════════
-- Husk module (rice, tuvar, soya … husk supply)
-- Paste into: Supabase → SQL Editor → Run   (run on EACH project: M Yantra and Kori)
--
-- Safe on production: only creates NEW tables, indexes and policies.
-- It does not touch any existing table or row. Idempotent (if not exists).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mye_husk_materials (
  id text primary key, name text not null, active boolean default true,
  ts bigint default 0, created_by text default '', created_at text default ''
);

create table if not exists mye_husk_companies (
  id text primary key, name text not null, contact text default '', active boolean default true,
  ts bigint default 0, created_by text default '', created_at text default ''
);

create table if not exists mye_husk_customers (
  id text primary key, name text not null, phone text default '',
  loan_per_trip numeric default 0,           -- Husk loan: amount deducted per trip
  active boolean default true,
  ts bigint default 0, created_by text default '', created_at text default ''
);

create table if not exists mye_husk_vehicles (
  id text primary key, truck_no text not null,
  customer_id text default '',               -- current owner; history in mye_husk_vehicle_owners
  ts bigint default 0, created_by text default '', created_at text default ''
);
create unique index if not exists mye_husk_vehicles_truck_uq on mye_husk_vehicles (upper(replace(truck_no, ' ', '')));

create table if not exists mye_husk_vehicle_owners (
  id text primary key, vehicle_id text not null, customer_id text not null,
  from_date text default '', to_date text default '',
  ts bigint default 0, created_by text default ''
);

-- Rates are dated, never overwritten. The rate for an entry is the row with the
-- latest effective_from on or before the entry date.
create table if not exists mye_husk_company_rates (
  id text primary key, company_id text not null, material_id text not null,
  rate numeric not null default 0, effective_from text not null,
  ts bigint default 0, created_by text default '', created_at text default ''
);
create table if not exists mye_husk_customer_rates (
  id text primary key, customer_id text not null, material_id text not null, company_id text not null,
  rate numeric not null default 0, effective_from text not null,
  ts bigint default 0, created_by text default '', created_at text default ''
);

-- One row per unloaded vehicle. Customer and both rates are saved on the row.
create table if not exists mye_husk_trips (
  id text primary key,
  entry_date text not null,                  -- the date the entry is made (rates follow this)
  company_id text not null, material_id text not null,
  vehicle_id text default '', truck_no text default '', customer_id text not null,
  tons numeric default 0,
  company_rate numeric default 0, customer_rate numeric default 0,
  company_amount numeric default 0, customer_amount numeric default 0,
  loan_deduction numeric default 0,
  customer_deduction numeric default 0,      -- recovery of a company deduction
  ded_payment_id text default '',            -- the company payment whose deduction this recovers
  net_payable numeric default 0,             -- customer_amount - loan_deduction - customer_deduction
  note text default '',
  entered_by text default '', entered_at text default '', edited_by text default '', edited_at text default '',
  ts bigint default 0
);
create index if not exists mye_husk_trips_date_idx on mye_husk_trips (entry_date);
create index if not exists mye_husk_trips_company_idx on mye_husk_trips (company_id, material_id);
create index if not exists mye_husk_trips_customer_idx on mye_husk_trips (customer_id);

-- Every payment in or out of the Husk business, from one screen.
--   kind = 'customer_paid'    : M Yantra paid a customer (advance or settlement)
--   kind = 'company_received' : a company paid M Yantra (amount + optional deduction)
create table if not exists mye_husk_payments (
  id text primary key, kind text not null, date text not null,
  company_id text default '', material_id text default '', customer_id text default '',
  amount numeric default 0, deduction numeric default 0, deduction_reason text default '',
  mode text default '', note text default '',
  created_by text default '', created_at text default '', ts bigint default 0
);
create index if not exists mye_husk_payments_date_idx on mye_husk_payments (date);

-- Starting position per customer or company (signed: customer + = M Yantra owes,
-- company + = company owes M Yantra). company_id / material_id are optional.
create table if not exists mye_husk_openings (
  id text primary key, party_type text not null, party_id text not null,
  company_id text default '', material_id text default '',
  amount numeric default 0, as_of text not null, note text default '',
  created_by text default '', ts bigint default 0
);

-- Separate Husk loan ledger: 'given' (loan to the customer) and 'recovered' (deducted on a trip).
create table if not exists mye_husk_loans (
  id text primary key, customer_id text not null, kind text not null,
  amount numeric default 0, date text not null, trip_id text default '', note text default '',
  created_by text default '', ts bigint default 0
);

-- Who changed what: every edit, delete and repricing keeps the before and after.
create table if not exists mye_husk_changelog (
  id text primary key, ts bigint default 0, at text default '', by text default '',
  table_name text default '', record_id text default '', action text default '',
  before jsonb, after jsonb
);

-- Same access convention as every other mye_* table (the app signs users in with its own PIN login).
do $$
declare t text;
begin
  foreach t in array array[
    'mye_husk_materials','mye_husk_companies','mye_husk_customers','mye_husk_vehicles','mye_husk_vehicle_owners',
    'mye_husk_company_rates','mye_husk_customer_rates','mye_husk_trips','mye_husk_payments','mye_husk_openings',
    'mye_husk_loans','mye_husk_changelog'
  ] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where policyname = 'anon_all_' || t) then
      execute format('create policy %I on %I for all using (true) with check (true)', 'anon_all_' || t, t);
    end if;
  end loop;
end $$;
