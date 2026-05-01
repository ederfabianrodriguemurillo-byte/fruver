export type Area = "Caja" | "Pedidos" | "Domicilios" | "Surtidores" | "Hornos";

export type EmployeeType = "Fijo" | "Rotativo" | "Apoyo";

export type DayKey =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado"
  | "domingo";

export type DayKind = "normal" | "sabado" | "domingo" | "festivo" | "fuerte";

export type CashRegister =
  | "caja musica"
  | "caja Victor"
  | "caja pared"
  | "caja del medio";

export type ExtraPosition = "final" | "antes-descanso" | "personalizado";

export type UnavailabilityType =
  | "Permiso"
  | "Incapacidad"
  | "Vacaciones"
  | "No disponible";

export interface Employee {
  id: string;
  name: string;
  primaryArea: Area;
  secondaryAreas: Area[];
  type: EmployeeType;
  dayOff: DayKey;
  baseShiftTemplateId?: string;
  preferredShiftTemplateId?: string;
  note?: string;
  phone?: string;
  active: boolean;
  normalHourlyRate?: number;
  overtimeHourlyRate?: number;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  scheduleText: string;
  start1: string;
  end1: string;
  start2?: string;
  end2?: string;
  totalHours: number;
  appliesTo: DayKind[];
  allowedAreas: Area[];
  active: boolean;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  active: boolean;
}

export interface EmployeeUnavailability {
  id: string;
  employeeId: string;
  date: string;
  type: UnavailabilityType;
  reason?: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
}

export interface PaymentSettings {
  dailyNormalHours: number;
  weeklyNormalHours: number;
  overtimeAlertHours: number;
  defaultCashRegisters: number;
  weekendCashRegisters: number;
  strongDayCashRegisters: number;
}

export interface ScheduleAssignment {
  id: string;
  scheduleId: string;
  date: string;
  employeeId: string;
  area: Area;
  shiftTemplateId: string;
  cashRegister?: CashRegister;
  note?: string;
  manual: boolean;
  customStart1?: string;
  customEnd1?: string;
  customStart2?: string;
  customEnd2?: string;
  customTotalHours?: number;
  customScheduleText?: string;
  normalHours?: number;
  overtimeHours?: number;
  overtimeManual?: boolean;
  overtimeReason?: string;
  breakMinutes?: number;
  warningMessage?: string;
}

export interface DailySchedule {
  id: string;
  date: string;
  weekStart: string;
  dayKind: DayKind;
  isStrongSalesDay: boolean;
  generatedAt: string;
  assignments: ScheduleAssignment[];
}

export interface AppState {
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  schedules: DailySchedule[];
  holidays: Holiday[];
  paymentSettings: PaymentSettings;
  unavailability: EmployeeUnavailability[];
}

export interface EmployeeReportRow {
  employeeId: string;
  employee: string;
  area: Area;
  normalHours: number;
  overtimeHours: number;
  overtimeHourlyRate: number;
  overtimePay: number;
  warning: boolean;
}

export interface DailyReportRow {
  employeeId: string;
  employeeName: string;
  area: Area;
  day: string;
  date: string;
  dayKind: DayKind;
  originalSchedule: string;
  finalSchedule: string;
  normalHours: number;
  automaticOvertime: number;
  manualOvertime: number;
  totalOvertime: number;
  absence: string;
  note: string;
  restWarning: string;
}

export interface DayProfile {
  kind: DayKind;
  isStrongSalesDay: boolean;
  holidayName?: string;
}

export interface AssignmentMetrics {
  scheduleText: string;
  totalHours: number;
  normalHours: number;
  overtimeHours: number;
  breakMinutes?: number;
  warningMessage?: string;
}
