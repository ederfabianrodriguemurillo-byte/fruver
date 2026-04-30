-- Migration para soportar horas extra personalizadas
ALTER TABLE schedule_assignments
ADD COLUMN IF NOT EXISTS custom_start1 TEXT,
ADD COLUMN IF NOT EXISTS custom_end1 TEXT,
ADD COLUMN IF NOT EXISTS custom_start2 TEXT,
ADD COLUMN IF NOT EXISTS custom_end2 TEXT,
ADD COLUMN IF NOT EXISTS custom_total_hours NUMERIC,
ADD COLUMN IF NOT EXISTS custom_schedule_text TEXT;
