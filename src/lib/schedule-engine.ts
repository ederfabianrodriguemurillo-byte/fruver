import { areas, cashRegisters } from "./seed-data";
import type {
  Area,
  AssignmentMetrics,
  DailyReportRow,
  DailySchedule,
  DayKey,
  DayKind,
  DayProfile,
  Employee,
  EmployeeReportRow,
  EmployeeUnavailability,
  ExtraPosition,
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
  miercoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sabado",
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
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
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
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getWeekDates(weekStartKey: string) {
  const start = parseDateKey(weekStartKey);
  return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(start, index)));
}

export function getTodayKey() {
  return formatDateKey(new Date());
}

export function getTomorrowKey() {
  return formatDateKey(addDays(new Date(), 1));
}

export function toWeekStartKey(dateKey: string) {
  return formatDateKey(startOfWeek(parseDateKey(dateKey)));
}

export function formatTimeAmPm(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "pm" : "am";
  const displayHours = hours % 12 || 12;
  if (hours === 12 && minutes === 0) {
    return "12m";
  }
  return `${displayHours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${period}`;
}

export function formatScheduleText(
  start1: string,
  end1: string,
  start2?: string,
  end2?: string,
) {
  const first = `${formatTimeAmPm(start1)}-${formatTimeAmPm(end1)}`;
  return start2 && end2
    ? `${first} y ${formatTimeAmPm(start2)}-${formatTimeAmPm(end2)}`
    : first;
}

export function calculateShiftHours(
  start1: string,
  end1: string,
  start2?: string,
  end2?: string,
) {
  return roundHours((minutesBetween(start1, end1) + (start2 && end2 ? minutesBetween(start2, end2) : 0)) / 60);
}

export function getBreakMinutes(
  _start1: string,
  end1: string,
  start2?: string,
  end2?: string,
) {
  void end2;
  if (!start2) {
    return undefined;
  }
  return minutesBetween(end1, start2);
}

export function getAssignmentTimes(
  assignment: ScheduleAssignment,
  template?: ShiftTemplate,
) {
  return {
    start1: assignment.customStart1 ?? template?.start1 ?? "06:00",
    end1: assignment.customEnd1 ?? template?.end1 ?? "12:00",
    start2: assignment.customStart2 ?? template?.start2,
    end2: assignment.customEnd2 ?? template?.end2,
  };
}

export function buildAssignmentMetrics({
  assignment,
  template,
  paymentSettings,
}: {
  assignment: ScheduleAssignment;
  template?: ShiftTemplate;
  paymentSettings: PaymentSettings;
}): AssignmentMetrics {
  const times = getAssignmentTimes(assignment, template);
  const totalHours = calculateShiftHours(
    times.start1,
    times.end1,
    times.start2,
    times.end2,
  );
  const breakMinutes = getBreakMinutes(
    times.start1,
    times.end1,
    times.start2,
    times.end2,
  );
  const warningMessage =
    breakMinutes !== undefined && breakMinutes < 120
      ? `Advertencia: este cambio deja solo ${roundHours(breakMinutes / 60)} hora(s) de descanso. Lo recomendado es minimo 2 horas.`
      : undefined;
  const overtimeHours = Math.max(0, totalHours - paymentSettings.dailyNormalHours);

  return {
    scheduleText: formatScheduleText(times.start1, times.end1, times.start2, times.end2),
    totalHours,
    normalHours: roundHours(totalHours - overtimeHours),
    overtimeHours: roundHours(overtimeHours),
    breakMinutes,
    warningMessage,
  };
}

export function hydrateAssignmentMetrics(
  assignment: ScheduleAssignment,
  template: ShiftTemplate | undefined,
  paymentSettings: PaymentSettings,
): ScheduleAssignment {
  const metrics = buildAssignmentMetrics({ assignment, template, paymentSettings });
  return {
    ...assignment,
    customTotalHours: metrics.totalHours,
    customScheduleText: metrics.scheduleText,
    normalHours: metrics.normalHours,
    overtimeHours: metrics.overtimeHours,
    breakMinutes: metrics.breakMinutes,
    warningMessage: metrics.warningMessage,
  };
}

