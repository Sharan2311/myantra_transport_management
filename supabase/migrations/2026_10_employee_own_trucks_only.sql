-- Owner-controlled: when true, this employee's login sees only the trucks linked to him on the Vehicles screen.
alter table mye_employees add column if not exists own_trucks_only boolean default false;
