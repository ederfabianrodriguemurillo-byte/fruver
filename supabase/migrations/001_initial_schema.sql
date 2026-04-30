create extension if not exists pgcrypto;

create table if not exists shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  schedule_text text not null,
  start1 time not null,
  end1 time not null,
  start2 time,
  end2 time,
  total_hours numeric(5, 2) not null check (total_hours >= 0),
  applies_to text[] not null default '{}',
  allowed_areas text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_applies_to_check
    check (applies_to <@ array['normal', 'sabado', 'domingo', 'festivo', 'fuerte']::text[]),
  constraint shift_templates_allowed_areas_check
    check (allowed_areas <@ array['Caja', 'Pedidos', 'Domicilios']::text[])
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_area text not null check (primary_area in ('Caja', 'Pedidos', 'Domicilios')),
  secondary_areas text[] not null default '{}',
  employee_type text not null check (employee_type in ('Fijo', 'Rotativo')),
  day_off text not null check (
    day_off in ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')
  ),
  base_shift_template_id uuid references shift_templates(id) on delete set null,
  note text,
  active boolean not null default true,
  normal_hourly_rate numeric(12, 2),
  overtime_hourly_rate numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_secondary_areas_check
    check (secondary_areas <@ array['Caja', 'Pedidos', 'Domicilios']::text[])
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null unique,
  week_start date not null,
  day_kind text not null check (day_kind in ('normal', 'sabado', 'domingo', 'festivo', 'fuerte')),
  is_strong_sales_day boolean not null default false,
  generated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id) on delete cascade,
  assignment_date date not null,
  employee_id uuid not null references employees(id) on delete restrict,
  area text not null check (area in ('Caja', 'Pedidos', 'Domicilios')),
  shift_template_id uuid not null references shift_templates(id) on delete restrict,
  cash_register text check (
    cash_register is null
    or cash_register in ('caja música', 'caja Víctor', 'caja pared', 'caja del medio')
  ),
  note text,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, employee_id)
);

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists overtime_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  employee_id uuid not null references employees(id) on delete cascade,
  primary_area text not null check (primary_area in ('Caja', 'Pedidos', 'Domicilios')),
  normal_hours numeric(6, 2) not null default 0,
  overtime_hours numeric(6, 2) not null default 0,
  overtime_hourly_rate numeric(12, 2) not null default 0,
  overtime_pay numeric(12, 2) not null default 0,
  generated_at timestamptz not null default now(),
  unique (week_start, employee_id)
);

create table if not exists payment_settings (
  id uuid primary key default gen_random_uuid(),
  daily_normal_hours numeric(5, 2) not null default 10,
  weekly_normal_hours numeric(5, 2) not null default 46,
  overtime_alert_hours numeric(5, 2) not null default 7,
  default_cash_registers integer not null default 3 check (default_cash_registers between 1 and 4),
  weekend_cash_registers integer not null default 3 check (weekend_cash_registers between 1 and 4),
  strong_day_cash_registers integer not null default 4 check (strong_day_cash_registers between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_active_area_idx on employees(active, primary_area);
create index if not exists schedules_week_start_idx on schedules(week_start);
create index if not exists schedule_assignments_date_idx on schedule_assignments(assignment_date);
create index if not exists schedule_assignments_employee_idx on schedule_assignments(employee_id);
create index if not exists overtime_reports_week_idx on overtime_reports(week_start);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_shift_templates_updated_at on shift_templates;
create trigger set_shift_templates_updated_at
before update on shift_templates
for each row execute function set_updated_at();

drop trigger if exists set_employees_updated_at on employees;
create trigger set_employees_updated_at
before update on employees
for each row execute function set_updated_at();

drop trigger if exists set_schedules_updated_at on schedules;
create trigger set_schedules_updated_at
before update on schedules
for each row execute function set_updated_at();

drop trigger if exists set_schedule_assignments_updated_at on schedule_assignments;
create trigger set_schedule_assignments_updated_at
before update on schedule_assignments
for each row execute function set_updated_at();

drop trigger if exists set_holidays_updated_at on holidays;
create trigger set_holidays_updated_at
before update on holidays
for each row execute function set_updated_at();

drop trigger if exists set_payment_settings_updated_at on payment_settings;
create trigger set_payment_settings_updated_at
before update on payment_settings
for each row execute function set_updated_at();