export function applyExtraHours({
  assignment,
  template,
  amount,
  position,
  paymentSettings,
  customTimes,
  reason,
}: {
  assignment: ScheduleAssignment;
  template: ShiftTemplate;
  amount: number;
  position: ExtraPosition;
  paymentSettings: PaymentSettings;
  customTimes?: { start1: string; end1: string; start2?: string; end2?: string };
  reason?: string;
}) {
  let times: { start1: string; end1: string; start2?: string; end2?: string } =
    getAssignmentTimes(assignment, template);

  if (position === "personalizado" && customTimes) {
    times = customTimes;
  } else if (position === "final") {
    if (times.start2 && times.end2) {
      times.end2 = addHoursToTime(times.end2, amount);
    } else {
      times.end1 = addHoursToTime(times.end1, amount);
    }
  } else if (position === "antes-descanso") {
    times.end1 = addHoursToTime(times.end1, amount);
  }

  return hydrateAssignmentMetrics(
    {
      ...assignment,
      customStart1: times.start1,
      customEnd1: times.end1,
      customStart2: times.start2,
      customEnd2: times.end2,
      overtimeManual: true,
      overtimeReason: reason,
      note: reason || assignment.note,
      manual: true,
    },
    template,
    paymentSettings,
  );
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
    normal: "Dia normal",
    sabado: "Sabado",
    domingo: "Domingo",
    festivo: "Festivo",
    fuerte: "Dia fuerte",
  };
  return profile.holidayName ? `${labels[profile.kind]}: ${profile.holidayName}` : labels[profile.kind];
}

