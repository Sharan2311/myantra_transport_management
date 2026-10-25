-- Party pouch is held on every party trip; set true when it is included in a payment request (after the first payment).
alter table mye_trips add column if not exists pouch_released boolean default false;
