import { areas, cashRegisters } from "./seed-data";
import type {
  Area,
  DailySchedule,
  DayKey,
  DayKind,
  DayProfile,
  DailyReportRow,
  Employee,
  EmployeeReportRow,
  Holiday,
  PaymentSettings,
  ScheduleAssignment,
  ShiftTemplate,
} from "./types";

const dayKeys: DayKey[] = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const dayLabels: Record<DayKey, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  domingo: "domingo",
};

const monthLabels = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getDayKey(date: Date): DayKey {
  return dayKeys[date.getDay()];
}

export function getDayLabel(dayKey: DayKey) {
  return dayLabels[dayKey];
}

export function formatLongDate(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${dayLabels[getDayKey(date)]} ${date.getDate()} ${
    monthLabels[date.getMonth()]
  }`;
}

export function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getWeekDates(weekStartKey: string) {
  const start = parseDateKey(weekStartKey);
  return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(start, index)));
}

export function getTomorrowKey() {
  return formatDateKey(addDays(new Date(), 1));
}

export function getTodayKey() {
  return formatDateKey(new Date());
}

export function toWeekStartKey(dateKey: string) {
  return formatDateKey(startOfWeek(parseDateKey(dateKey)));
}

export function calculateShiftHours(
  start1: string,
  end1: string,
  start2?: string,
  end2?: string,
) {
  const first = minutesBetween(start1, end1);
  const second = start2 && end2 ? minutesBetween(start2, end2) : 0;
  return roundHours((first + second) / 60);
}

export function formatTimeAmPm(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  return `${displayHours}${minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : ""}${period}`;
}

export function formatScheduleText(
  start1: string,
  end1: string,
  start2?: string,
  end2?: string,
) {
  const first = `${formatTimeAmPm(start1)}-${formatTimeAmPm(end1)}`;
  if (start2 && end2) {
    return `${first} y ${formatTimeAmPm(start2)}-${formatTimeAmPm(end2)}`;
  }
  return first;
}

export function calculateRestWarning(
  start1: string,
  end1: string,
  start2?: string,
  end2?: string,
): string | null {
  if (!start2 || !end2) {
    return null;
  }
  const restMinutes = minutesBetween(end1, start2);
  if (restMinutes < 120) {
    return `Descanso es menor a 2 horas (${Math.round(restMinutes)} min)`;
  }
  return null;
}

export function applyExtraHours(
  template: ShiftTemplate,
  assignment: ScheduleAssignment,
  amount: number,
  position: "final" | "antes-descanso" | "personalizado",
  customTimes?: { start1: string; end1: string; start2?: string; end2?: string }
) {
  let { start1, end1, start2, end2 } = template;
  
  // Use existing custom times if modifying an already modified shift
  if (assignment.customStart1) start1 = assignment.customStart1;
  if (assignment.customEnd1) end1 = assignment.customEnd1;
  if (assignment.customStart2) start2 = assignment.customStart2;
  if (assignment.customEnd2) end2 = assignment.customEnd2;

  if (position === "personalizado" && customTimes) {
    start1 = customTimes.start1;
    end1 = customTimes.end1;
    start2 = customTimes.start2;
    end2 = customTimes.end2;
  } else if (position === "final") {
    if (start2 && end2) {
      end2 = addHoursToTime(end2, amount);
    } else {
      end1 = addHoursToTime(end1, amount);
    }
  } else if (position === "antes-descanso") {
    if (start2 && end2) {
      end1 = addHoursToTime(end1, amount);
    } else {
      end1 = addHoursToTime(end1, amount);
    }
  }

  const newTotalHours = calculateShiftHours(start1, end1, start2, end2);
  const customScheduleText = formatScheduleText(start1, end1, start2, end2);
  const restWarning = calculateRestWarning(start1, end1, start2, end2);

  return {
    customStart1: start1,
    customEnd1: end1,
    customStart2: start2,
    customEnd2: end2,
    customTotalHours: newTotalHours,
    customScheduleText,
    restWarning,
  };
}

function addHoursToTime(time: string, hours: number) {
  const totalMinutes = parseTime(time) + Math.round(hours * 60);
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, "0")}:${newMinutes.toString().padStart(2, "0")}`;
}