export function generateScheduleForDate({
  dateKey,
  employees,
  shiftTemplates,
  holidays,
  paymentSettings,
  schedules,
  unavailability,
}: {
  dateKey: string;
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  holidays: Holiday[];
  paymentSettings: PaymentSettings;
  schedules?: DailySchedule[];
  unavailability?: EmployeeUnavailability[];
}): DailySchedule {
  const profile = getDayProfile(dateKey, holidays);
  const dayKey = getDayKey(parseDateKey(dateKey));
  const scheduleId = makeId();
  const desiredCashRegisters = getDesiredCashRegisterCount(profile, paymentSettings);
  const assignments: ScheduleAssignment[] = [];
  const usedEmployees = new Set<string>();

  areas.forEach((area) => {
    const desiredCount = area === "Caja" ? desiredCashRegisters : area === "Pedidos" ? 2 : 1;
    const templates = shiftTemplates
      .filter((template) => templateMatches(template, area, profile))
      .sort((a, b) => templateWeight(a, profile) - templateWeight(b, profile));

    if (!templates.length) {
      return;
    }

    for (let slot = 0; slot < desiredCount; slot += 1) {
      const template = templates[slot % templates.length];
      const employee = employees
        .filter((item) => item.active)
        .filter((item) => !usedEmployees.has(item.id))
        .filter((item) => canWorkArea(item, area))
        .map((item) => ({
          employee: item,
          score: scoreEmployeeForShift(item, template, dateKey, {
            schedules: schedules ?? [],
            unavailability: unavailability ?? [],
            paymentSettings,
            dayKey,
            area,
          }),
        }))
        .filter((item) => item.score < 9000)
        .sort((a, b) => a.score - b.score || a.employee.name.localeCompare(b.employee.name))[0]
        ?.employee;

      if (!employee) {
        continue;
      }

      usedEmployees.add(employee.id);
      const assignment = hydrateAssignmentMetrics(
        {
          id: makeId(),
          scheduleId,
          date: dateKey,
          employeeId: employee.id,
          area,
          shiftTemplateId: template.id,
          cashRegister: area === "Caja" ? cashRegisters[slot] : undefined,
          note: employee.note,
          manual: false,
        },
        template,
        paymentSettings,
      );
      assignments.push(assignment);
    }
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

export function generateSmartSchedule({
  dateKeys,
  employees,
  shiftTemplates,
  holidays,
  paymentSettings,
  schedules = [],
  unavailability = [],
}: {
  dateKeys: string[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  holidays: Holiday[];
  paymentSettings: PaymentSettings;
  schedules?: DailySchedule[];
  unavailability?: EmployeeUnavailability[];
}) {
  let history = schedules;

  return dateKeys.map((dateKey) => {
    const proposal = generateScheduleForDate({
      dateKey,
      employees,
      shiftTemplates,
      holidays,
      paymentSettings,
      schedules: history,
      unavailability,
    });
    history = replaceSchedules(history, [proposal]);
    return proposal;
  });
}

export function scoreEmployeeForShift(
  employee: Employee,
  shift: ShiftTemplate,
  dateKey: string,
  context: {
    schedules: DailySchedule[];
    unavailability: EmployeeUnavailability[];
    paymentSettings: PaymentSettings;
    dayKey: DayKey;
    area: Area;
  },
) {
  if (!employee.active) return 10000;
  if (employee.dayOff === context.dayKey) return 9500;
  if (hasAllDayUnavailability(employee.id, dateKey, context.unavailability)) return 9000;

  const recentAssignments = context.schedules
    .filter((schedule) => schedule.date < dateKey)
    .flatMap((schedule) =>
      schedule.assignments
        .filter((assignment) => assignment.employeeId === employee.id)
        .map((assignment) => ({ schedule, assignment })),
    )
    .slice(-12);

  const shiftKind = getShiftKind(shift);
  let score = employee.primaryArea === context.area ? 0 : 12;

  if (employee.type === "Apoyo") score += 8;
  if (employee.type === "Fijo" && employee.primaryArea === context.area) score -= 4;
  if (employee.preferredShiftTemplateId === shift.id || employee.baseShiftTemplateId === shift.id) score -= 3;

  recentAssignments.slice(-3).forEach(({ assignment }) => {
    if (assignment.shiftTemplateId === shift.id) score += 9;
  });

  recentAssignments.slice(-5).forEach(({ assignment }) => {
    if (getAssignmentShiftKind(assignment) === shiftKind) score += 4;
  });

  const weekStart = toWeekStartKey(dateKey);
  const weeklyHours = context.schedules
    .filter((schedule) => schedule.weekStart === weekStart)
    .flatMap((schedule) => schedule.assignments)
    .filter((assignment) => assignment.employeeId === employee.id)
    .reduce((sum, assignment) => sum + (assignment.customTotalHours ?? 0), 0);

  if (weeklyHours + shift.totalHours > context.paymentSettings.weeklyNormalHours) {
    score += 12;
  }

  const profile = getDayProfile(dateKey, []);
  if (profile.kind === "domingo" || profile.kind === "festivo") {
    const lastHoliday = recentAssignments
      .filter(({ schedule }) => schedule.dayKind === "domingo" || schedule.dayKind === "festivo")
      .at(-1);
    if (lastHoliday && getAssignmentShiftKind(lastHoliday.assignment) === shiftKind) {
      score += 20;
    }
  }

  if (shift.totalHours > 10) score += 8;
  if (shiftKind === "cierre") score += recentAssignments.filter(({ assignment }) => getAssignmentShiftKind(assignment) === "cierre").length * 3;

  return score;
}

export function replaceSchedules(current: DailySchedule[], generated: DailySchedule[]) {
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
    if (!source) return [];
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
  paymentSettings,
}: {
  weekStart: string;
  schedules: DailySchedule[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  paymentSettings: PaymentSettings;
}): EmployeeReportRow[] {
  const weekDates = new Set(getWeekDates(weekStart));
  const totals = new Map<string, { employee: Employee; normal: number; overtime: number }>();

  schedules
    .filter((schedule) => weekDates.has(schedule.date))
    .flatMap((schedule) => schedule.assignments)
    .forEach((assignment) => {
      const employee = employees.find((item) => item.id === assignment.employeeId);
      if (!employee) return;
      const current = totals.get(employee.id) ?? { employee, normal: 0, overtime: 0 };
      current.normal += assignment.normalHours ?? Math.min(paymentSettings.dailyNormalHours, assignment.customTotalHours ?? 0);
      current.overtime += assignment.overtimeHours ?? Math.max(0, (assignment.customTotalHours ?? 0) - paymentSettings.dailyNormalHours);
      totals.set(employee.id, current);
    });

  return Array.from(totals.values())
    .map(({ employee, normal, overtime }) => ({
      employeeId: employee.id,
      employee: employee.name,
      area: employee.primaryArea,
      normalHours: roundHours(normal),
      overtimeHours: roundHours(overtime),
      overtimeHourlyRate: employee.overtimeHourlyRate ?? 0,
      overtimePay: Math.round(overtime * (employee.overtimeHourlyRate ?? 0)),
      warning: overtime > paymentSettings.overtimeAlertHours,
    }))
    .sort((a, b) => b.overtimeHours - a.overtimeHours || a.employee.localeCompare(b.employee));
}

export function calculateDailyReport({
  weekStart,
  schedules,
  employees,
  shiftTemplates,
  unavailability = [],
}: {
  weekStart: string;
  schedules: DailySchedule[];
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  unavailability?: EmployeeUnavailability[];
}): DailyReportRow[] {
  const weekDates = new Set(getWeekDates(weekStart));
  const rows: DailyReportRow[] = [];

  schedules
    .filter((schedule) => weekDates.has(schedule.date))
    .forEach((schedule) => {
      schedule.assignments.forEach((assignment) => {
        const employee = employees.find((item) => item.id === assignment.employeeId);
        const template = shiftTemplates.find((item) => item.id === assignment.shiftTemplateId);
        if (!employee || !template) return;

        rows.push({
          employeeId: employee.id,
          employeeName: employee.name,
          area: assignment.area,
          day: getDayLabel(getDayKey(parseDateKey(schedule.date))),
          date: schedule.date,
          dayKind: schedule.dayKind,
          originalSchedule: template.scheduleText,
          finalSchedule: assignment.customScheduleText ?? template.scheduleText,
          normalHours: assignment.normalHours ?? 0,
          automaticOvertime: assignment.overtimeManual ? 0 : assignment.overtimeHours ?? 0,
          manualOvertime: assignment.overtimeManual ? assignment.overtimeHours ?? 0 : 0,
          totalOvertime: assignment.overtimeHours ?? 0,
          absence: "",
          note: assignment.overtimeReason ?? assignment.note ?? "",
          restWarning: assignment.warningMessage ?? "",
        });
      });

      unavailability
        .filter((item) => weekDates.has(item.date) && item.date === schedule.date)
        .forEach((item) => {
          const employee = employees.find((candidate) => candidate.id === item.employeeId);
          if (!employee) return;
          rows.push({
            employeeId: employee.id,
            employeeName: employee.name,
            area: employee.primaryArea,
            day: getDayLabel(getDayKey(parseDateKey(item.date))),
            date: item.date,
            dayKind: schedule.dayKind,
            originalSchedule: "",
            finalSchedule: "",
            normalHours: 0,
            automaticOvertime: 0,
            manualOvertime: 0,
            totalOvertime: 0,
            absence: item.type,
            note: item.reason ?? "",
            restWarning: "",
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
  unavailability = [],
  includeUnavailability = true,
}: {
  dateKey: string;
  schedule?: DailySchedule;
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  unavailability?: EmployeeUnavailability[];
  includeUnavailability?: boolean;
}) {
  const lines = [
    "Buenas tardes.",
    `Turnos para ${dateKey === getTomorrowKey() ? "manana " : ""}${formatLongDate(dateKey)}:`,
    "",
  ];

  areas.forEach((area) => {
    const areaAssignments = schedule?.assignments.filter((assignment) => assignment.area === area) ?? [];
    if (!areaAssignments.length) return;

    lines.push(`- ${area}`, "");
    const groups = new Map<string, ScheduleAssignment[]>();
    areaAssignments.forEach((assignment) => {
      const template = shiftTemplates.find((item) => item.id === assignment.shiftTemplateId);
      const key = assignment.customScheduleText ?? template?.scheduleText ?? "Sin horario";
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    });

    groups.forEach((assignments, text) => {
      lines.push(text);
      assignments.forEach((assignment) => {
        const employee = employees.find((item) => item.id === assignment.employeeId);
        if (!employee) return;
        lines.push(`${employee.name}${assignment.cashRegister ? ` (${assignment.cashRegister})` : ""}`);
      });
      lines.push("");
    });
  });

  const restDay = getDayKey(parseDateKey(dateKey));
  const resting = employees
    .filter((employee) => employee.active && employee.dayOff === restDay)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (resting.length) {
    lines.push("- Descanso");
    resting.forEach((employee) => lines.push(employee.name));
    lines.push("");
  }

  const unavailable = unavailability.filter((item) => item.date === dateKey && item.allDay);
  if (includeUnavailability && unavailable.length) {
    lines.push("- Permiso");
    unavailable.forEach((item) => {
      const employee = employees.find((candidate) => candidate.id === item.employeeId);
      if (employee) lines.push(employee.name);
    });
  }

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
    maximumFractionDigits: 1,
  }).format(value);
}

export function validateTimeRange(start: string, end: string) {
  return parseTime(end) > parseTime(start);
}

function getDesiredCashRegisterCount(profile: DayProfile, settings: PaymentSettings) {
  if (profile.isStrongSalesDay) return settings.strongDayCashRegisters;
  if (profile.kind === "sabado" || profile.kind === "domingo" || profile.kind === "festivo") return settings.weekendCashRegisters;
  return settings.defaultCashRegisters;
}

function templateMatches(template: ShiftTemplate, area: Area, profile: DayProfile) {
  if (!template.active || !template.allowedAreas.includes(area)) return false;
  if (template.appliesTo.includes(profile.kind)) return true;
  if (profile.kind === "festivo" && template.appliesTo.includes("domingo")) return true;
  if (profile.kind === "fuerte" && template.appliesTo.includes("normal")) return true;
  return false;
}

function templateWeight(template: ShiftTemplate, profile: DayProfile) {
  if ((profile.kind === "domingo" || profile.kind === "festivo") && !template.start2) return 0;
  if (profile.kind === "sabado" && !template.start2) return 1;
  return template.totalHours;
}

function canWorkArea(employee: Employee, area: Area) {
  return employee.primaryArea === area || employee.secondaryAreas.includes(area);
}

function hasAllDayUnavailability(employeeId: string, dateKey: string, unavailability: EmployeeUnavailability[]) {
  return unavailability.some((item) => item.employeeId === employeeId && item.date === dateKey && item.allDay);
}

function getShiftKind(shift: ShiftTemplate) {
  const start = parseTime(shift.start1);
  const end = parseTime(shift.end2 ?? shift.end1);
  if (end >= 20 * 60) return "cierre";
  if (start < 8 * 60) return "manana";
  if (start >= 12 * 60) return "tarde";
  return shift.start2 ? "partido" : "manana";
}

function getAssignmentShiftKind(assignment: ScheduleAssignment) {
  const start = parseTime(assignment.customStart1 ?? "06:00");
  const end = parseTime(assignment.customEnd2 ?? assignment.customEnd1 ?? "12:00");
  if (end >= 20 * 60) return "cierre";
  if (start >= 12 * 60) return "tarde";
  if (assignment.customStart2) return "partido";
  return "manana";
}

function getHolidayName(date: Date, holidays: Holiday[]) {
  const key = formatDateKey(date);
  return holidays.find((holiday) => holiday.active && holiday.date === key)?.name ?? getCalculatedColombianHolidays(date.getFullYear()).get(key);
}

function getCalculatedColombianHolidays(year: number) {
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => holidays.set(formatDateKey(date), name);
  const fixed = (month: number, day: number) => new Date(year, month - 1, day);
  add(fixed(1, 1), "Ano Nuevo");
  add(moveToMonday(fixed(1, 6)), "Reyes Magos");
  add(moveToMonday(fixed(3, 19)), "San Jose");
  add(fixed(5, 1), "Dia del Trabajo");
  add(moveToMonday(fixed(6, 29)), "San Pedro y San Pablo");
  add(fixed(7, 20), "Independencia");
  add(fixed(8, 7), "Batalla de Boyaca");
  add(moveToMonday(fixed(8, 15)), "Asuncion de la Virgen");
  add(moveToMonday(fixed(10, 12)), "Dia de la Raza");
  add(moveToMonday(fixed(11, 1)), "Todos los Santos");
  add(moveToMonday(fixed(11, 11)), "Independencia de Cartagena");
  add(fixed(12, 8), "Inmaculada Concepcion");
  add(fixed(12, 25), "Navidad");
  const easter = getEasterDate(year);
  add(addDays(easter, -3), "Jueves Santo");
  add(addDays(easter, -2), "Viernes Santo");
  add(moveToMonday(addDays(easter, 39)), "Ascension del Senor");
  add(moveToMonday(addDays(easter, 60)), "Corpus Christi");
  add(moveToMonday(addDays(easter, 68)), "Sagrado Corazon");
  return holidays;
}

function moveToMonday(date: Date) {
  const day = date.getDay();
  return addDays(date, day === 1 ? 0 : (8 - day) % 7);
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

function minutesBetween(start: string, end: string) {
  const startMinutes = parseTime(start);
  let endMinutes = parseTime(end);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

function parseTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function addHoursToTime(time: string, hours: number) {
  const totalMinutes = parseTime(time) + Math.round(hours * 60);
  return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}
