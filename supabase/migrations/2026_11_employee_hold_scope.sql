-- Employee hold scope: 'party' (default, pouch held on party trips only) or 'all' (his hold amount is held on every
-- new trip of his linked trucks, whatever the order type).
alter table mye_employees add column if not exists hold_scope text default 'party';