export function getDayProfile(dateKey: string, holidays: Holiday[]): DayProfile {
  const date = parseDateKey(dateKey);
  const holidayName = getHolidayName(date, holidays);
  const isStrongSalesDay = [15, 30, 31].includes(date.getDate());

  if (holidayName) {
    return { kind: "festivo", isStrongSalesDay, holidayName };
  }

  if (date.getDay() === 0) {
    return { kind: "domingo", isStrongSalesDay };
  }

  if (date.getDay() === 6) {
    return { kind: "sabado", isStrongSalesDay };
  }

  return { kind: isStrongSalesDay ? "fuerte" : "normal", isStrongSalesDay };
}

export function getDayKindLabel(profile: DayProfile) {
  const labels: Record<DayKind, string> = {
    normal: "Día normal",
    sabado: "Sábado",
    domingo: "Domingo",
    festivo: "Festivo",
    fuerte: "Día fuerte",
  };

  return profile.holidayName ? `${labels[profile.kind]}: ${profile.holidayName}` : labels[profile.kind];
}

export function generateScheduleForDate({
  dateKey,
  employees,
  shiftTemplates,
  holidays,
  paymentSettings,
}: {
  dateKey: string;
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  holidays: Holiday[];
  paymentSettings: PaymentSettings;
}): DailySchedule {
  const date = parseDateKey(dateKey);
  const dayKey = getDayKey(date);
  const profile = getDayProfile(dateKey, holidays);
  const scheduleId = makeId();
  const usedEmployeeIds = new Set<string>();
  const assignments: ScheduleAssignment[] = [];
  const desiredCashRegisters = getDesiredCashRegisterCount(profile, paymentSettings);

  areas.forEach((area) => {
    let candidates = employees
      .filter((employee) => employee.active)
      .filter((employee) => employee.dayOff !== dayKey)
      .filter((employee) => canWorkArea(employee, area))
      .filter((employee) => !usedEmployeeIds.has(employee.id));

    if (area === "Caja") {
      candidates = rotateEmployees(candidates, dateKey).slice(0, desiredCashRegisters);
    } else {
      candidates = candidates
        .filter((employee) => employee.primaryArea === area)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    candidates.forEach((employee, index) => {
      const template = chooseTemplateForEmployee(
        employee,
        area,
        profile,
        shiftTemplates,
        dateKey,
        index,
      );

      if (!template) {
        return;
      }

      usedEmployeeIds.add(employee.id);
      assignments.push({
        id: makeId(),
        scheduleId,
        date: dateKey,
        employeeId: employee.id,
        area,
        shiftTemplateId: template.id,
        cashRegister: area === "Caja" ? cashRegisters[index] : undefined,
        note: employee.note,
        manual: false,
      });
    });
  });

  return {
    id: scheduleId,
    date: dateKey,
    weekStart: toWeekStartKey(dateKey),
    dayKind: profile.kind,
    isStrongSalesDay: profile.isStrongSalesDay,
    generatedAt: new Date().toISOString(),
    assignments,
  };
}

export function replaceSchedules(
  current: DailySchedule[],
  generated: DailySchedule[],
) {
  const generatedDates = new Set(generated.map((schedule) => schedule.date));
  return [
    ...current.filter((schedule) => !generatedDates.has(schedule.date)),
    ...generated,
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function duplicateWeek({
  sourceWeekStart,
  targetWeekStart,
  schedules,
  holidays,
}: {
  sourceWeekStart: string;
  targetWeekStart: string;
  schedules: DailySchedule[];
  holidays: Holiday[];
}) {
  const sourceDates = getWeekDates(sourceWeekStart);
  const targetDates = getWeekDates(targetWeekStart);

  return sourceDates.flatMap((sourceDate, index) => {
    const source = schedules.find((schedule) => schedule.date === sourceDate);
    if (!source) {
      return [];
    }

    const targetDate = targetDates[index];
    const profile = getDayProfile(targetDate, holidays);
    const scheduleId = makeId();

    return [
      {
        ...source,
        id: scheduleId,
        date: targetDate,
        weekStart: targetWeekStart,
        dayKind: profile.kind,
        isStrongSalesDay: profile.isStrongSalesDay,
        generatedAt: new Date().toISOString(),
        assignments: source.assignments.map((assignment) => ({
          ...assignment,
          id: makeId(),
          scheduleId,
          date: targetDate,
          manual: true,
        })),
      },
    ];
  });
}

export function calculateWeeklyReport({
  weekStart,
  schedules,
  employees,
  shiftTemplates,
  paymentSettings,
}: {
  weekStart: string;
  schedules: DailySchedule[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  paymentSettings: PaymentSettings;
}): EmployeeReportRow[] {
  const weekDates = new Set(getWeekDates(weekStart));
  const totals = new Map<
    string,
    { daily: Map<string, number>; total: number; employee: Employee }
  >();

  schedules
    .filter((schedule) => weekDates.has(schedule.date))
    .forEach((schedule) => {
      schedule.assignments.forEach((assignment) => {
        const employee = employees.find((item) => item.id === assignment.employeeId);
        const template = shiftTemplates.find((item) => item.id === assignment.shiftTemplateId);

        if (!employee || !template) {
          return;
        }

        const hours = assignment.customTotalHours ?? template.totalHours;
        const current = totals.get(employee.id) ?? {
          daily: new Map<string, number>(),
          total: 0,
          employee,
        };

        current.total += hours;
        current.daily.set(
          schedule.date,
          (current.daily.get(schedule.date) ?? 0) + hours,
        );
        totals.set(employee.id, current);
      });
    });

  return Array.from(totals.values())
    .map(({ employee, daily, total }) => {
      const dailyOvertime = Array.from(daily.values()).reduce(
        (sum, hours) => sum + Math.max(0, hours - paymentSettings.dailyNormalHours),
        0,
      );
      const weeklyOvertime = Math.max(0, total - paymentSettings.weeklyNormalHours);
      const overtimeHours = roundHours(Math.max(dailyOvertime, weeklyOvertime));
      const normalHours = roundHours(Math.max(0, total - overtimeHours));
      const overtimeHourlyRate = employee.overtimeHourlyRate ?? 0;

      return {
        employeeId: employee.id,
        employee: employee.name,
        area: employee.primaryArea,
        normalHours,
        overtimeHours,
        overtimeHourlyRate,
        overtimePay: Math.round(overtimeHours * overtimeHourlyRate),
        warning: overtimeHours > paymentSettings.overtimeAlertHours,
      };
    })
    .sort((a, b) => b.overtimeHours - a.overtimeHours || a.employee.localeCompare(b.employee));
}

export function calculateDailyReport({
  weekStart,
  schedules,
  employees,
  shiftTemplates,
}: {
  weekStart: string;
  schedules: DailySchedule[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
}): DailyReportRow[] {
  const weekDates = new Set(getWeekDates(weekStart));
  const rows: DailyReportRow[] = [];

  schedules
    .filter((schedule) => weekDates.has(schedule.date))
    .forEach((schedule) => {
      schedule.assignments.forEach((assignment) => {
        const employee = employees.find((item) => item.id === assignment.employeeId);
        const template = shiftTemplates.find((item) => item.id === assignment.shiftTemplateId);

        if (!employee || !template) {
          return;
        }

        const finalHours = assignment.customTotalHours ?? template.totalHours;
        const manualOvertime = finalHours - template.totalHours;
        // Approximation: if finalHours > 8 it's overtime, but we just report total final vs original
        const normalHours = Math.min(8, finalHours);
        const totalOvertime = Math.max(0, finalHours - 8);
        const automaticOvertime = Math.max(0, totalOvertime - Math.max(0, manualOvertime));

        let warningStr = "";
        if (assignment.customTotalHours) {
          const warn = calculateRestWarning(
            assignment.customStart1 ?? template.start1,
            assignment.customEnd1 ?? template.end1,
            assignment.customStart2 ?? template.start2,
            assignment.customEnd2 ?? template.end2
          );
          if (warn) warningStr = warn;
        }

        rows.push({
          employeeId: employee.id,
          employeeName: employee.name,
          area: assignment.area,
          day: getDayLabel(getDayKey(parseDateKey(schedule.date))),
          date: schedule.date,
          originalSchedule: template.scheduleText,
          finalSchedule: assignment.customScheduleText ?? template.scheduleText,
          normalHours: roundHours(normalHours),
          automaticOvertime: roundHours(automaticOvertime),
          manualOvertime: roundHours(Math.max(0, manualOvertime)),
          totalOvertime: roundHours(totalOvertime),
          note: assignment.note ?? "",
          restWarning: warningStr,
        });
      });
    });

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
}

export function generateWhatsAppMessage({
  dateKey,
  schedule,
  employees,
  shiftTemplates,
}: {
  dateKey: string;
  schedule?: DailySchedule;
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
}) {
  const tomorrowKey = getTomorrowKey();
  const lines: string[] = [
    "Buenas tardes.",
    `Turnos para ${dateKey === tomorrowKey ? "mañana " : ""}${formatLongDate(dateKey)}:`,
    "",
  ];

  areas.forEach((area) => {
    const areaAssignments =
      schedule?.assignments.filter((assignment) => assignment.area === area) ?? [];

    if (areaAssignments.length === 0) {
      return;
    }

    lines.push(`- ${area}`, "");
    const grouped = groupAssignmentsByTemplate(areaAssignments, shiftTemplates);

    grouped.forEach(([scheduleText, assignments]) => {
      lines.push(scheduleText);
      assignments.forEach((assignment) => {
        const employee = employees.find((item) => item.id === assignment.employeeId);
        if (!employee) {
          return;
        }

        const cashRegisterNote =
          assignment.area === "Caja" && assignment.cashRegister
            ? ` (${assignment.cashRegister})`
            : "";
        lines.push(`${employee.name}${cashRegisterNote}`);
      });
      lines.push("");
    });
  });

  const restDay = getDayKey(parseDateKey(dateKey));
  const restingEmployees = employees
    .filter((employee) => employee.active && employee.dayOff === restDay)
    .sort((a, b) => a.name.localeCompare(b.name));

  lines.push("- Descanso");
  restingEmployees.forEach((employee) => lines.push(employee.name));

  return lines.join("\n").trimEnd();
}

export function getScheduleWarnings({
  weekStart,
  schedules,
  employees,
  shiftTemplates,
  paymentSettings,
}: {
  weekStart: string;
  schedules: DailySchedule[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  paymentSettings: PaymentSettings;
}) {
  return calculateWeeklyReport({
    weekStart,
    schedules,
    employees,
    shiftTemplates,
    paymentSettings,
  }).filter((row) => row.warning);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatHours(value: number) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function minutesBetween(start: string, end: string) {
  const startMinutes = parseTime(start);
  let endMinutes = parseTime(end);

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

function getDesiredCashRegisterCount(
  profile: DayProfile,
  settings: PaymentSettings,
) {
  if (profile.isStrongSalesDay) {
    return settings.strongDayCashRegisters;
  }

  if (profile.kind === "sabado" || profile.kind === "domingo" || profile.kind === "festivo") {
    return settings.weekendCashRegisters;
  }

  return settings.defaultCashRegisters;
}

function canWorkArea(employee: Employee, area: Area) {
  return employee.primaryArea === area || employee.secondaryAreas.includes(area);
}

function chooseTemplateForEmployee(
  employee: Employee,
  area: Area,
  profile: DayProfile,
  templates: ShiftTemplate[],
  dateKey: string,
  index: number,
) {
  const candidates = templates
    .filter((template) => templateMatches(template, area, profile))
    .sort((a, b) => templateScore(b, profile, area) - templateScore(a, profile, area));

  const baseTemplate = templates.find((template) => template.id === employee.baseShiftTemplateId);

  if (
    employee.type === "Fijo" &&
    baseTemplate &&
    templateMatches(baseTemplate, area, profile)
  ) {
    return baseTemplate;
  }

  if (candidates.length === 0) {
    return baseTemplate?.active && baseTemplate.allowedAreas.includes(area)
      ? baseTemplate
      : undefined;
  }

  if (employee.type === "Rotativo" || area === "Caja") {
    const rotationSeed = getRotationSeed(dateKey) + index + employee.name.length;
    return candidates[rotationSeed % candidates.length];
  }

  return candidates[0];
}

function templateMatches(template: ShiftTemplate, area: Area, profile: DayProfile) {
  if (!template.active || !template.allowedAreas.includes(area)) {
    return false;
  }

  if (template.appliesTo.includes(profile.kind)) {
    return true;
  }

  if (profile.kind === "festivo" && template.appliesTo.includes("domingo")) {
    return true;
  }

  if (profile.kind === "fuerte" && template.appliesTo.includes("normal")) {
    return true;
  }

  return false;
}

function templateScore(template: ShiftTemplate, profile: DayProfile, area: Area) {
  let score = 0;

  if (template.appliesTo.includes(profile.kind)) {
    score += 5;
  }

  if (profile.isStrongSalesDay && template.appliesTo.includes("fuerte")) {
    score += area === "Caja" ? 8 : 3;
  }

  if (
    ["sabado", "domingo", "festivo"].includes(profile.kind) &&
    template.start2 === undefined
  ) {
    score += 4;
  }

  if (template.totalHours <= 10) {
    score += 2;
  }

  return score;
}

function rotateEmployees(employees: Employee[], dateKey: string) {
  if (employees.length === 0) {
    return [];
  }

  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name));
  const rotation = getRotationSeed(dateKey) % sorted.length;
  return [...sorted.slice(rotation), ...sorted.slice(0, rotation)];
}

function getRotationSeed(dateKey: string) {
  const weekStart = parseDateKey(toWeekStartKey(dateKey));
  const yearStart = new Date(weekStart.getFullYear(), 0, 1);
  return Math.floor((weekStart.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function groupAssignmentsByTemplate(
  assignments: ScheduleAssignment[],
  shiftTemplates: ShiftTemplate[],
) {
  const groups = new Map<string, ScheduleAssignment[]>();

  assignments.forEach((assignment) => {
    const template = shiftTemplates.find((item) => item.id === assignment.shiftTemplateId);
    const key = assignment.customScheduleText ?? template?.scheduleText ?? "Sin horario";
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
  });

  return Array.from(groups.entries());
}

function getHolidayName(date: Date, holidays: Holiday[]) {
  const dateKey = formatDateKey(date);
  const localHoliday = holidays.find(
    (holiday) => holiday.active && holiday.date === dateKey,
  );

  if (localHoliday) {
    return localHoliday.name;
  }

  return getCalculatedColombianHolidays(date.getFullYear()).get(dateKey);
}

function getCalculatedColombianHolidays(year: number) {
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => holidays.set(formatDateKey(date), name);
  const fixed = (month: number, day: number) => new Date(year, month - 1, day);

  add(fixed(1, 1), "Año Nuevo");
  add(moveToMonday(fixed(1, 6)), "Día de los Reyes Magos");
  add(moveToMonday(fixed(3, 19)), "Día de San José");
  add(fixed(5, 1), "Día del Trabajo");
  add(moveToMonday(fixed(6, 29)), "San Pedro y San Pablo");
  add(fixed(7, 20), "Día de la Independencia");
  add(fixed(8, 7), "Batalla de Boyacá");
  add(moveToMonday(fixed(8, 15)), "Asunción de la Virgen");
  add(moveToMonday(fixed(10, 12)), "Día de la Raza");
  add(moveToMonday(fixed(11, 1)), "Todos los Santos");
  add(moveToMonday(fixed(11, 11)), "Independencia de Cartagena");
  add(fixed(12, 8), "Inmaculada Concepción");
  add(fixed(12, 25), "Navidad");

  const easter = getEasterDate(year);
  add(addDays(easter, -3), "Jueves Santo");
  add(addDays(easter, -2), "Viernes Santo");
  add(moveToMonday(addDays(easter, 39)), "Ascensión del Señor");
  add(moveToMonday(addDays(easter, 60)), "Corpus Christi");
  add(moveToMonday(addDays(easter, 68)), "Sagrado Corazón");

  return holidays;
}

function moveToMonday(date: Date) {
  const day = date.getDay();
  const offset = day === 1 ? 0 : (8 - day) % 7;
  return addDays(date, offset);
}

function getEasterDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
