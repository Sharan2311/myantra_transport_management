-- A pump bill is identified by receipt number + nozzle (each nozzle can run its own receipt counter), and a group of
-- bills serving one request is compared part by part. Apply to BOTH databases (M Yantra and Kori).
-- Provably a different bill (allowed): the nozzle differs (both known), or the vehicle differs (last 4, both known),
-- or (one bill on each side) the amount differs. Missing data never proves two bills different.
alter table public.mye_diesel_requests add column if not exists extracted_nozzle text;

-- n-th part (1-based) of a "1 + 2" style list, digits only, no leading zeros: "01" -> "1"; blank/unknown -> ''
create or replace function public.mye_receipt_part(txt text, n int) returns text language sql immutable as $f$
  select coalesce(ltrim(regexp_replace(coalesce((string_to_array(coalesce(txt, ''), '+'))[n], ''), '\D', '', 'g'), '0'), '')
$f$;

create or replace function public.mye_diesel_receipt_unique() returns trigger language plpgsql as $f$
declare mine text[]; clash record; x text;
begin
  if tg_op = 'UPDATE' and new.receipt_no is not distinct from old.receipt_no then return new; end if;
  select coalesce(array_agg(distinct upper(trim(p))), '{}') into mine
    from regexp_split_to_table(coalesce(new.receipt_no,''), '\+') p where trim(p) <> '';
  if cardinality(mine) = 0 then return new; end if;
  foreach x in array mine loop perform pg_advisory_xact_lock(hashtext('mye_receipt:'||x)); end loop;
  select r.indent_no, r.truck_no, mp.part into clash
    from (select upper(trim(p)) as part, ord from regexp_split_to_table(coalesce(new.receipt_no,''), '\+') with ordinality as t(p, ord) where trim(p) <> '') mp
    cross join public.mye_diesel_requests r
    cross join lateral (select upper(trim(p)) as part, ord from regexp_split_to_table(coalesce(r.receipt_no,''), '\+') with ordinality as t2(p, ord) where trim(p) <> '') rp
   where r.id <> new.id and rp.part = mp.part
     and not (
       -- a different nozzle
       (public.mye_receipt_part(new.extracted_nozzle, mp.ord::int) <> '' and public.mye_receipt_part(r.extracted_nozzle, rp.ord::int) <> ''
        and public.mye_receipt_part(new.extracted_nozzle, mp.ord::int) <> public.mye_receipt_part(r.extracted_nozzle, rp.ord::int))
       -- a different vehicle (last 4)
       or (right(regexp_replace(upper(coalesce(new.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4) <> ''
           and right(regexp_replace(upper(coalesce(r.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4) <> ''
           and right(regexp_replace(upper(coalesce(new.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4)
               <> right(regexp_replace(upper(coalesce(r.extracted_vehicle_no,'')), '[^A-Z0-9]', '', 'g'), 4))
       -- one bill on each side with a different amount
       or (cardinality(mine) = 1 and r.receipt_no !~ '\+'
           and new.extracted_amount is not null and r.extracted_amount is not null and new.extracted_amount <> r.extracted_amount)
     )
   limit 1;
  if found then
    raise exception 'This bill is already attached to Indent # % (%): same receipt %, nozzle, vehicle and amount. A bill can be used only once.', clash.indent_no, clash.truck_no, clash.part
      using errcode = '23505';
  end if;
  return new;
end $f$;
