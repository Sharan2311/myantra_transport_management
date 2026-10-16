-- Employee-level exemption from the party Return-Pouch deduction (new trips only).
alter table mye_employees add column if not exists pouch_exempt boolean not null default false;
