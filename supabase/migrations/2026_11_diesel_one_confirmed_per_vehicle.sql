-- A vehicle with a CONFIRMED diesel request (pump issued it, no LR attached yet) cannot get a new OPEN request.
-- Only new open requests are checked: confirmations, attaches, edits and the pump-bill flow are untouched.
create or replace function mye_diesel_one_confirmed() returns trigger language plpgsql as $$
begin
  if new.status = 'open' and exists (
    select 1 from mye_diesel_requests r
    where r.status = 'confirmed' and r.id <> new.id
      and upper(regexp_replace(r.truck_no, '\s', '', 'g')) = upper(regexp_replace(new.truck_no, '\s', '', 'g'))
  ) then
    raise exception 'Either delete existing confirmed diesel request or attach LR to it for creating new diesel request';
  end if;
  return new;
end $$;
drop trigger if exists trg_diesel_one_confirmed on mye_diesel_requests;
create trigger trg_diesel_one_confirmed before insert on mye_diesel_requests
  for each row execute function mye_diesel_one_confirmed();
