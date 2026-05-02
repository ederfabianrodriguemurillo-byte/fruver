-- Enable Supabase Realtime for the tables used by the scheduler.
-- Safe to run more than once.

do $$
declare
  realtime_tables text[] := array[
    'shift_templates',
    'employees',
    'holidays',
    'payment_settings',
    'schedules',
    'schedule_assignments',
    'employee_unavailability'
  ];
  realtime_table text;
begin
  foreach realtime_table in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;
