-- v2 of the duplicate-bill rule. The pump has printed the SAME receipt number (e.g. K0596) on two different bills
-- (different vehicle, amount and day), so the receipt number alone must not block a save.
-- A receipt number is refused only when another request already holds it AND the bills are not provably different:
--   provably different = both bills have a vehicle (last 4 characters) or an amount, and it differs.
-- Missing data, or a split receipt ("K1 + K2"), cannot prove a difference, so those still count as duplicates.
-- Fires only on INSERT or when receipt_no changes. Mirrors src/bill_identity.js.
create or replace function public.mye_diesel_receipt_unique() returns trigger
language plpgsql as $$
declare mine text[]; clash record; x text;
begin
  if tg_op = 'UPDATE' and new.receipt_no is not distinct from old.receipt_no then return new; end if;
  select coalesce(array_agg(distinct upper(trim(p))), '{}') into mine
    from regexp_split_to_table(coalesce(new.receipt_no,''), '\+') p where trim(p) <> '';
  if cardinality(mine) = 0 then return new; end if;
  foreach x in array mine loop perform pg_advisory_xact_lock(hashtext('mye_receipt:'||x)); end loop;
  select r.indent_no, r.truck_no, p2.part into clash
    from public.mye_diesel_requests r
    cross join lateral (select upper(trim(p)) as part from regexp_split_to_table(coalesce(r.receipt_no,''), '\+') p where trim(p) <> '') p2
   where r.id <> new.id and p2.part = any(mine)
     and not (
       cardinality(mine) = 1 and r.receipt_no !~ '\+'
       and (
         (right(regexp_replace(upper(coalesce(new.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4) <> ''
          and right(regexp_replace(upper(coalesce(r.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4) <> ''
          and right(regexp_replace(upper(coalesce(new.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4)
              <> right(regexp_replace(upper(coalesce(r.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4))
         or (new.extracted_amount is not null and r.extracted_amount is not null and new.extracted_amount <> r.extracted_amount)
       )
     )
   limit 1;
  if found then
    raise exception 'This bill is already attached to Indent # % (%): same receipt %, vehicle and amount. A bill can be used only once.', clash.indent_no, clash.truck_no, clash.part
      using errcode = '23505';
  end if;
  return new;
end $$;
