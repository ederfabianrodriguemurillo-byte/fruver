export type Area = "Caja" | "Pedidos" | "Domicilios";

export type EmployeeType = "Fijo" | "Rotativo";

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
  | "caja música"
  | "caja Víctor"
  | "caja pared"
  | "caja del medio";

export interface Employee {
  id: string;
  name: string;
  primaryArea: Area;
  secondaryAreas: Area[];
  type: EmployeeType;
  dayOff: DayKey;
  baseShiftTemplateId: string;
  note?: string;
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
  area: string;
  day: string;
  date: string;
  originalSchedule: string;
  finalSchedule: string;
  normalHours: number;
  automaticOvertime: number;
  manualOvertime: number;
  totalOvertime: number;
  note: string;
  restWarning: string;
}

export interface DayProfile {
  kind: DayKind;
  isStrongSalesDay: boolean;
  holidayName?: string;
}
