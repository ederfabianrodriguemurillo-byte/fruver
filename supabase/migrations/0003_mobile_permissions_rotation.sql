-- Adds mobile-ready scheduling fields, optional employee preferences, and unavailability.
-- This migration is additive and keeps existing custom_* overtime columns intact.

alter table employees
  add column if not exists phone text,
  add column if not exists preferred_shift_template_id uuid references shift_templates(id) on delete set null;

alter table employees
  drop constraint if exists employees_primary_area_check,
  drop constraint if exists employees_employee_type_check,
  drop constraint if exists employees_secondary_areas_check;

alter table employees
  add constraint employees_primary_area_check
    check (primary_area in ('Caja', 'Pedidos', 'Domicilios', 'Surtidores', 'Hornos')),
  add constraint employees_employee_type_check
    check (employee_type in ('Fijo', 'Rotativo', 'Apoyo')),
  add constraint employees_secondary_areas_check
    check (secondary_areas <@ array['Caja', 'Pedidos', 'Domicilios', 'Surtidores', 'Hornos']::text[]);

update employees
set preferred_shift_template_id = base_shift_template_id
where preferred_shift_template_id is null
  and base_shift_template_id is not null;

alter table shift_templates
  drop constraint if exists shift_templates_allowed_areas_check;

alter table shift_templates
  add constraint shift_templates_allowed_areas_check
    check (allowed_areas <@ array['Caja', 'Pedidos', 'Domicilios', 'Surtidores', 'Hornos']::text[]);

alter table schedule_assignments
  add column if not exists start_time_1 time,
  add column if not exists end_time_1 time,
  add column if not exists start_time_2 time,
  add column if not exists end_time_2 time,
  add column if not exists total_hours numeric(6, 2),
  add column if not exists normal_hours numeric(6, 2),
  add column if not exists overtime_hours numeric(6, 2),
  add column if not exists overtime_manual boolean not null default false,
  add column if not exists overtime_reason text,
  add column if not exists break_minutes integer,
  add column if not exists warning_message text;

alter table schedule_assignments
  drop constraint if exists schedule_assignments_area_check,
  drop constraint if exists schedule_assignments_cash_register_check;

alter table schedule_assignments
  add constraint schedule_assignments_area_check
    check (area in ('Caja', 'Pedidos', 'Domicilios', 'Surtidores', 'Hornos')),
  add constraint schedule_assignments_cash_register_check
    check (
      cash_register is null
      or cash_register in (
        'caja música',
        'caja Víctor',
        'caja pared',
        'caja del medio',
        'caja musica',
        'caja Victor'
      )
    );

create table if not exists employee_unavailability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  type text not null check (type in ('Permiso', 'Incapacidad', 'Vacaciones', 'No disponible')),
  reason text,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  created_at timestamptz not null default now()
);

create index if not exists employee_unavailability_employee_date_idx
  on employee_unavailability(employee_id, date);

create index if not exists employee_unavailability_date_idx
  on employee_unavailability(date);
