-- Adds weekly availability and contract type to employees without removing data.

alter table employees
  add column if not exists contract_type text not null default 'Tiempo completo',
  add column if not exists available_days jsonb not null default
    '{"lunes":true,"martes":true,"miercoles":true,"jueves":true,"viernes":true,"sabado":true,"domingo":true}'::jsonb;

alter table employees
  drop constraint if exists employees_contract_type_check;

alter table employees
  add constraint employees_contract_type_check
    check (contract_type in (
      'Tiempo completo',
      'Medio tiempo',
      'Por turnos',
      'Solo fines de semana',
      'Dias especificos'
    ));

update employees
set available_days =
  '{"lunes":true,"martes":true,"miercoles":true,"jueves":true,"viernes":true,"sabado":true,"domingo":true}'::jsonb
where available_days is null;
