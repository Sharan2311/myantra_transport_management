-- Owner can flag an older unsettled trip so it still shows in Driver Pay > By Employee.
alter table mye_trips add column if not exists by_emp_include boolean default false;
