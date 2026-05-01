-- Migración: crear tabla de permisos y ausencias de empleados
-- Segura: usa IF NOT EXISTS, no borra datos existentes

CREATE TABLE IF NOT EXISTS employee_unavailability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  all_day BOOLEAN DEFAULT true,
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
