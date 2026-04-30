insert into shift_templates (
  id, name, schedule_text, start1, end1, start2, end2, total_hours, applies_to, allowed_areas, active
) values
('11111111-1111-4111-8111-111111111111', 'Mañana corta 5-3', '5am-11am y 1pm-3pm', '05:00', '11:00', '13:00', '15:00', 8, array['normal','fuerte'], array['Caja','Pedidos','Domicilios'], true),
('11111111-1111-4111-8111-111111111112', 'Mañana 5-4', '5am-11am y 1pm-4pm', '05:00', '11:00', '13:00', '16:00', 9, array['normal','fuerte'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111113', 'Mañana larga 5-5', '5am-11am y 1pm-5pm', '05:00', '11:00', '13:00', '17:00', 10, array['normal','fuerte'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111114', 'Base 6-4', '6am-11am y 1pm-4pm', '06:00', '11:00', '13:00', '16:00', 8, array['normal','fuerte','sabado'], array['Caja','Pedidos','Domicilios'], true),
('11111111-1111-4111-8111-111111111115', 'Base 6-5', '6am-11am y 1pm-5pm', '06:00', '11:00', '13:00', '17:00', 9, array['normal','fuerte','sabado'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111116', 'Mañana 6-4', '6am-12m y 2pm-4pm', '06:00', '12:00', '14:00', '16:00', 8, array['normal','sabado','domingo','festivo','fuerte'], array['Caja','Pedidos','Domicilios'], true),
('11111111-1111-4111-8111-111111111117', 'Mañana tarde 6-6', '6am-12m y 2pm-6pm', '06:00', '12:00', '14:00', '18:00', 10, array['normal','fuerte','sabado'], array['Caja','Pedidos','Domicilios'], true),
('11111111-1111-4111-8111-111111111118', 'Partido cierre 6-8', '6am-12m y 4pm-8pm', '06:00', '12:00', '16:00', '20:00', 10, array['normal','fuerte'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111119', 'Partido cierre 6-9', '6am-12m y 4pm-9pm', '06:00', '12:00', '16:00', '21:00', 11, array['normal','fuerte'], array['Caja'], true),
('11111111-1111-4111-8111-111111111120', 'Continuo mañana', '6am-1pm', '06:00', '13:00', null, null, 7, array['sabado','domingo','festivo'], array['Caja','Pedidos','Domicilios'], true),
('11111111-1111-4111-8111-111111111121', 'Doble largo 6-9', '6am-1pm y 3pm-9pm', '06:00', '13:00', '15:00', '21:00', 13, array['fuerte','sabado'], array['Caja'], true),
('11111111-1111-4111-8111-111111111122', 'Tarde 7-9', '7am-1pm y 4pm-9pm', '07:00', '13:00', '16:00', '21:00', 11, array['normal','fuerte','sabado'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111123', 'Tarde pedidos', '8am-1pm y 3pm-9pm', '08:00', '13:00', '15:00', '21:00', 11, array['normal','fuerte'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111124', 'Tarde corta', '8am-1pm y 5pm-9pm', '08:00', '13:00', '17:00', '21:00', 9, array['normal','sabado'], array['Caja','Pedidos'], true),
('11111111-1111-4111-8111-111111111125', 'Continuo tarde', '1pm-9pm', '13:00', '21:00', null, null, 8, array['sabado','domingo','festivo','fuerte'], array['Caja','Pedidos','Domicilios'], true)
on conflict (id) do update set
  name = excluded.name,
  schedule_text = excluded.schedule_text,
  start1 = excluded.start1,
  end1 = excluded.end1,
  start2 = excluded.start2,
  end2 = excluded.end2,
  total_hours = excluded.total_hours,
  applies_to = excluded.applies_to,
  allowed_areas = excluded.allowed_areas,
  active = excluded.active;

insert into employees (
  id, name, primary_area, secondary_areas, employee_type, day_off,
  base_shift_template_id, note, active, normal_hourly_rate, overtime_hourly_rate
) values
('22222222-2222-4222-8222-222222222221', 'Sebastian', 'Caja', array['Pedidos'], 'Rotativo', 'martes', '11111111-1111-4111-8111-111111111114', null, true, 6500, 8500),
('22222222-2222-4222-8222-222222222222', 'Veronica', 'Caja', array[]::text[], 'Rotativo', 'miercoles', '11111111-1111-4111-8111-111111111116', null, true, 6500, 8500),
('22222222-2222-4222-8222-222222222223', 'Leidy', 'Caja', array['Pedidos'], 'Rotativo', 'jueves', '11111111-1111-4111-8111-111111111115', 'Apoya pedidos en pico', true, 6500, 8500),
('22222222-2222-4222-8222-222222222224', 'Camila', 'Caja', array[]::text[], 'Rotativo', 'lunes', '11111111-1111-4111-8111-111111111125', null, true, 6500, 8500),
('22222222-2222-4222-8222-222222222225', 'Kelly', 'Pedidos', array[]::text[], 'Fijo', 'domingo', '11111111-1111-4111-8111-111111111111', null, true, 6200, 8200),
('22222222-2222-4222-8222-222222222226', 'Diana', 'Pedidos', array['Caja'], 'Fijo', 'sabado', '11111111-1111-4111-8111-111111111114', null, true, 6200, 8200),
('22222222-2222-4222-8222-222222222227', 'Don Omar', 'Domicilios', array[]::text[], 'Fijo', 'lunes', '11111111-1111-4111-8111-111111111116', null, true, 6000, 8000),
('22222222-2222-4222-8222-222222222228', 'Jhon', 'Domicilios', array[]::text[], 'Fijo', 'martes', '11111111-1111-4111-8111-111111111117', null, true, 6000, 8000)
on conflict (id) do update set
  name = excluded.name,
  primary_area = excluded.primary_area,
  secondary_areas = excluded.secondary_areas,
  employee_type = excluded.employee_type,
  day_off = excluded.day_off,
  base_shift_template_id = excluded.base_shift_template_id,
  note = excluded.note,
  active = excluded.active,
  normal_hourly_rate = excluded.normal_hourly_rate,
  overtime_hourly_rate = excluded.overtime_hourly_rate;

insert into holidays (id, holiday_date, name, active) values
('33333333-3333-4333-8333-333333333301', '2026-01-01', 'Año Nuevo', true),
('33333333-3333-4333-8333-333333333302', '2026-01-12', 'Día de los Reyes Magos', true),
('33333333-3333-4333-8333-333333333303', '2026-03-23', 'Día de San José', true),
('33333333-3333-4333-8333-333333333304', '2026-04-02', 'Jueves Santo', true),
('33333333-3333-4333-8333-333333333305', '2026-04-03', 'Viernes Santo', true),
('33333333-3333-4333-8333-333333333306', '2026-05-01', 'Día del Trabajo', true),
('33333333-3333-4333-8333-333333333307', '2026-05-18', 'Ascensión del Señor', true),
('33333333-3333-4333-8333-333333333308', '2026-06-08', 'Corpus Christi', true),
('33333333-3333-4333-8333-333333333309', '2026-06-15', 'Sagrado Corazón', true),
('33333333-3333-4333-8333-333333333310', '2026-06-29', 'San Pedro y San Pablo', true),
('33333333-3333-4333-8333-333333333311', '2026-07-20', 'Día de la Independencia', true),
('33333333-3333-4333-8333-333333333312', '2026-08-07', 'Batalla de Boyacá', true),
('33333333-3333-4333-8333-333333333313', '2026-08-17', 'Asunción de la Virgen', true),
('33333333-3333-4333-8333-333333333314', '2026-10-12', 'Día de la Raza', true),
('33333333-3333-4333-8333-333333333315', '2026-11-02', 'Todos los Santos', true),
('33333333-3333-4333-8333-333333333316', '2026-11-16', 'Independencia de Cartagena', true),
('33333333-3333-4333-8333-333333333317', '2026-12-08', 'Inmaculada Concepción', true),
('33333333-3333-4333-8333-333333333318', '2026-12-25', 'Navidad', true)
on conflict (id) do update set
  holiday_date = excluded.holiday_date,
  name = excluded.name,
  active = excluded.active;

insert into payment_settings (
  id, daily_normal_hours, weekly_normal_hours, overtime_alert_hours,
  default_cash_registers, weekend_cash_registers, strong_day_cash_registers
) values (
  '44444444-4444-4444-8444-444444444444',
  10, 46, 7, 3, 3, 4
)
on conflict (id) do update set
  daily_normal_hours = excluded.daily_normal_hours,
  weekly_normal_hours = excluded.weekly_normal_hours,
  overtime_alert_hours = excluded.overtime_alert_hours,
  default_cash_registers = excluded.default_cash_registers,
  weekend_cash_registers = excluded.weekend_cash_registers,
  strong_day_cash_registers = excluded.strong_day_cash_registers;
