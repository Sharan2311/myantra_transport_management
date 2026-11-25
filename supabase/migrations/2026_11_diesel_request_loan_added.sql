-- Owner can add a confirmed (unattached) diesel request to the vehicle's loan and keep the request on record.
alter table mye_diesel_requests
  add column if not exists loan_added boolean not null default false,
  add column if not exists loan_added_amount numeric,
  add column if not exists loan_added_by text,
  add column if not exists loan_added_at text;

-- 1) A confirmed request that was added to the loan no longer blocks a new request for the vehicle.
create or replace function mye_diesel_one_confirmed() returns trigger language plpgsql as $$
begin
  if new.status = 'open' and exists (
    select 1 from mye_diesel_requests r
    where r.status = 'confirmed' and r.loan_added is not true and r.id <> new.id
      and upper(regexp_replace(r.truck_no, '\s', '', 'g')) = upper(regexp_replace(new.truck_no, '\s', '', 'g'))
  ) then
    raise exception 'Either delete existing confirmed diesel request or attach LR to it for creating new diesel request';
  end if;
  return new;
end $$;

-- 2) A request already added to the loan cannot be attached to an LR (the diesel would be charged twice).
create or replace function mye_diesel_loan_no_attach() returns trigger language plpgsql as $$
begin
  if new.loan_added is true and new.status = 'attached' and (old.status is distinct from 'attached') then
    raise exception 'This diesel request was added to the vehicle loan, so it cannot be attached to an LR';
  end if;
  return new;
end $$;
drop trigger if exists trg_diesel_loan_no_attach on mye_diesel_requests;
create trigger trg_diesel_loan_no_attach before update on mye_diesel_requests
  for each row execute function mye_diesel_loan_no_attach();
