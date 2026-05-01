"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Store,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  areas,
  cashRegisters,
  employeesSeed,
  holidaySeed,
  paymentDefaults,
  shiftTemplatesSeed,
  unavailabilitySeed,
} from "@/lib/seed-data";
import {
  applyExtraHours,
  buildAssignmentMetrics,
  calculateDailyReport,
  calculateShiftHours,
  calculateWeeklyReport,
  duplicateWeek,
  formatCurrency,
  formatDateKey,
  formatHours,
  formatLongDate,
  formatScheduleText,
  generateScheduleForDate,
  generateSmartSchedule,
  generateWhatsAppMessage,
  getAssignmentTimes,
  getDayKindLabel,
  getDayKey,
  getDayLabel,
  getDayProfile,
  getScheduleWarnings,
  getTodayKey,
  getTomorrowKey,
  getWeekDates,
  hydrateAssignmentMetrics,
  makeId,
  parseDateKey,
  replaceSchedules,
  startOfWeek,
  toWeekStartKey,
  validateTimeRange,
} from "@/lib/schedule-engine";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  AppState,
  Area,
  CashRegister,
  DailyReportRow,
  DailySchedule,
  DayKey,
  DayKind,
  Employee,
  EmployeeReportRow,
  EmployeeType,
  EmployeeUnavailability,
  ExtraPosition,
  Holiday,
  PaymentSettings,
  ScheduleAssignment,
  ShiftTemplate,
  UnavailabilityType,
} from "@/lib/types";

type Section =
  | "Inicio"
  | "Empleados"
  | "Turnos"
  | "Generar"
  | "WhatsApp"
  | "Reportes"
  | "Configuracion";

type Notice = { kind: "success" | "warning"; message: string } | null;
type ExtraDraft = {
  assignmentId: string;
  amount: number;
  position: ExtraPosition;
  reason: string;
  customStart1: string;
  customEnd1: string;
  customStart2: string;
  customEnd2: string;
  confirmedShortBreak: boolean;
};

const storageKey = "fruver-turnos-state-v2";

const navItems: { label: Section; icon: typeof Store }[] = [
  { label: "Inicio", icon: Store },
  { label: "Empleados", icon: Users },
  { label: "Turnos", icon: Clock3 },
  { label: "Generar", icon: CalendarDays },
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Reportes", icon: BarChart3 },
  { label: "Configuracion", icon: Settings },
];

const dayOptions: { value: DayKey; label: string }[] = [
  { value: "lunes", label: "Lunes" },
  { value: "martes", label: "Martes" },
  { value: "miercoles", label: "Miercoles" },
  { value: "jueves", label: "Jueves" },
  { value: "viernes", label: "Viernes" },
  { value: "sabado", label: "Sabado" },
  { value: "domingo", label: "Domingo" },
];

const dayKindOptions: { value: DayKind; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "sabado", label: "Sabado" },
  { value: "domingo", label: "Domingo" },
  { value: "festivo", label: "Festivo" },
  { value: "fuerte", label: "Dia fuerte" },
];

const employeeTypes: EmployeeType[] = ["Fijo", "Rotativo", "Apoyo"];
const unavailabilityTypes: UnavailabilityType[] = [
  "Permiso",
  "Incapacidad",
  "Vacaciones",
  "No disponible",
];

const initialState: AppState = {
  employees: employeesSeed,
  shiftTemplates: shiftTemplatesSeed,
  schedules: [],
  holidays: holidaySeed,
  paymentSettings: paymentDefaults,
  unavailability: unavailabilitySeed,
};

const emptyEmployee = (): Employee => ({
  id: makeId(),
  name: "",
  primaryArea: "Caja",
  secondaryAreas: [],
  type: "Fijo",
  dayOff: "lunes",
  note: "",
  phone: "",
  active: true,
  overtimeHourlyRate: undefined,
  preferredShiftTemplateId: undefined,
});

const emptyTemplate = (): ShiftTemplate => ({
  id: makeId(),
  name: "",
  scheduleText: "",
  start1: "06:00",
  end1: "13:00",
  totalHours: 7,
  appliesTo: ["normal"],
  allowedAreas: ["Caja"],
  active: true,
});

const emptyUnavailability = (date = getTodayKey()): EmployeeUnavailability => ({
  id: makeId(),
  employeeId: employeesSeed[0]?.id ?? "",
  date,
  type: "Permiso",
  reason: "",
  allDay: true,
});

