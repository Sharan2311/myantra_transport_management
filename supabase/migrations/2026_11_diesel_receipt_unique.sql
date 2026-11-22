-- A pump bill (receipt number) can be attached to only ONE diesel request.
-- Enforced here as well as in the app. Mirrors the app: compare trimmed + upper-case.
-- A split confirmation stores "K1 + K2"; every part is checked on its own.
-- Fires only on INSERT or when receipt_no changes, so old rows can still be updated for other reasons.
create or replace function public.mye_diesel_receipt_unique() returns trigger
language plpgsql as $$
declare mine text[]; clash record; x text;
begin
  if tg_op = 'UPDATE' and new.receipt_no is not distinct from old.receipt_no then return new; end if;
  select coalesce(array_agg(distinct upper(trim(p))), '{}') into mine
    from regexp_split_to_table(coalesce(new.receipt_no,''), '\+') p where trim(p) <> '';
  if cardinality(mine) = 0 then return new; end if;
  -- serialise two saves of the same receipt happening at the same moment
  foreach x in array mine loop perform pg_advisory_xact_lock(hashtext('mye_receipt:'||x)); end loop;
  select r.indent_no, r.truck_no, upper(trim(p)) as part into clash
    from public.mye_diesel_requests r, regexp_split_to_table(coalesce(r.receipt_no,''), '\+') p
   where r.id <> new.id and trim(p) <> '' and upper(trim(p)) = any(mine) limit 1;
  if found then
    raise exception 'Receipt % is already attached to Indent # % (%). A receipt can be used only once.', clash.part, clash.indent_no, clash.truck_no
      using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists trg_diesel_receipt_unique on public.mye_diesel_requests;
create trigger trg_diesel_receipt_unique before insert or update on public.mye_diesel_requests
  for each row execute function public.mye_diesel_receipt_unique();
