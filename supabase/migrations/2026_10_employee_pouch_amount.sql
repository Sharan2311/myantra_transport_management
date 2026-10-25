-- Per-employee party pouch amount (blank/null = use the vehicle override or global default). Owner sets it in Employees > Linked Trucks.
alter table mye_employees add column if not exists pouch_amount numeric;