export function FruverScheduler() {
  const todayKey = getTodayKey();
  const tomorrowKey = getTomorrowKey();
  const currentWeekStart = toWeekStartKey(todayKey);
  const supabaseClient = getSupabaseBrowserClient();

  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeSection, setActiveSection] = useState<Section>("Inicio");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(tomorrowKey);
  const [generationMode, setGenerationMode] = useState<"tomorrow" | "week" | "date">("tomorrow");
  const [generationDate, setGenerationDate] = useState(tomorrowKey);
  const [employeeDraft, setEmployeeDraft] = useState<Employee>(emptyEmployee);
  const [templateDraft, setTemplateDraft] = useState<ShiftTemplate>(emptyTemplate);
  const [unavailabilityDraft, setUnavailabilityDraft] = useState<EmployeeUnavailability>(
    emptyUnavailability(tomorrowKey),
  );
  const [assignmentDraft, setAssignmentDraft] = useState({
    employeeId: employeesSeed[0]?.id ?? "",
    area: "Caja" as Area,
    shiftTemplateId: shiftTemplatesSeed[0]?.id ?? "",
    cashRegister: cashRegisters[0] as CashRegister,
  });
  const [reportWeek, setReportWeek] = useState(currentWeekStart);
  const [compareWeek, setCompareWeek] = useState(() => {
    const previous = parseDateKey(currentWeekStart);
    previous.setDate(previous.getDate() - 7);
    return formatDateKey(startOfWeek(previous));
  });
  const [includePermitsInWhatsApp, setIncludePermitsInWhatsApp] = useState(true);
  const [extraDraft, setExtraDraft] = useState<ExtraDraft | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          setState(normalizeState(JSON.parse(stored) as Partial<AppState>));
        } catch {
          setState(initialState);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [hydrated, state]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const activeEmployees = state.employees.filter((employee) => employee.active);
  const selectedSchedule = state.schedules.find((schedule) => schedule.date === selectedDate);
  const selectedProfile = getDayProfile(selectedDate, state.holidays);
  const selectedWeekStart = toWeekStartKey(selectedDate);
  const selectedWeekDates = getWeekDates(selectedWeekStart);
  const existingWeeks = useMemo(
    () => Array.from(new Set(state.schedules.map((schedule) => schedule.weekStart))).sort((a, b) => b.localeCompare(a)),
    [state.schedules],
  );
  const reportRows = useMemo(
    () =>
      calculateWeeklyReport({
        weekStart: reportWeek,
        schedules: state.schedules,
        employees: state.employees,
        shiftTemplates: state.shiftTemplates,
        paymentSettings: state.paymentSettings,
      }),
    [reportWeek, state.employees, state.paymentSettings, state.schedules, state.shiftTemplates],
  );
  const compareRows = useMemo(
    () =>
      calculateWeeklyReport({
        weekStart: compareWeek,
        schedules: state.schedules,
        employees: state.employees,
        shiftTemplates: state.shiftTemplates,
        paymentSettings: state.paymentSettings,
      }),
    [compareWeek, state.employees, state.paymentSettings, state.schedules, state.shiftTemplates],
  );
  const dailyReportRows = useMemo(
    () =>
      calculateDailyReport({
        weekStart: reportWeek,
        schedules: state.schedules,
        employees: state.employees,
        shiftTemplates: state.shiftTemplates,
        unavailability: state.unavailability,
      }),
    [reportWeek, state.employees, state.schedules, state.shiftTemplates, state.unavailability],
  );
  const currentWarnings = getScheduleWarnings({
    weekStart: reportWeek,
    schedules: state.schedules,
    employees: state.employees,
    shiftTemplates: state.shiftTemplates,
    paymentSettings: state.paymentSettings,
  });
  const whatsappMessage = generateWhatsAppMessage({
    dateKey: selectedDate,
    schedule: selectedSchedule,
    employees: state.employees,
    shiftTemplates: state.shiftTemplates,
    unavailability: state.unavailability,
    includeUnavailability: includePermitsInWhatsApp,
  });

  function showNotice(kind: NonNullable<Notice>["kind"], message: string) {
    setNotice({ kind, message });
  }

  function selectSection(section: Section) {
    setActiveSection(section);
    setMobileMenuOpen(false);
  }

  function handleGenerateSchedules() {
    const dates =
      generationMode === "tomorrow"
        ? [tomorrowKey]
        : generationMode === "date"
          ? [generationDate]
          : getWeekDates(toWeekStartKey(generationDate));

    const generated = dates.map((dateKey) =>
      generateScheduleForDate({
        dateKey,
        employees: state.employees,
        shiftTemplates: state.shiftTemplates,
        holidays: state.holidays,
        paymentSettings: state.paymentSettings,
        schedules: state.schedules,
        unavailability: state.unavailability,
      }),
    );

    setState((current) => ({ ...current, schedules: replaceSchedules(current.schedules, generated) }));
    setSelectedDate(dates[0]);
    setReportWeek(toWeekStartKey(dates[0]));
    selectSection("Generar");
    showNotice("success", "Turnos generados con rotacion inteligente");
  }

  function handleSuggestSmartSchedules() {
    const dates =
      generationMode === "tomorrow"
        ? [tomorrowKey]
        : generationMode === "date"
          ? [generationDate]
          : getWeekDates(toWeekStartKey(generationDate));

    const proposed = generateSmartSchedule({
      dateKeys: dates,
      employees: state.employees,
      shiftTemplates: state.shiftTemplates,
      holidays: state.holidays,
      paymentSettings: state.paymentSettings,
      schedules: state.schedules,
      unavailability: state.unavailability,
    });

    setState((current) => ({
      ...current,
      schedules: replaceSchedules(current.schedules, proposed),
    }));
    setSelectedDate(dates[0]);
    setReportWeek(toWeekStartKey(dates[0]));
    selectSection("Generar");
    showNotice("success", "Propuesta inteligente generada. Puedes editarla antes de usarla.");
  }

  function saveEmployee() {
    if (!employeeDraft.name.trim()) {
      showNotice("warning", "El nombre del empleado es obligatorio");
      return;
    }

    const nextEmployee: Employee = {
      ...employeeDraft,
      name: employeeDraft.name.trim(),
      note: employeeDraft.note?.trim(),
      phone: employeeDraft.phone?.trim(),
      baseShiftTemplateId: employeeDraft.preferredShiftTemplateId || undefined,
    };

    setState((current) => {
      const exists = current.employees.some((employee) => employee.id === nextEmployee.id);
      return {
        ...current,
        employees: exists
          ? current.employees.map((employee) => (employee.id === nextEmployee.id ? nextEmployee : employee))
          : [...current.employees, nextEmployee],
      };
    });
    setEmployeeDraft(emptyEmployee());
    showNotice("success", "Empleado guardado");
  }

  function saveTemplate() {
    if (!templateDraft.name.trim()) {
      showNotice("warning", "El nombre del turno es obligatorio");
      return;
    }
    if (!validateTimeRange(templateDraft.start1, templateDraft.end1)) {
      showNotice("warning", "La salida del bloque 1 debe ser mayor que la entrada");
      return;
    }
    if (templateDraft.start2 && templateDraft.end2 && !validateTimeRange(templateDraft.start2, templateDraft.end2)) {
      showNotice("warning", "La salida del bloque 2 debe ser mayor que la entrada");
      return;
    }
    if (!templateDraft.allowedAreas.length || !templateDraft.appliesTo.length) {
      showNotice("warning", "Selecciona areas y tipos de dia");
      return;
    }

    const start2 = templateDraft.start2 || undefined;
    const end2 = templateDraft.end2 || undefined;
    const totalHours = calculateShiftHours(templateDraft.start1, templateDraft.end1, start2, end2);
    const nextTemplate: ShiftTemplate = {
      ...templateDraft,
      name: templateDraft.name.trim(),
      scheduleText: templateDraft.scheduleText.trim() || formatScheduleText(templateDraft.start1, templateDraft.end1, start2, end2),
      start2,
      end2,
      totalHours,
    };

    setState((current) => {
      const exists = current.shiftTemplates.some((template) => template.id === nextTemplate.id);
      return {
        ...current,
        shiftTemplates: exists
          ? current.shiftTemplates.map((template) => (template.id === nextTemplate.id ? nextTemplate : template))
          : [...current.shiftTemplates, nextTemplate],
      };
    });
    setTemplateDraft(emptyTemplate());
    showNotice("success", "Plantilla guardada");
  }

  function addAssignment() {
    if (!assignmentDraft.employeeId || !assignmentDraft.shiftTemplateId) {
      showNotice("warning", "Selecciona empleado y horario");
      return;
    }

    const employee = state.employees.find((item) => item.id === assignmentDraft.employeeId);
    const dayKey = getDayKey(parseDateKey(selectedDate));
    const hasDayOff = employee?.dayOff === dayKey;
    const hasPermit = state.unavailability.some((item) => item.employeeId === assignmentDraft.employeeId && item.date === selectedDate && item.allDay);

    if (selectedSchedule?.assignments.some((assignment) => assignment.employeeId === assignmentDraft.employeeId)) {
      showNotice("warning", "Ese empleado ya esta asignado ese dia");
      return;
    }
    if (hasPermit && !window.confirm("Este empleado tiene permiso todo el dia. Deseas asignarlo de todas formas?")) {
      return;
    }
    if (hasDayOff && !window.confirm("Este empleado esta en dia de descanso. Deseas asignarlo de todas formas?")) {
      return;
    }

    setState((current) => {
      const schedule = getOrCreateSchedule(selectedDate, current);
      const template = current.shiftTemplates.find((item) => item.id === assignmentDraft.shiftTemplateId);
      const assignment = hydrateAssignmentMetrics(
        {
          id: makeId(),
          scheduleId: schedule.id,
          date: selectedDate,
          employeeId: assignmentDraft.employeeId,
          area: assignmentDraft.area,
          shiftTemplateId: assignmentDraft.shiftTemplateId,
          cashRegister: assignmentDraft.area === "Caja" ? assignmentDraft.cashRegister : undefined,
          manual: true,
        },
        template,
        current.paymentSettings,
      );
      return {
        ...current,
        schedules: replaceSchedules(current.schedules, [{ ...schedule, assignments: [...schedule.assignments, assignment] }]),
      };
    });
    showNotice("success", "Asignacion agregada");
  }

  function updateAssignment(assignmentId: string, patch: Partial<ScheduleAssignment>, confirmWarnings = false) {
    setState((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => {
        if (schedule.date !== selectedDate) return schedule;
        if (
          patch.employeeId &&
          schedule.assignments.some((assignment) => assignment.id !== assignmentId && assignment.employeeId === patch.employeeId)
        ) {
          showNotice("warning", "Ese empleado ya esta asignado ese dia");
          return schedule;
        }

        return {
          ...schedule,
          assignments: schedule.assignments.map((assignment) => {
            if (assignment.id !== assignmentId) return assignment;
            const template = current.shiftTemplates.find((item) => item.id === (patch.shiftTemplateId ?? assignment.shiftTemplateId));
            const updated = hydrateAssignmentMetrics(
              {
                ...assignment,
                ...patch,
                manual: true,
                cashRegister:
                  (patch.area ?? assignment.area) === "Caja"
                    ? patch.cashRegister ?? assignment.cashRegister ?? cashRegisters[0]
                    : undefined,
              },
              template,
              current.paymentSettings,
            );

            if (updated.warningMessage && !confirmWarnings) {
              showNotice("warning", updated.warningMessage);
            }
            return updated;
          }),
        };
      }),
    }));
  }

  function removeAssignment(assignmentId: string) {
    setState((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) =>
        schedule.date === selectedDate
          ? { ...schedule, assignments: schedule.assignments.filter((assignment) => assignment.id !== assignmentId) }
          : schedule,
      ),
    }));
  }

  function saveUnavailability() {
    if (!unavailabilityDraft.employeeId || !unavailabilityDraft.date) {
      showNotice("warning", "Selecciona empleado y fecha");
      return;
    }

    const alreadyAssigned = state.schedules
      .find((schedule) => schedule.date === unavailabilityDraft.date)
      ?.assignments.some((assignment) => assignment.employeeId === unavailabilityDraft.employeeId);

    const shouldRemove =
      alreadyAssigned &&
      unavailabilityDraft.allDay &&
      window.confirm("Este empleado ya tenia turno asignado. Deseas quitarlo del horario?");

    setState((current) => ({
      ...current,
      unavailability: upsertById(current.unavailability, unavailabilityDraft),
      schedules: shouldRemove
        ? current.schedules.map((schedule) =>
            schedule.date === unavailabilityDraft.date
              ? {
                  ...schedule,
                  assignments: schedule.assignments.filter((assignment) => assignment.employeeId !== unavailabilityDraft.employeeId),
                }
              : schedule,
          )
        : current.schedules,
    }));
    setUnavailabilityDraft(emptyUnavailability(selectedDate));
    showNotice("success", "Permiso guardado");
  }

  function applyExtraDraft() {
    if (!extraDraft) return;
    const schedule = selectedSchedule;
    const assignment = schedule?.assignments.find((item) => item.id === extraDraft.assignmentId);
    const template = state.shiftTemplates.find((item) => item.id === assignment?.shiftTemplateId);
    if (!assignment || !template) return;

    const customTimes =
      extraDraft.position === "personalizado"
        ? {
            start1: extraDraft.customStart1,
            end1: extraDraft.customEnd1,
            start2: extraDraft.customStart2 || undefined,
            end2: extraDraft.customEnd2 || undefined,
          }
        : undefined;
    const updated = applyExtraHours({
      assignment,
      template,
      amount: extraDraft.amount,
      position: extraDraft.position,
      paymentSettings: state.paymentSettings,
      customTimes,
      reason: extraDraft.reason,
    });

    if (updated.warningMessage && !extraDraft.confirmedShortBreak) {
      setExtraDraft({ ...extraDraft, confirmedShortBreak: true });
      showNotice("warning", updated.warningMessage);
      return;
    }

    updateAssignment(updated.id, updated, true);
    setExtraDraft(null);
    showNotice("success", "Hora extra aplicada manualmente");
  }

  function duplicateSelectedWeek(sourceWeekStart: string) {
    const targetStart = parseDateKey(sourceWeekStart);
    targetStart.setDate(targetStart.getDate() + 7);
    const targetWeekStart = formatDateKey(startOfWeek(targetStart));
    const duplicated = duplicateWeek({
      sourceWeekStart,
      targetWeekStart,
      schedules: state.schedules,
      holidays: state.holidays,
    });
    if (!duplicated.length) {
      showNotice("warning", "No hay horarios para duplicar");
      return;
    }
    setState((current) => ({ ...current, schedules: replaceSchedules(current.schedules, duplicated) }));
    setSelectedDate(targetWeekStart);
    setReportWeek(targetWeekStart);
    selectSection("Generar");
    showNotice("success", "Semana duplicada");
  }

  async function copyWhatsAppMessage() {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      showNotice("success", "Mensaje copiado");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = whatsappMessage;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showNotice("success", "Mensaje copiado");
    }
  }

  function downloadCsv() {
    triggerDownload(
      `reporte-horas-extra-${reportWeek}.csv`,
      new Blob([dailyRowsToCsv(dailyReportRows)], { type: "text/csv;charset=utf-8" }),
    );
  }

  function downloadExcel() {
    const rows = dailyReportRows.map(dailyReportRowToPlainObject);
    const headers = Object.keys(rows[0] ?? dailyReportRowToPlainObject(emptyDailyReportRow));
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headers
      .map((header) => `<th>${escapeHtml(header)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr>${headers
            .map((header) => `<td>${escapeHtml(String(row[header as keyof typeof row] ?? ""))}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody></table></body></html>`;
    triggerDownload(`reporte-horas-extra-${reportWeek}.xls`, new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  function addHoliday() {
    if (!holidayDraft.date || !holidayDraft.name.trim()) {
      showNotice("warning", "Fecha y nombre del festivo son obligatorios");
      return;
    }
    setState((current) => ({ ...current, holidays: upsertById(current.holidays, { ...holidayDraft, name: holidayDraft.name.trim() }) }));
    setHolidayDraft({ id: makeId(), date: todayKey, name: "", active: true });
    showNotice("success", "Festivo guardado");
  }

  const [holidayDraft, setHolidayDraft] = useState<Holiday>({
    id: makeId(),
    date: todayKey,
    name: "",
    active: true,
  });

  function resetDemoData() {
    setState(initialState);
    setEmployeeDraft(emptyEmployee());
    setTemplateDraft(emptyTemplate());
    setUnavailabilityDraft(emptyUnavailability(selectedDate));
    showNotice("success", "Datos iniciales restaurados");
  }

  async function loadSupabaseData() {
    if (!supabaseClient) {
      showNotice("warning", "Configura Supabase en .env.local");
      return;
    }
    const [templates, employees, holidays, settings, schedules, assignments, unavailable] = await Promise.all([
      supabaseClient.from("shift_templates").select("*").returns<DbShiftTemplate[]>(),
      supabaseClient.from("employees").select("*").returns<DbEmployee[]>(),
      supabaseClient.from("holidays").select("*").returns<DbHoliday[]>(),
      supabaseClient.from("payment_settings").select("*").limit(1).returns<DbPaymentSettings[]>(),
      supabaseClient.from("schedules").select("*").returns<DbSchedule[]>(),
      supabaseClient.from("schedule_assignments").select("*").returns<DbScheduleAssignment[]>(),
      supabaseClient.from("employee_unavailability").select("*").returns<DbUnavailability[]>(),
    ]);
    const error = templates.error ?? employees.error ?? holidays.error ?? settings.error ?? schedules.error ?? assignments.error ?? unavailable.error;
    if (error) {
      showNotice("warning", error.message);
      return;
    }
    const assignmentRows = assignments.data ?? [];
    setState({
      employees: employees.data?.map(dbEmployeeToApp) ?? [],
      shiftTemplates: templates.data?.map(dbTemplateToApp) ?? [],
      holidays: holidays.data?.map(dbHolidayToApp) ?? [],
      paymentSettings: settings.data?.[0] ? dbSettingsToApp(settings.data[0]) : paymentDefaults,
      unavailability: unavailable.data?.map(dbUnavailableToApp) ?? [],
      schedules:
        schedules.data?.map((schedule) => ({
          id: schedule.id,
          date: schedule.schedule_date,
          weekStart: schedule.week_start,
          dayKind: schedule.day_kind,
          isStrongSalesDay: schedule.is_strong_sales_day,
          generatedAt: schedule.generated_at,
          assignments: assignmentRows.filter((assignment) => assignment.schedule_id === schedule.id).map(dbAssignmentToApp),
        })) ?? [],
    });
    showNotice("success", "Datos importados desde Supabase");
  }

  async function saveSupabaseData() {
    if (!supabaseClient) {
      showNotice("warning", "Configura Supabase en .env.local");
      return;
    }
    const results = [
      await supabaseClient.from("shift_templates").upsert(state.shiftTemplates.map(appTemplateToDb)),
      await supabaseClient.from("employees").upsert(state.employees.map(appEmployeeToDb)),
      await supabaseClient.from("holidays").upsert(state.holidays.map(appHolidayToDb)),
      await supabaseClient.from("payment_settings").upsert(appSettingsToDb(state.paymentSettings)),
      await supabaseClient.from("employee_unavailability").upsert(state.unavailability.map(appUnavailableToDb)),
    ];
    if (state.schedules.length) {
      const scheduleIds = state.schedules.map((schedule) => schedule.id);
      results.push(await supabaseClient.from("schedule_assignments").delete().in("schedule_id", scheduleIds));
      results.push(await supabaseClient.from("schedules").upsert(state.schedules.map(appScheduleToDb)));
      const assignmentRows = state.schedules.flatMap((schedule) => schedule.assignments.map(appAssignmentToDb));
      if (assignmentRows.length) {
        results.push(await supabaseClient.from("schedule_assignments").insert(assignmentRows));
      }
    }
    const error = results.find((result) => result.error)?.error;
    if (error) {
      showNotice("warning", error.message);
      return;
    }
    showNotice("success", "Datos guardados en Supabase");
  }

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-stone-950">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#f7f8f3]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button className="flex min-h-11 items-center gap-3 text-left" onClick={() => selectSection("Inicio")}>
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-700 text-white">
              <Store className="size-5" />
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Fruver</span>
              <span className="block text-lg font-bold leading-tight">Turnos</span>
            </span>
          </button>
          <button
            className="ml-auto grid size-11 place-items-center rounded-lg border border-stone-200 bg-white text-stone-800 shadow-sm lg:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <TopNavButton key={item.label} item={item} active={activeSection === item.label} onClick={() => selectSection(item.label)} />
            ))}
          </nav>

          <div className="flex items-center gap-2 pr-14 lg:pr-0">
            <button className={desktopSecondaryButton} onClick={() => selectSection("WhatsApp")}>
              <MessageCircle className="size-4" />
              WhatsApp
            </button>
            <button className={desktopPrimaryButton} onClick={handleGenerateSchedules}>
              <CalendarDays className="size-4" />
              Generar
            </button>
          </div>
        </div>
        {mobileMenuOpen ? (
          <div className="mx-auto mt-3 grid max-w-7xl gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-lg lg:hidden">
            {navItems.map((item) => (
              <TopNavButton key={item.label} item={item} active={activeSection === item.label} onClick={() => selectSection(item.label)} mobile />
            ))}
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4 md:px-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">{formatLongDate(todayKey)}</p>
            <h1 className="text-2xl font-bold tracking-normal md:text-3xl">{activeSection}</h1>
          </div>
          {notice ? (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
            }`}>
              {notice.kind === "success" ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
              {notice.message}
            </div>
          ) : null}
        </div>

        {activeSection === "Inicio" ? (
          <HomeSection
            activeEmployees={activeEmployees.length}
            schedules={state.schedules}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            setActiveSection={selectSection}
            existingWeeks={existingWeeks}
            duplicateSelectedWeek={duplicateSelectedWeek}
            tomorrowKey={tomorrowKey}
            reportRows={reportRows}
            warnings={currentWarnings}
            supabaseReady={Boolean(supabaseClient)}
          />
        ) : null}

        {activeSection === "Empleados" ? (
          <EmployeesSection
            employees={state.employees}
            shiftTemplates={state.shiftTemplates}
            employeeDraft={employeeDraft}
            setEmployeeDraft={setEmployeeDraft}
            saveEmployee={saveEmployee}
            resetDraft={() => setEmployeeDraft(emptyEmployee())}
            setState={setState}
          />
        ) : null}

        {activeSection === "Turnos" ? (
          <TemplatesSection
            templates={state.shiftTemplates}
            templateDraft={templateDraft}
            setTemplateDraft={setTemplateDraft}
            saveTemplate={saveTemplate}
            resetDraft={() => setTemplateDraft(emptyTemplate())}
            setState={setState}
          />
        ) : null}

        {activeSection === "Generar" ? (
          <GenerateSection
            generationMode={generationMode}
            setGenerationMode={setGenerationMode}
            generationDate={generationDate}
            setGenerationDate={setGenerationDate}
            handleGenerateSchedules={handleGenerateSchedules}
            handleSuggestSmartSchedules={handleSuggestSmartSchedules}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedWeekDates={selectedWeekDates}
            selectedProfile={selectedProfile}
            selectedSchedule={selectedSchedule}
            employees={state.employees}
            templates={state.shiftTemplates}
            settings={state.paymentSettings}
            unavailability={state.unavailability}
            assignmentDraft={assignmentDraft}
            setAssignmentDraft={setAssignmentDraft}
            addAssignment={addAssignment}
            updateAssignment={updateAssignment}
            removeAssignment={removeAssignment}
            schedules={state.schedules}
            existingWeeks={existingWeeks}
            duplicateSelectedWeek={duplicateSelectedWeek}
            setExtraDraft={setExtraDraft}
            unavailabilityDraft={unavailabilityDraft}
            setUnavailabilityDraft={setUnavailabilityDraft}
            saveUnavailability={saveUnavailability}
            setState={setState}
          />
        ) : null}

        {activeSection === "WhatsApp" ? (
          <WhatsAppSection
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            message={whatsappMessage}
            copyMessage={copyWhatsAppMessage}
            schedule={selectedSchedule}
            includePermits={includePermitsInWhatsApp}
            setIncludePermits={setIncludePermitsInWhatsApp}
          />
        ) : null}

        {activeSection === "Reportes" ? (
          <ReportsSection
            reportWeek={reportWeek}
            setReportWeek={setReportWeek}
            compareWeek={compareWeek}
            setCompareWeek={setCompareWeek}
            rows={reportRows}
            dailyRows={dailyReportRows}
            compareRows={compareRows}
            downloadCsv={downloadCsv}
            downloadExcel={downloadExcel}
          />
        ) : null}

        {activeSection === "Configuracion" ? (
          <SettingsSection
            settings={state.paymentSettings}
            updatePaymentSettings={(patch) => setState((current) => ({ ...current, paymentSettings: { ...current.paymentSettings, ...patch } }))}
            holidays={state.holidays}
            setState={setState}
            holidayDraft={holidayDraft}
            setHolidayDraft={setHolidayDraft}
            addHoliday={addHoliday}
            resetDemoData={resetDemoData}
            supabaseReady={Boolean(supabaseClient)}
            loadSupabaseData={loadSupabaseData}
            saveSupabaseData={saveSupabaseData}
          />
        ) : null}
      </main>

      {extraDraft ? (
        <ExtraHoursModal
          draft={extraDraft}
          setDraft={setExtraDraft}
          assignment={selectedSchedule?.assignments.find((assignment) => assignment.id === extraDraft.assignmentId)}
          employees={state.employees}
          templates={state.shiftTemplates}
          settings={state.paymentSettings}
          apply={applyExtraDraft}
        />
      ) : null}
    </div>
  );
}

