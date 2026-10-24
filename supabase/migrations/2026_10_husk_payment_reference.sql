-- Husk payments / loans: dedicated reference (UTR) column, unique when filled so the same bank transaction can't be recorded twice.
alter table mye_husk_payments add column if not exists reference text default '';
alter table mye_husk_loans    add column if not exists reference text default '';
create unique index if not exists mye_husk_payments_reference_uq on mye_husk_payments (upper(reference)) where coalesce(reference,'') <> '';
create unique index if not exists mye_husk_loans_reference_uq    on mye_husk_loans    (upper(reference)) where coalesce(reference,'') <> '';
