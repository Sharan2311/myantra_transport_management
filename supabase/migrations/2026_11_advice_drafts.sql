-- Payment advices read from e-mail, waiting for the owner's review. One row per UTR (idempotent).
-- status: waiting (our invoice not uploaded yet) | ready | check (totals did not reconcile) | saved | discarded
-- Run on EACH project (M Yantra and Kori). Only creates a NEW table.
create table if not exists mye_advice_drafts (
  id text primary key, utr text default '', pay_date text default '', total numeric default 0,
  advice jsonb default '{}'::jsonb, status text default 'waiting', missing jsonb default '[]'::jsonb,
  source text default 'email', msg_id text default '', mail_date text default '',
  saved_at text default '', created_at text default '', ts bigint default 0
);
alter table mye_advice_drafts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'anon_all_mye_advice_drafts') then
    create policy anon_all_mye_advice_drafts on mye_advice_drafts for all using (true) with check (true);
  end if;
end $$;