function HomeSection({
  activeEmployees,
  schedules,
  setSelectedDate,
  setActiveSection,
  existingWeeks,
  duplicateSelectedWeek,
  tomorrowKey,
  reportRows,
  warnings,
  supabaseReady,
}: {
  activeEmployees: number;
  schedules: DailySchedule[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setActiveSection: (section: Section) => void;
  existingWeeks: string[];
  duplicateSelectedWeek: (weekStart: string) => void;
  tomorrowKey: string;
  reportRows: EmployeeReportRow[];
  warnings: EmployeeReportRow[];
  supabaseReady: boolean;
}) {
  const totalOvertime = reportRows.reduce((sum, row) => sum + row.overtimeHours, 0);
  const tomorrowSchedule = schedules.find((schedule) => schedule.date === tomorrowKey);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Empleados activos" value={String(activeEmployees)} icon={Users} />
        <MetricCard label="Turnos guardados" value={String(schedules.length)} icon={CalendarDays} />
        <MetricCard label="Horas extra semana" value={formatHours(totalOvertime)} icon={BarChart3} />
        <MetricCard label="Supabase" value={supabaseReady ? "Listo" : "Local"} icon={FileSpreadsheet} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <section className={panelClass}>
          <div className={sectionHeaderClass}>
            <div>
              <p className={eyebrowClass}>Manana</p>
              <h2 className={sectionTitleClass}>{formatLongDate(tomorrowKey)}</h2>
            </div>
            <button className={secondaryButton} onClick={() => { setSelectedDate(tomorrowKey); setActiveSection("Generar"); }}>
              <Pencil className="size-4" />
              Revisar
            </button>
          </div>
          {tomorrowSchedule ? <SchedulePreview schedule={tomorrowSchedule} /> : <EmptyState icon={Clock3} title="Sin turnos para manana" />}
        </section>

        <section className={panelClass}>
          <p className={eyebrowClass}>Alertas</p>
          <h2 className={sectionTitleClass}>Horas extra</h2>
          <div className="mt-4 space-y-2">
            {warnings.length ? warnings.map((row) => (
              <div key={row.employeeId} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-950">{row.employee}</p>
                <p className="text-amber-800">{formatHours(row.overtimeHours)} horas extra esta semana</p>
              </div>
            )) : <p className="text-sm text-stone-500">Sin alertas semanales.</p>}
          </div>
        </section>
      </div>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Historial</p>
            <h2 className={sectionTitleClass}>Semanas generadas</h2>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {existingWeeks.length ? existingWeeks.map((weekStart) => (
            <div key={weekStart} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="font-semibold">Semana {formatLongDate(weekStart)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={secondaryButton} onClick={() => { setSelectedDate(weekStart); setActiveSection("Generar"); }}>Editar</button>
                <button className={secondaryButton} onClick={() => duplicateSelectedWeek(weekStart)}>Duplicar</button>
              </div>
            </div>
          )) : <p className="text-sm text-stone-500">Todavia no hay semanas guardadas.</p>}
        </div>
      </section>
    </div>
  );
}

function EmployeesSection({
  employees,
  shiftTemplates,
  employeeDraft,
  setEmployeeDraft,
  saveEmployee,
  resetDraft,
  setState,
}: {
  employees: Employee[];
  shiftTemplates: ShiftTemplate[];
  employeeDraft: Employee;
  setEmployeeDraft: (employee: Employee) => void;
  saveEmployee: () => void;
  resetDraft: () => void;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>CRUD</p>
            <h2 className={sectionTitleClass}>Empleado</h2>
          </div>
          <button className={secondaryButton} onClick={resetDraft}><Plus className="size-4" />Nuevo</button>
        </div>
        <div className="grid gap-3">
          <Field label="Nombre">
            <input className={inputClass} value={employeeDraft.name} onChange={(event) => setEmployeeDraft({ ...employeeDraft, name: event.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Area principal">
              <select className={inputClass} value={employeeDraft.primaryArea} onChange={(event) => setEmployeeDraft({ ...employeeDraft, primaryArea: event.target.value as Area, secondaryAreas: employeeDraft.secondaryAreas.filter((area) => area !== event.target.value) })}>
                {areas.map((area) => <option key={area}>{area}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select className={inputClass} value={employeeDraft.type} onChange={(event) => setEmployeeDraft({ ...employeeDraft, type: event.target.value as EmployeeType })}>
                {employeeTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Areas secundarias">
            <CheckboxRow options={areas.filter((area) => area !== employeeDraft.primaryArea)} values={employeeDraft.secondaryAreas} onChange={(values) => setEmployeeDraft({ ...employeeDraft, secondaryAreas: values })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Dia de descanso">
              <select className={inputClass} value={employeeDraft.dayOff} onChange={(event) => setEmployeeDraft({ ...employeeDraft, dayOff: event.target.value as DayKey })}>
                {dayOptions.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </Field>
            <Field label="Preferencia de turno opcional">
              <select className={inputClass} value={employeeDraft.preferredShiftTemplateId ?? ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, preferredShiftTemplateId: event.target.value || undefined, baseShiftTemplateId: event.target.value || undefined })}>
                <option value="">Sin preferencia</option>
                {shiftTemplates.map((template) => <option key={template.id} value={template.id}>{template.scheduleText}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefono opcional">
              <input className={inputClass} value={employeeDraft.phone ?? ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, phone: event.target.value })} />
            </Field>
            <Field label="Valor hora extra">
              <input className={inputClass} type="number" min="0" value={employeeDraft.overtimeHourlyRate ?? ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, overtimeHourlyRate: toOptionalNumber(event.target.value) })} />
            </Field>
          </div>
          <Field label="Nota">
            <textarea className={`${inputClass} min-h-20`} value={employeeDraft.note ?? ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, note: event.target.value })} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={employeeDraft.active} onChange={(event) => setEmployeeDraft({ ...employeeDraft, active: event.target.checked })} />
            Activo
          </label>
          <button className={primaryButton} onClick={saveEmployee}><Save className="size-4" />Guardar empleado</button>
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Listado</p>
            <h2 className={sectionTitleClass}>Empleados</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((employee) => (
            <div key={employee.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{employee.name}</p>
                  <p className="text-sm text-stone-500">{employee.primaryArea} · {employee.type} · descanso {getDayLabel(employee.dayOff)}</p>
                  {employee.phone ? <p className="text-sm text-stone-500">{employee.phone}</p> : null}
                </div>
                <div className="flex gap-2">
                  <button className={iconButton} onClick={() => setEmployeeDraft(employee)} aria-label={`Editar ${employee.name}`}><Pencil className="size-4" /></button>
                  <button className={iconButton} onClick={() => setState((current) => ({ ...current, employees: current.employees.map((item) => item.id === employee.id ? { ...item, active: !item.active } : item) }))} aria-label="Cambiar estado"><RefreshCcw className="size-4" /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={employee.active ? tagClass : tagMutedClass}>{employee.active ? "Activo" : "Inactivo"}</span>
                {employee.secondaryAreas.map((area) => <span className={tagMutedClass} key={area}>{area}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TemplatesSection({
  templates,
  templateDraft,
  setTemplateDraft,
  saveTemplate,
  resetDraft,
  setState,
}: {
  templates: ShiftTemplate[];
  templateDraft: ShiftTemplate;
  setTemplateDraft: (template: ShiftTemplate) => void;
  saveTemplate: () => void;
  resetDraft: () => void;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Configuracion</p>
            <h2 className={sectionTitleClass}>Plantilla de horario</h2>
          </div>
          <button className={secondaryButton} onClick={resetDraft}><Plus className="size-4" />Nueva</button>
        </div>
        <div className="grid gap-3">
          <Field label="Nombre del turno"><input className={inputClass} value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></Field>
          <Field label="Horario texto"><input className={inputClass} value={templateDraft.scheduleText} placeholder="Se calcula si lo dejas vacio" onChange={(event) => setTemplateDraft({ ...templateDraft, scheduleText: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Entrada 1"><input className={inputClass} type="time" value={templateDraft.start1} onChange={(event) => setTemplateDraft({ ...templateDraft, start1: event.target.value })} /></Field>
            <Field label="Salida 1"><input className={inputClass} type="time" value={templateDraft.end1} onChange={(event) => setTemplateDraft({ ...templateDraft, end1: event.target.value })} /></Field>
            <Field label="Entrada 2 opcional"><input className={inputClass} type="time" value={templateDraft.start2 ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, start2: event.target.value })} /></Field>
            <Field label="Salida 2 opcional"><input className={inputClass} type="time" value={templateDraft.end2 ?? ""} onChange={(event) => setTemplateDraft({ ...templateDraft, end2: event.target.value })} /></Field>
          </div>
          <Field label="Tipo de dia"><CheckboxRow options={dayKindOptions.map((item) => item.value)} values={templateDraft.appliesTo} labels={Object.fromEntries(dayKindOptions.map((item) => [item.value, item.label]))} onChange={(values) => setTemplateDraft({ ...templateDraft, appliesTo: values })} /></Field>
          <Field label="Areas permitidas"><CheckboxRow options={areas} values={templateDraft.allowedAreas} onChange={(values) => setTemplateDraft({ ...templateDraft, allowedAreas: values })} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={templateDraft.active} onChange={(event) => setTemplateDraft({ ...templateDraft, active: event.target.checked })} />Activo</label>
          <button className={primaryButton} onClick={saveTemplate}><Save className="size-4" />Guardar plantilla</button>
        </div>
      </section>
      <section className={panelClass}>
        <div className="grid gap-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{template.scheduleText}</p>
                  <p className="text-sm text-stone-500">{template.name} · {formatHours(template.totalHours)} h</p>
                </div>
                <div className="flex gap-2">
                  <button className={iconButton} onClick={() => setTemplateDraft(template)} aria-label="Editar plantilla"><Pencil className="size-4" /></button>
                  <button className={iconButton} onClick={() => setState((current) => ({ ...current, shiftTemplates: current.shiftTemplates.map((item) => item.id === template.id ? { ...item, active: !item.active } : item) }))} aria-label="Cambiar estado"><RefreshCcw className="size-4" /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.allowedAreas.map((area) => <span className={tagMutedClass} key={area}>{area}</span>)}
                {template.appliesTo.map((kind) => <span className={tagClass} key={kind}>{kind}</span>)}
                {!template.active ? <span className={tagMutedClass}>Inactivo</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GenerateSection(props: {
  generationMode: "tomorrow" | "week" | "date";
  setGenerationMode: (mode: "tomorrow" | "week" | "date") => void;
  generationDate: string;
  setGenerationDate: (date: string) => void;
  handleGenerateSchedules: () => void;
  handleSuggestSmartSchedules: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedWeekDates: string[];
  selectedProfile: ReturnType<typeof getDayProfile>;
  selectedSchedule?: DailySchedule;
  employees: Employee[];
  templates: ShiftTemplate[];
  settings: PaymentSettings;
  unavailability: EmployeeUnavailability[];
  assignmentDraft: { employeeId: string; area: Area; shiftTemplateId: string; cashRegister: CashRegister };
  setAssignmentDraft: Dispatch<SetStateAction<{ employeeId: string; area: Area; shiftTemplateId: string; cashRegister: CashRegister }>>;
  addAssignment: () => void;
  updateAssignment: (assignmentId: string, patch: Partial<ScheduleAssignment>, confirmWarnings?: boolean) => void;
  removeAssignment: (assignmentId: string) => void;
  schedules: DailySchedule[];
  existingWeeks: string[];
  duplicateSelectedWeek: (weekStart: string) => void;
  setExtraDraft: Dispatch<SetStateAction<ExtraDraft | null>>;
  unavailabilityDraft: EmployeeUnavailability;
  setUnavailabilityDraft: (item: EmployeeUnavailability) => void;
  saveUnavailability: () => void;
  setState: Dispatch<SetStateAction<AppState>>;
}) {
  const templatesForDraft = props.templates.filter((template) => template.active && template.allowedAreas.includes(props.assignmentDraft.area));

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <Field label="Generar">
            <div className="grid grid-cols-3 gap-2">
              {(["tomorrow", "week", "date"] as const).map((mode) => (
                <button key={mode} className={props.generationMode === mode ? segmentedActiveButton : segmentedButton} onClick={() => props.setGenerationMode(mode)}>
                  {mode === "tomorrow" ? "Manana" : mode === "week" ? "Semana" : "Fecha"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fecha"><input className={inputClass} type="date" value={props.generationDate} disabled={props.generationMode === "tomorrow"} onChange={(event) => props.setGenerationDate(event.target.value)} /></Field>
          <button className={secondaryButton} onClick={props.handleGenerateSchedules}><CalendarDays className="size-4" />Generar simple</button>
          <button className={primaryButton} onClick={props.handleSuggestSmartSchedules}><BarChart3 className="size-4" />Sugerir horarios inteligentes</button>
        </div>
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
          La sugerencia usa historial, permisos, descansos, domingos/festivos y carga semanal. Es solo una propuesta: el jefe puede editar todo.
        </p>
      </section>

      <section className={panelClass}>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {props.selectedWeekDates.map((dateKey) => (
            <button key={dateKey} className={`min-w-32 rounded-lg border px-3 py-2 text-left text-sm ${props.selectedDate === dateKey ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-200 bg-white text-stone-700"}`} onClick={() => props.setSelectedDate(dateKey)}>
              <span className="block font-semibold">{formatLongDate(dateKey)}</span>
              <span className="text-xs opacity-80">{props.schedules.some((schedule) => schedule.date === dateKey) ? "Guardado" : "Sin turno"}</span>
            </button>
          ))}
        </div>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>{getDayKindLabel(props.selectedProfile)}</p>
            <h2 className={sectionTitleClass}>{formatLongDate(props.selectedDate)}</h2>
          </div>
          {props.selectedProfile.isStrongSalesDay ? <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Sugerencia: usar 4 cajas</span> : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Empleado"><EmployeeSelect employees={props.employees} value={props.assignmentDraft.employeeId} onChange={(employeeId) => props.setAssignmentDraft((current) => ({ ...current, employeeId }))} /></Field>
          <Field label="Area"><select className={inputClass} value={props.assignmentDraft.area} onChange={(event) => props.setAssignmentDraft((current) => ({ ...current, area: event.target.value as Area, shiftTemplateId: props.templates.find((template) => template.allowedAreas.includes(event.target.value as Area))?.id ?? current.shiftTemplateId }))}>{areas.map((area) => <option key={area}>{area}</option>)}</select></Field>
          <Field label="Horario"><select className={inputClass} value={props.assignmentDraft.shiftTemplateId} onChange={(event) => props.setAssignmentDraft((current) => ({ ...current, shiftTemplateId: event.target.value }))}>{templatesForDraft.map((template) => <option key={template.id} value={template.id}>{template.scheduleText}</option>)}</select></Field>
          <Field label="Caja"><select className={inputClass} value={props.assignmentDraft.cashRegister} disabled={props.assignmentDraft.area !== "Caja"} onChange={(event) => props.setAssignmentDraft((current) => ({ ...current, cashRegister: event.target.value as CashRegister }))}>{cashRegisters.map((cashRegister) => <option key={cashRegister}>{cashRegister}</option>)}</select></Field>
          <button className={secondaryButton} onClick={props.addAssignment}><Plus className="size-4" />Agregar</button>
        </div>

        <div className="mt-5 grid gap-3">
          {props.selectedSchedule?.assignments.length ? props.selectedSchedule.assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              employees={props.employees}
              templates={props.templates}
              settings={props.settings}
              updateAssignment={props.updateAssignment}
              removeAssignment={props.removeAssignment}
              setExtraDraft={props.setExtraDraft}
            />
          )) : <EmptyState icon={Clock3} title="Sin asignaciones para esta fecha" />}
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Permisos y ausencias</p>
            <h2 className={sectionTitleClass}>No disponibilidad</h2>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Empleado"><EmployeeSelect employees={props.employees} value={props.unavailabilityDraft.employeeId} onChange={(employeeId) => props.setUnavailabilityDraft({ ...props.unavailabilityDraft, employeeId })} /></Field>
          <Field label="Fecha"><input className={inputClass} type="date" value={props.unavailabilityDraft.date} onChange={(event) => props.setUnavailabilityDraft({ ...props.unavailabilityDraft, date: event.target.value })} /></Field>
          <Field label="Tipo"><select className={inputClass} value={props.unavailabilityDraft.type} onChange={(event) => props.setUnavailabilityDraft({ ...props.unavailabilityDraft, type: event.target.value as UnavailabilityType })}>{unavailabilityTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
          <Field label="Motivo"><input className={inputClass} value={props.unavailabilityDraft.reason ?? ""} onChange={(event) => props.setUnavailabilityDraft({ ...props.unavailabilityDraft, reason: event.target.value })} /></Field>
          <button className={secondaryButton} onClick={props.saveUnavailability}><UserX className="size-4" />Guardar</button>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={props.unavailabilityDraft.allDay} onChange={(event) => props.setUnavailabilityDraft({ ...props.unavailabilityDraft, allDay: event.target.checked })} />Todo el dia</label>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {props.unavailability.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => {
            const employee = props.employees.find((candidate) => candidate.id === item.employeeId);
            return (
              <div key={item.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{employee?.name ?? "Empleado"}</p>
                    <p className="text-sm text-stone-500">{item.date} · {item.type}</p>
                    {item.reason ? <p className="text-sm text-stone-500">{item.reason}</p> : null}
                  </div>
                  <button className={iconButton} aria-label="Quitar permiso" onClick={() => props.setState((current) => ({ ...current, unavailability: current.unavailability.filter((candidate) => candidate.id !== item.id) }))}><Trash2 className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={panelClass}>
        <p className={eyebrowClass}>Historial</p>
        <h2 className={sectionTitleClass}>Duplicar semana</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {props.existingWeeks.map((weekStart) => <button key={weekStart} className={secondaryButton} onClick={() => props.duplicateSelectedWeek(weekStart)}>{formatLongDate(weekStart)}</button>)}
        </div>
      </section>
    </div>
  );
}

function AssignmentCard({
  assignment,
  employees,
  templates,
  settings,
  updateAssignment,
  removeAssignment,
  setExtraDraft,
}: {
  assignment: ScheduleAssignment;
  employees: Employee[];
  templates: ShiftTemplate[];
  settings: PaymentSettings;
  updateAssignment: (assignmentId: string, patch: Partial<ScheduleAssignment>, confirmWarnings?: boolean) => void;
  removeAssignment: (assignmentId: string) => void;
  setExtraDraft: Dispatch<SetStateAction<ExtraDraft | null>>;
}) {
  const template = templates.find((item) => item.id === assignment.shiftTemplateId);
  const times = getAssignmentTimes(assignment, template);
  const metrics = buildAssignmentMetrics({ assignment, template, paymentSettings: settings });
  const templatesForArea = templates.filter((item) => item.active && item.allowedAreas.includes(assignment.area));

  function patchTimes(patch: Partial<ScheduleAssignment>) {
    const next = { ...assignment, ...patch };
    const nextTemplate = templates.find((item) => item.id === next.shiftTemplateId);
    const nextMetrics = buildAssignmentMetrics({ assignment: next, template: nextTemplate, paymentSettings: settings });
    if (nextMetrics.warningMessage && !window.confirm(`${nextMetrics.warningMessage} Deseas continuar?`)) {
      return;
    }
    updateAssignment(assignment.id, patch, true);
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.8fr_1.2fr_0.8fr_auto] lg:items-end">
        <Field label="Empleado"><EmployeeSelect employees={employees} value={assignment.employeeId} onChange={(employeeId) => updateAssignment(assignment.id, { employeeId })} /></Field>
        <Field label="Area"><select className={inputClass} value={assignment.area} onChange={(event) => updateAssignment(assignment.id, { area: event.target.value as Area })}>{areas.map((area) => <option key={area}>{area}</option>)}</select></Field>
        <Field label="Horario base"><select className={inputClass} value={assignment.shiftTemplateId} onChange={(event) => updateAssignment(assignment.id, { shiftTemplateId: event.target.value, customStart1: undefined, customEnd1: undefined, customStart2: undefined, customEnd2: undefined, overtimeManual: false, overtimeReason: undefined })}>{templatesForArea.map((item) => <option key={item.id} value={item.id}>{item.scheduleText}</option>)}</select></Field>
        <Field label="Caja"><select className={inputClass} value={assignment.cashRegister ?? cashRegisters[0]} disabled={assignment.area !== "Caja"} onChange={(event) => updateAssignment(assignment.id, { cashRegister: event.target.value as CashRegister })}>{cashRegisters.map((cashRegister) => <option key={cashRegister}>{cashRegister}</option>)}</select></Field>
        <button className={dangerButton} onClick={() => removeAssignment(assignment.id)}><Trash2 className="size-4" />Quitar</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Entrada 1"><input className={inputClass} type="time" value={times.start1} onChange={(event) => patchTimes({ customStart1: event.target.value })} /></Field>
        <Field label="Salida 1"><input className={inputClass} type="time" value={times.end1} onChange={(event) => patchTimes({ customEnd1: event.target.value })} /></Field>
        <Field label="Entrada 2"><input className={inputClass} type="time" value={times.start2 ?? ""} onChange={(event) => patchTimes({ customStart2: event.target.value || undefined })} /></Field>
        <Field label="Salida 2"><input className={inputClass} type="time" value={times.end2 ?? ""} onChange={(event) => patchTimes({ customEnd2: event.target.value || undefined })} /></Field>
        <Field label="Nota"><input className={inputClass} value={assignment.note ?? ""} onChange={(event) => updateAssignment(assignment.id, { note: event.target.value })} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={tagClass}>{metrics.scheduleText}</span>
        <span className={tagMutedClass}>Total {formatHours(metrics.totalHours)} h</span>
        <span className={tagMutedClass}>Normales {formatHours(metrics.normalHours)} h</span>
        <span className={assignment.overtimeManual ? tagClass : tagMutedClass}>Extra {formatHours(metrics.overtimeHours)} h</span>
        {metrics.breakMinutes !== undefined ? <span className={metrics.breakMinutes < 120 ? "inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900" : tagMutedClass}>Descanso {formatHours(metrics.breakMinutes / 60)} h</span> : null}
        <button className={secondaryButton} onClick={() => setExtraDraft({
          assignmentId: assignment.id,
          amount: 1,
          position: "final",
          reason: "",
          customStart1: times.start1,
          customEnd1: times.end1,
          customStart2: times.start2 ?? "",
          customEnd2: times.end2 ?? "",
          confirmedShortBreak: false,
        })}><Plus className="size-4" />Agregar hora extra</button>
      </div>
      {metrics.warningMessage ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{metrics.warningMessage}</p> : null}
    </div>
  );
}

function ExtraHoursModal({
  draft,
  setDraft,
  assignment,
  employees,
  templates,
  settings,
  apply,
}: {
  draft: ExtraDraft;
  setDraft: Dispatch<SetStateAction<ExtraDraft | null>>;
  assignment?: ScheduleAssignment;
  employees: Employee[];
  templates: ShiftTemplate[];
  settings: PaymentSettings;
  apply: () => void;
}) {
  const employee = employees.find((item) => item.id === assignment?.employeeId);
  const template = templates.find((item) => item.id === assignment?.shiftTemplateId);
  const previewAssignment = assignment && template
    ? applyExtraHours({
        assignment,
        template,
        amount: draft.amount,
        position: draft.position,
        paymentSettings: settings,
        customTimes: draft.position === "personalizado" ? {
          start1: draft.customStart1,
          end1: draft.customEnd1,
          start2: draft.customStart2 || undefined,
          end2: draft.customEnd2 || undefined,
        } : undefined,
        reason: draft.reason,
      })
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className={eyebrowClass}>Manual</p>
            <h2 className={sectionTitleClass}>Agregar hora extra</h2>
            <p className="text-sm text-stone-500">{employee?.name ?? "Empleado"} · {assignment?.customScheduleText ?? template?.scheduleText}</p>
          </div>
          <button className={iconButton} onClick={() => setDraft(null)} aria-label="Cerrar"><X className="size-4" /></button>
        </div>
        <div className="grid gap-3">
          <Field label="Cantidad de horas"><input className={inputClass} type="number" min="0.5" step="0.5" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: Number(event.target.value) })} /></Field>
          <Field label="Aplicar en">
            <select className={inputClass} value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value as ExtraPosition, confirmedShortBreak: false })}>
              <option value="final">Al final del turno</option>
              <option value="antes-descanso">Antes del descanso / almuerzo</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </Field>
          {draft.position === "personalizado" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Entrada 1"><input className={inputClass} type="time" value={draft.customStart1} onChange={(event) => setDraft({ ...draft, customStart1: event.target.value })} /></Field>
              <Field label="Salida 1"><input className={inputClass} type="time" value={draft.customEnd1} onChange={(event) => setDraft({ ...draft, customEnd1: event.target.value })} /></Field>
              <Field label="Entrada 2"><input className={inputClass} type="time" value={draft.customStart2} onChange={(event) => setDraft({ ...draft, customStart2: event.target.value })} /></Field>
              <Field label="Salida 2"><input className={inputClass} type="time" value={draft.customEnd2} onChange={(event) => setDraft({ ...draft, customEnd2: event.target.value })} /></Field>
            </div>
          ) : null}
          <Field label="Motivo / nota"><input className={inputClass} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></Field>
          {previewAssignment ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
              <p className="font-semibold">Nuevo horario: {previewAssignment.customScheduleText}</p>
              <p>Total {formatHours(previewAssignment.customTotalHours ?? 0)} h · Extra {formatHours(previewAssignment.overtimeHours ?? 0)} h</p>
              {previewAssignment.warningMessage ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">{previewAssignment.warningMessage}</p> : null}
            </div>
          ) : null}
          {previewAssignment?.warningMessage && draft.confirmedShortBreak ? <p className="text-sm font-semibold text-amber-800">Presiona aplicar otra vez para confirmar el descanso corto.</p> : null}
          <button className={primaryButton} onClick={apply}><Save className="size-4" />Aplicar hora extra</button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppSection({
  selectedDate,
  setSelectedDate,
  message,
  copyMessage,
  schedule,
  includePermits,
  setIncludePermits,
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  message: string;
  copyMessage: () => void;
  schedule?: DailySchedule;
  includePermits: boolean;
  setIncludePermits: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.65fr_1.35fr]">
      <section className={panelClass}>
        <p className={eyebrowClass}>Fecha</p>
        <h2 className={sectionTitleClass}>{formatLongDate(selectedDate)}</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Dia"><input className={inputClass} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={includePermits} onChange={(event) => setIncludePermits(event.target.checked)} />Incluir permisos</label>
          <button className={primaryButton} onClick={copyMessage}><Copy className="size-4" />Copiar mensaje</button>
          <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">{schedule?.assignments.length ?? 0} turnos listos para WhatsApp.</p>
        </div>
      </section>
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div><p className={eyebrowClass}>WhatsApp</p><h2 className={sectionTitleClass}>Mensaje limpio</h2></div>
          <Clipboard className="size-5 text-emerald-700" />
        </div>
        <textarea className="min-h-[520px] w-full resize-y rounded-lg border border-stone-200 bg-stone-950 p-4 font-mono text-sm leading-6 text-stone-50 outline-none focus:border-emerald-600" value={message} readOnly />
      </section>
    </div>
  );
}

function ReportsSection({
  reportWeek,
  setReportWeek,
  compareWeek,
  setCompareWeek,
  rows,
  dailyRows,
  compareRows,
  downloadCsv,
  downloadExcel,
}: {
  reportWeek: string;
  setReportWeek: (week: string) => void;
  compareWeek: string;
  setCompareWeek: (week: string) => void;
  rows: EmployeeReportRow[];
  dailyRows: DailyReportRow[];
  compareRows: EmployeeReportRow[];
  downloadCsv: () => void;
  downloadExcel: () => void;
}) {
  const totals = rows.reduce((summary, row) => ({
    normalHours: summary.normalHours + row.normalHours,
    overtimeHours: summary.overtimeHours + row.overtimeHours,
    overtimePay: summary.overtimePay + row.overtimePay,
  }), { normalHours: 0, overtimeHours: 0, overtimePay: 0 });

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <Field label="Semana"><input className={inputClass} type="date" value={reportWeek} onChange={(event) => setReportWeek(toWeekStartKey(event.target.value))} /></Field>
          <Field label="Comparar con"><input className={inputClass} type="date" value={compareWeek} onChange={(event) => setCompareWeek(toWeekStartKey(event.target.value))} /></Field>
          <button className={secondaryButton} onClick={downloadCsv}><Download className="size-4" />CSV</button>
          <button className={primaryButton} onClick={downloadExcel}><FileSpreadsheet className="size-4" />Excel</button>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Horas normales" value={formatHours(totals.normalHours)} icon={Clock3} />
        <MetricCard label="Horas extra" value={formatHours(totals.overtimeHours)} icon={AlertTriangle} />
        <MetricCard label="Pago extra" value={formatCurrency(totals.overtimePay)} icon={BarChart3} />
      </div>
      <section className={panelClass}>
        <p className={eyebrowClass}>Detalle diario</p>
        <h2 className={sectionTitleClass}>Pago semanal de horas extra</h2>
        <div className="mt-4 overflow-x-auto">
          <table className={tableClass}>
            <thead><tr><th>Empleado</th><th>Area</th><th>Dia</th><th>Fecha</th><th>Tipo</th><th>Horario final</th><th>Normales</th><th>Extra manual</th><th>Total extra</th><th>Permiso</th><th>Nota</th><th>Advertencia</th></tr></thead>
            <tbody>
              {dailyRows.length ? dailyRows.map((row, index) => (
                <tr key={`${row.employeeId}-${row.date}-${index}`}>
                  <td className="font-semibold">{row.employeeName}</td>
                  <td>{row.area}</td>
                  <td>{row.day}</td>
                  <td>{row.date}</td>
                  <td>{row.dayKind}</td>
                  <td>{row.finalSchedule}</td>
                  <td>{formatHours(row.normalHours)}</td>
                  <td>{formatHours(row.manualOvertime)}</td>
                  <td>{formatHours(row.totalOvertime)}</td>
                  <td>{row.absence}</td>
                  <td>{row.note}</td>
                  <td>{row.restWarning}</td>
                </tr>
              )) : <tr><td colSpan={12} className="text-center text-stone-500">Sin datos para esta semana</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className={panelClass}>
        <p className={eyebrowClass}>Comparacion</p>
        <h2 className={sectionTitleClass}>Horas extra por empleado</h2>
        <div className="mt-4 overflow-x-auto">
          <table className={tableClass}>
            <thead><tr><th>Empleado</th><th>Actual</th><th>Comparada</th><th>Diferencia</th></tr></thead>
            <tbody>{rows.map((row) => {
              const compared = compareRows.find((item) => item.employeeId === row.employeeId);
              const diff = row.overtimeHours - (compared?.overtimeHours ?? 0);
              return <tr key={row.employeeId}><td className="font-semibold">{row.employee}</td><td>{formatHours(row.overtimeHours)}</td><td>{formatHours(compared?.overtimeHours ?? 0)}</td><td>{diff > 0 ? "+" : ""}{formatHours(diff)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SettingsSection({
  settings,
  updatePaymentSettings,
  holidays,
  setState,
  holidayDraft,
  setHolidayDraft,
  addHoliday,
  resetDemoData,
  supabaseReady,
  loadSupabaseData,
  saveSupabaseData,
}: {
  settings: PaymentSettings;
  updatePaymentSettings: (patch: Partial<PaymentSettings>) => void;
  holidays: Holiday[];
  setState: Dispatch<SetStateAction<AppState>>;
  holidayDraft: Holiday;
  setHolidayDraft: (holiday: Holiday) => void;
  addHoliday: () => void;
  resetDemoData: () => void;
  supabaseReady: boolean;
  loadSupabaseData: () => void;
  saveSupabaseData: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <section className={panelClass}>
        <p className={eyebrowClass}>Reglas</p>
        <h2 className={sectionTitleClass}>Horas y cajas</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <NumberField label="Jornada normal diaria" value={settings.dailyNormalHours} onChange={(value) => updatePaymentSettings({ dailyNormalHours: value })} />
          <NumberField label="Jornada normal semanal" value={settings.weeklyNormalHours} onChange={(value) => updatePaymentSettings({ weeklyNormalHours: value })} />
          <NumberField label="Alerta horas extra" value={settings.overtimeAlertHours} onChange={(value) => updatePaymentSettings({ overtimeAlertHours: value })} />
          <NumberField label="Cajas dia normal" value={settings.defaultCashRegisters} onChange={(value) => updatePaymentSettings({ defaultCashRegisters: value })} />
          <NumberField label="Cajas sabado/festivo" value={settings.weekendCashRegisters} onChange={(value) => updatePaymentSettings({ weekendCashRegisters: value })} />
          <NumberField label="Cajas dia fuerte" value={settings.strongDayCashRegisters} onChange={(value) => updatePaymentSettings({ strongDayCashRegisters: value })} />
        </div>
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <p className="font-semibold">Supabase: {supabaseReady ? "Configurado" : "Pendiente"}</p>
          <p className="text-stone-500">localStorage sigue como respaldo local del navegador.</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><button className={secondaryButton} onClick={loadSupabaseData}><Download className="size-4" />Importar</button><button className={primaryButton} onClick={saveSupabaseData}><Save className="size-4" />Guardar</button></div>
        <button className={`${dangerButton} mt-3`} onClick={resetDemoData}><RefreshCcw className="size-4" />Restaurar seed</button>
      </section>
      <section className={panelClass}>
        <p className={eyebrowClass}>Colombia</p>
        <h2 className={sectionTitleClass}>Festivos</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <Field label="Fecha"><input className={inputClass} type="date" value={holidayDraft.date} onChange={(event) => setHolidayDraft({ ...holidayDraft, date: event.target.value })} /></Field>
          <Field label="Nombre"><input className={inputClass} value={holidayDraft.name} onChange={(event) => setHolidayDraft({ ...holidayDraft, name: event.target.value })} /></Field>
          <button className={secondaryButton} onClick={addHoliday}><Plus className="size-4" />Agregar</button>
        </div>
        <div className="mt-4 grid gap-2">
          {holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3" key={holiday.id}>
              <div><p className="font-semibold">{holiday.name}</p><p className="text-sm text-stone-500">{holiday.date}</p></div>
              <div className="flex gap-2"><button className={iconButton} onClick={() => setHolidayDraft(holiday)}><Pencil className="size-4" /></button><button className={iconButton} onClick={() => setState((current) => ({ ...current, holidays: current.holidays.map((item) => item.id === holiday.id ? { ...item, active: !item.active } : item) }))}><RefreshCcw className="size-4" /></button></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TopNavButton({ item, active, onClick, mobile = false }: { item: { label: Section; icon: typeof Store }; active: boolean; onClick: () => void; mobile?: boolean }) {
  const Icon = item.icon;
  return (
    <button className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${mobile ? "w-full justify-start" : ""} ${active ? "bg-emerald-700 text-white" : "text-stone-700 hover:bg-white hover:text-emerald-800"}`} onClick={onClick}>
      <Icon className="size-4" />
      {item.label}
    </button>
  );
}

function EmployeeSelect({ employees, value, onChange }: { employees: Employee[]; value: string; onChange: (value: string) => void }) {
  return <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Store }) {
  return <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-stone-500">{label}</p><Icon className="size-5 text-emerald-700" /></div><p className="mt-3 text-2xl font-bold tracking-normal">{value}</p></div>;
}

function SchedulePreview({ schedule }: { schedule: DailySchedule }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{areas.map((area) => <div key={area} className="rounded-lg border border-stone-200 bg-stone-50 p-3"><p className="font-semibold">{area}</p><p className="text-sm text-stone-500">{schedule.assignments.filter((assignment) => assignment.area === area).length} turnos</p></div>)}</div>;
}

function EmptyState({ icon: Icon, title }: { icon: typeof Store; title: string }) {
  return <div className="grid place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center"><Icon className="mb-3 size-8 text-stone-400" /><p className="font-semibold text-stone-700">{title}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-stone-700">{label}{children}</label>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><input className={inputClass} type="number" min="0" value={value} onChange={(event) => onChange(Number(event.target.value))} /></Field>;
}

function CheckboxRow<T extends string>({ options, values, labels, onChange }: { options: T[]; values: T[]; labels?: Record<string, string>; onChange: (values: T[]) => void }) {
  return <div className="flex flex-wrap gap-2">{options.map((option) => {
    const checked = values.includes(option);
    return <button key={option} type="button" className={checked ? segmentedActiveButton : segmentedButton} onClick={() => onChange(checked ? values.filter((value) => value !== option) : [...values, option])}>{labels?.[option] ?? option}</button>;
  })}</div>;
}

function getOrCreateSchedule(dateKey: string, state: AppState): DailySchedule {
  const existing = state.schedules.find((schedule) => schedule.date === dateKey);
  if (existing) return existing;
  const profile = getDayProfile(dateKey, state.holidays);
  return { id: makeId(), date: dateKey, weekStart: toWeekStartKey(dateKey), dayKind: profile.kind, isStrongSalesDay: profile.isStrongSalesDay, generatedAt: new Date().toISOString(), assignments: [] };
}

function normalizeState(value: Partial<AppState>): AppState {
  return {
    employees: (value.employees?.length ? value.employees : employeesSeed).map((employee) => ({ ...employee, preferredShiftTemplateId: employee.preferredShiftTemplateId ?? employee.baseShiftTemplateId })),
    shiftTemplates: value.shiftTemplates?.length ? value.shiftTemplates : shiftTemplatesSeed,
    schedules: value.schedules ?? [],
    holidays: value.holidays?.length ? value.holidays : holidaySeed,
    paymentSettings: value.paymentSettings ?? paymentDefaults,
    unavailability: value.unavailability ?? [],
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  return items.some((candidate) => candidate.id === item.id) ? items.map((candidate) => candidate.id === item.id ? item : candidate) : [...items, item];
}

function dailyRowsToCsv(rows: DailyReportRow[]) {
  const headers = ["Empleado", "Area", "Dia", "Fecha", "Tipo de dia", "Horario original", "Horario final", "Horas normales", "Horas extra automaticas", "Horas extra manuales", "Total horas extra", "Permiso / ausencia", "Nota", "Advertencia descanso"];
  const body = rows.map((row) => [row.employeeName, row.area, row.day, row.date, row.dayKind, row.originalSchedule, row.finalSchedule, row.normalHours, row.automaticOvertime, row.manualOvertime, row.totalOvertime, row.absence, row.note, row.restWarning].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}

function dailyReportRowToPlainObject(row: DailyReportRow) {
  return {
    Empleado: row.employeeName,
    Area: row.area,
    Dia: row.day,
    Fecha: row.date,
    "Tipo de dia": row.dayKind,
    "Horario original": row.originalSchedule,
    "Horario final": row.finalSchedule,
    "Horas normales": row.normalHours,
    "Horas extra automaticas": row.automaticOvertime,
    "Horas extra manuales": row.manualOvertime,
    "Total horas extra": row.totalOvertime,
    "Permiso / ausencia": row.absence,
    Nota: row.note,
    "Advertencia descanso": row.restWarning,
  };
}

const emptyDailyReportRow: DailyReportRow = {
  employeeId: "",
  employeeName: "",
  area: "Caja",
  day: "",
  date: "",
  dayKind: "normal",
  originalSchedule: "",
  finalSchedule: "",
  normalHours: 0,
  automaticOvertime: 0,
  manualOvertime: 0,
  totalOvertime: 0,
  absence: "",
  note: "",
  restWarning: "",
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function toOptionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

type DbShiftTemplate = { id: string; name: string; schedule_text: string; start1: string; end1: string; start2: string | null; end2: string | null; total_hours: number; applies_to: DayKind[]; allowed_areas: Area[]; active: boolean };
type DbEmployee = { id: string; name: string; primary_area: Area; secondary_areas: Area[]; employee_type: EmployeeType; day_off: DayKey; base_shift_template_id: string | null; preferred_shift_template_id?: string | null; note: string | null; phone?: string | null; active: boolean; normal_hourly_rate: number | null; overtime_hourly_rate: number | null };
type DbHoliday = { id: string; holiday_date: string; name: string; active: boolean };
type DbSchedule = { id: string; schedule_date: string; week_start: string; day_kind: DayKind; is_strong_sales_day: boolean; generated_at: string };
type DbScheduleAssignment = { id: string; schedule_id: string; assignment_date: string; employee_id: string; area: Area; shift_template_id: string; cash_register: CashRegister | null; note: string | null; manual: boolean; custom_start1: string | null; custom_end1: string | null; custom_start2: string | null; custom_end2: string | null; custom_total_hours: number | null; custom_schedule_text: string | null; normal_hours?: number | null; overtime_hours?: number | null; overtime_manual?: boolean | null; overtime_reason?: string | null; break_minutes?: number | null; warning_message?: string | null };
type DbPaymentSettings = { id: string; daily_normal_hours: number; weekly_normal_hours: number; overtime_alert_hours: number; default_cash_registers: number; weekend_cash_registers: number; strong_day_cash_registers: number };
type DbUnavailability = { id: string; employee_id: string; date: string; type: UnavailabilityType; reason: string | null; all_day: boolean; start_time: string | null; end_time: string | null };

function dbTemplateToApp(row: DbShiftTemplate): ShiftTemplate {
  return { id: row.id, name: row.name, scheduleText: row.schedule_text, start1: row.start1.slice(0, 5), end1: row.end1.slice(0, 5), start2: row.start2?.slice(0, 5), end2: row.end2?.slice(0, 5), totalHours: Number(row.total_hours), appliesTo: row.applies_to ?? [], allowedAreas: row.allowed_areas ?? [], active: row.active };
}
function dbEmployeeToApp(row: DbEmployee): Employee {
  return { id: row.id, name: row.name, primaryArea: row.primary_area, secondaryAreas: row.secondary_areas ?? [], type: row.employee_type, dayOff: row.day_off, baseShiftTemplateId: row.base_shift_template_id ?? undefined, preferredShiftTemplateId: row.preferred_shift_template_id ?? row.base_shift_template_id ?? undefined, note: row.note ?? "", phone: row.phone ?? "", active: row.active, normalHourlyRate: row.normal_hourly_rate ?? undefined, overtimeHourlyRate: row.overtime_hourly_rate ?? undefined };
}
function dbHolidayToApp(row: DbHoliday): Holiday {
  return { id: row.id, date: row.holiday_date, name: row.name, active: row.active };
}
function dbAssignmentToApp(row: DbScheduleAssignment): ScheduleAssignment {
  return { id: row.id, scheduleId: row.schedule_id, date: row.assignment_date, employeeId: row.employee_id, area: row.area, shiftTemplateId: row.shift_template_id, cashRegister: row.cash_register ?? undefined, note: row.note ?? undefined, manual: row.manual, customStart1: row.custom_start1 ?? undefined, customEnd1: row.custom_end1 ?? undefined, customStart2: row.custom_start2 ?? undefined, customEnd2: row.custom_end2 ?? undefined, customTotalHours: row.custom_total_hours ?? undefined, customScheduleText: row.custom_schedule_text ?? undefined, normalHours: row.normal_hours ?? undefined, overtimeHours: row.overtime_hours ?? undefined, overtimeManual: row.overtime_manual ?? undefined, overtimeReason: row.overtime_reason ?? undefined, breakMinutes: row.break_minutes ?? undefined, warningMessage: row.warning_message ?? undefined };
}
function dbSettingsToApp(row: DbPaymentSettings): PaymentSettings {
  return { dailyNormalHours: Number(row.daily_normal_hours), weeklyNormalHours: Number(row.weekly_normal_hours), overtimeAlertHours: Number(row.overtime_alert_hours), defaultCashRegisters: row.default_cash_registers, weekendCashRegisters: row.weekend_cash_registers, strongDayCashRegisters: row.strong_day_cash_registers };
}
function dbUnavailableToApp(row: DbUnavailability): EmployeeUnavailability {
  return { id: row.id, employeeId: row.employee_id, date: row.date, type: row.type, reason: row.reason ?? "", allDay: row.all_day, startTime: row.start_time?.slice(0, 5), endTime: row.end_time?.slice(0, 5) };
}
function appTemplateToDb(template: ShiftTemplate) { return { id: template.id, name: template.name, schedule_text: template.scheduleText, start1: template.start1, end1: template.end1, start2: template.start2 ?? null, end2: template.end2 ?? null, total_hours: template.totalHours, applies_to: template.appliesTo, allowed_areas: template.allowedAreas, active: template.active }; }
function appEmployeeToDb(employee: Employee) { return { id: employee.id, name: employee.name, primary_area: employee.primaryArea, secondary_areas: employee.secondaryAreas, employee_type: employee.type, day_off: employee.dayOff, base_shift_template_id: employee.preferredShiftTemplateId ?? employee.baseShiftTemplateId ?? null, preferred_shift_template_id: employee.preferredShiftTemplateId ?? null, note: employee.note ?? null, phone: employee.phone ?? null, active: employee.active, normal_hourly_rate: employee.normalHourlyRate ?? null, overtime_hourly_rate: employee.overtimeHourlyRate ?? null }; }
function appHolidayToDb(holiday: Holiday) { return { id: holiday.id, holiday_date: holiday.date, name: holiday.name, active: holiday.active }; }
function appScheduleToDb(schedule: DailySchedule) { return { id: schedule.id, schedule_date: schedule.date, week_start: schedule.weekStart, day_kind: schedule.dayKind, is_strong_sales_day: schedule.isStrongSalesDay, generated_at: schedule.generatedAt }; }
function appAssignmentToDb(assignment: ScheduleAssignment) { return { id: assignment.id, schedule_id: assignment.scheduleId, assignment_date: assignment.date, employee_id: assignment.employeeId, area: assignment.area, shift_template_id: assignment.shiftTemplateId, cash_register: assignment.cashRegister ?? null, note: assignment.note ?? null, manual: assignment.manual, custom_start1: assignment.customStart1 ?? null, custom_end1: assignment.customEnd1 ?? null, custom_start2: assignment.customStart2 ?? null, custom_end2: assignment.customEnd2 ?? null, custom_total_hours: assignment.customTotalHours ?? null, custom_schedule_text: assignment.customScheduleText ?? null, normal_hours: assignment.normalHours ?? null, overtime_hours: assignment.overtimeHours ?? null, overtime_manual: assignment.overtimeManual ?? null, overtime_reason: assignment.overtimeReason ?? null, break_minutes: assignment.breakMinutes ?? null, warning_message: assignment.warningMessage ?? null }; }
function appSettingsToDb(settings: PaymentSettings) { return { id: "44444444-4444-4444-8444-444444444444", daily_normal_hours: settings.dailyNormalHours, weekly_normal_hours: settings.weeklyNormalHours, overtime_alert_hours: settings.overtimeAlertHours, default_cash_registers: settings.defaultCashRegisters, weekend_cash_registers: settings.weekendCashRegisters, strong_day_cash_registers: settings.strongDayCashRegisters }; }
function appUnavailableToDb(item: EmployeeUnavailability) { return { id: item.id, employee_id: item.employeeId, date: item.date, type: item.type, reason: item.reason ?? null, all_day: item.allDay, start_time: item.startTime ?? null, end_time: item.endTime ?? null }; }

const panelClass = "rounded-lg border border-stone-200 bg-white p-4";
const sectionHeaderClass = "mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const sectionTitleClass = "text-xl font-bold tracking-normal";
const eyebrowClass = "text-xs font-bold uppercase tracking-[0.16em] text-emerald-700";
const inputClass = "min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-stone-100 disabled:text-stone-400";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800";
const desktopPrimaryButton = "hidden min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800 lg:inline-flex";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-800 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800";
const desktopSecondaryButton = "hidden min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-800 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 lg:inline-flex";
const dangerButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50";
const iconButton = "inline-grid size-11 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800";
const segmentedButton = "min-h-11 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:border-emerald-200 hover:bg-emerald-50";
const segmentedActiveButton = "min-h-11 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-bold text-white";
const tableClass = "w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm [&_td]:border-b [&_td]:border-stone-100 [&_td]:px-3 [&_td]:py-3 [&_th]:border-b [&_th]:border-stone-200 [&_th]:px-3 [&_th]:py-3 [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-stone-500";
const tagClass = "inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800";
const tagMutedClass = "inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-600";
