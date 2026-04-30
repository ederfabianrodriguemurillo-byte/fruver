"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Store,
  Trash2,
  Users,
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
} from "@/lib/seed-data";
import {
  calculateDailyReport,
  calculateShiftHours,
  calculateWeeklyReport,
  duplicateWeek,
  formatCurrency,
  formatDateKey,
  formatHours,
  formatLongDate,
  generateScheduleForDate,
  generateWhatsAppMessage,
  applyExtraHours,
  getDayKindLabel,
  getDayKey,
  getDayLabel,
  getDayProfile,
  getScheduleWarnings,
  getTodayKey,
  getTomorrowKey,
  getWeekDates,
  makeId,
  parseDateKey,
  replaceSchedules,
  startOfWeek,
  toWeekStartKey,
} from "@/lib/schedule-engine";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type {
  AppState,
  Area,
  CashRegister,
  DailySchedule,
  DayKey,
  DayKind,
  DailyReportRow,
  Employee,
  EmployeeReportRow,
  Holiday,
  PaymentSettings,
  ScheduleAssignment,
  ShiftTemplate,
} from "@/lib/types";

type Section =
  | "Inicio"
  | "Empleados"
  | "Turnos"
  | "Generar"
  | "WhatsApp"
  | "Reportes"
  | "Configuración";

type Notice = { kind: "success" | "warning"; message: string } | null;

const storageKey = "fruver-turnos-state-v1";

const dayKindOptions: { value: DayKind; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
  { value: "festivo", label: "Festivo" },
  { value: "fuerte", label: "Día fuerte" },
];

const dayOptions: { value: DayKey; label: string }[] = [
  { value: "lunes", label: "Lunes" },
  { value: "martes", label: "Martes" },
  { value: "miercoles", label: "Miércoles" },
  { value: "jueves", label: "Jueves" },
  { value: "viernes", label: "Viernes" },
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
];

const navItems: { label: Section; icon: typeof Store }[] = [
  { label: "Inicio", icon: Store },
  { label: "Empleados", icon: Users },
  { label: "Turnos", icon: Clock3 },
  { label: "Generar", icon: CalendarDays },
  { label: "WhatsApp", icon: MessageCircle },
  { label: "Reportes", icon: BarChart3 },
  { label: "Configuración", icon: Settings },
];

const initialState: AppState = {
  employees: employeesSeed,
  shiftTemplates: shiftTemplatesSeed,
  schedules: [],
  holidays: holidaySeed,
  paymentSettings: paymentDefaults,
};

const emptyEmployee = (baseShiftTemplateId: string): Employee => ({
  id: makeId(),
  name: "",
  primaryArea: "Caja",
  secondaryAreas: [],
  type: "Fijo",
  dayOff: "lunes",
  baseShiftTemplateId,
  note: "",
  active: true,
  normalHourlyRate: undefined,
  overtimeHourlyRate: undefined,
});

const emptyTemplate = (): ShiftTemplate => ({
  id: makeId(),
  name: "",
  scheduleText: "",
  start1: "06:00",
  end1: "12:00",
  start2: "",
  end2: "",
  totalHours: 6,
  appliesTo: ["normal"],
  allowedAreas: ["Caja"],
  active: true,
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
  const [selectedDate, setSelectedDate] = useState(tomorrowKey);
  const [generationMode, setGenerationMode] = useState<"tomorrow" | "week" | "date">(
    "tomorrow",
  );
  const [generationDate, setGenerationDate] = useState(tomorrowKey);
  const [employeeDraft, setEmployeeDraft] = useState<Employee>(
    emptyEmployee(shiftTemplatesSeed[0].id),
  );
  const [templateDraft, setTemplateDraft] = useState<ShiftTemplate>(emptyTemplate);
  const [assignmentDraft, setAssignmentDraft] = useState({
    employeeId: employeesSeed[0]?.id ?? "",
    area: "Caja" as Area,
    shiftTemplateId: shiftTemplatesSeed[0]?.id ?? "",
    cashRegister: cashRegisters[0] as CashRegister,
  });
  const [reportWeek, setReportWeek] = useState(currentWeekStart);
  const [compareWeek, setCompareWeek] = useState(() => {
    const previousWeek = parseDateKey(currentWeekStart);
    previousWeek.setDate(previousWeek.getDate() - 7);
    return formatDateKey(startOfWeek(previousWeek));
  });
  const [holidayDraft, setHolidayDraft] = useState<Holiday>({
    id: makeId(),
    date: todayKey,
    name: "",
    active: true,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AppState;
          setState({
            employees: parsed.employees?.length ? parsed.employees : employeesSeed,
            shiftTemplates: parsed.shiftTemplates?.length
              ? parsed.shiftTemplates
              : shiftTemplatesSeed,
            schedules: parsed.schedules ?? [],
            holidays: parsed.holidays?.length ? parsed.holidays : holidaySeed,
            paymentSettings: parsed.paymentSettings ?? paymentDefaults,
          });
        } catch {
          setState(initialState);
        }
      }
      setHydrated(true);

      if (getSupabaseBrowserClient()) {
        loadSupabaseData(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(state));

    if (supabaseClient) {
      const saveTimeout = window.setTimeout(() => {
        saveSupabaseData(true);
      }, 2500);
      return () => window.clearTimeout(saveTimeout);
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const activeEmployees = state.employees.filter((employee) => employee.active);
  const selectedSchedule = state.schedules.find(
    (schedule) => schedule.date === selectedDate,
  );
  const selectedProfile = getDayProfile(selectedDate, state.holidays);
  const selectedWeekStart = toWeekStartKey(selectedDate);
  const selectedWeekDates = getWeekDates(selectedWeekStart);
  const existingWeeks = useMemo(
    () =>
      Array.from(new Set(state.schedules.map((schedule) => schedule.weekStart))).sort(
        (a, b) => b.localeCompare(a),
      ),
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
    [
      reportWeek,
      state.employees,
      state.paymentSettings,
      state.schedules,
      state.shiftTemplates,
    ],
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
    [
      compareWeek,
      state.employees,
      state.paymentSettings,
      state.schedules,
      state.shiftTemplates,
    ],
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
  });

  function showNotice(kind: NonNullable<Notice>["kind"], message: string) {
    setNotice({ kind, message });
  }

  function updatePaymentSettings(patch: Partial<PaymentSettings>) {
    setState((current) => ({
      ...current,
      paymentSettings: { ...current.paymentSettings, ...patch },
    }));
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
      }),
    );

    setState((current) => ({
      ...current,
      schedules: replaceSchedules(current.schedules, generated),
    }));
    setSelectedDate(dates[0]);
    setReportWeek(toWeekStartKey(dates[0]));
    setActiveSection("Generar");
    showNotice("success", "Turnos generados");
  }

  function saveEmployee() {
    if (!employeeDraft.name.trim()) {
      showNotice("warning", "El nombre del empleado es obligatorio");
      return;
    }

    if (!employeeDraft.baseShiftTemplateId) {
      showNotice("warning", "Selecciona un turno base");
      return;
    }

    setState((current) => {
      const exists = current.employees.some((employee) => employee.id === employeeDraft.id);
      const nextEmployee = {
        ...employeeDraft,
        name: employeeDraft.name.trim(),
        note: employeeDraft.note?.trim(),
      };

      return {
        ...current,
        employees: exists
          ? current.employees.map((employee) =>
              employee.id === employeeDraft.id ? nextEmployee : employee,
            )
          : [...current.employees, nextEmployee],
      };
    });
    setEmployeeDraft(emptyEmployee(state.shiftTemplates[0]?.id ?? ""));
    showNotice("success", "Empleado guardado");
  }

  function saveTemplate() {
    if (!templateDraft.name.trim() || !templateDraft.scheduleText.trim()) {
      showNotice("warning", "Nombre y horario son obligatorios");
      return;
    }

    if (templateDraft.allowedAreas.length === 0 || templateDraft.appliesTo.length === 0) {
      showNotice("warning", "Selecciona áreas y tipos de día");
      return;
    }

    const start2 = templateDraft.start2 || undefined;
    const end2 = templateDraft.end2 || undefined;
    const nextTemplate: ShiftTemplate = {
      ...templateDraft,
      name: templateDraft.name.trim(),
      scheduleText: templateDraft.scheduleText.trim(),
      start2,
      end2,
      totalHours: calculateShiftHours(
        templateDraft.start1,
        templateDraft.end1,
        start2,
        end2,
      ),
    };

    setState((current) => {
      const exists = current.shiftTemplates.some(
        (template) => template.id === nextTemplate.id,
      );

      return {
        ...current,
        shiftTemplates: exists
          ? current.shiftTemplates.map((template) =>
              template.id === nextTemplate.id ? nextTemplate : template,
            )
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

    const existing = selectedSchedule?.assignments.some(
      (assignment) => assignment.employeeId === assignmentDraft.employeeId,
    );

    if (existing) {
      showNotice("warning", "Ese empleado ya está asignado ese día");
      return;
    }

    setState((current) => {
      const schedule = getOrCreateSchedule(selectedDate, current);
      const assignment: ScheduleAssignment = {
        id: makeId(),
        scheduleId: schedule.id,
        date: selectedDate,
        employeeId: assignmentDraft.employeeId,
        area: assignmentDraft.area,
        shiftTemplateId: assignmentDraft.shiftTemplateId,
        cashRegister:
          assignmentDraft.area === "Caja" ? assignmentDraft.cashRegister : undefined,
        manual: true,
      };
      const nextSchedule = {
        ...schedule,
        assignments: [...schedule.assignments, assignment],
      };

      return {
        ...current,
        schedules: replaceSchedules(current.schedules, [nextSchedule]),
      };
    });
    showNotice("success", "Asignación agregada");
  }

  function updateAssignment(
    assignmentId: string,
    patch: Partial<ScheduleAssignment>,
  ) {
    setState((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => {
        if (schedule.date !== selectedDate) {
          return schedule;
        }

        if (
          patch.employeeId &&
          schedule.assignments.some(
            (assignment) =>
              assignment.id !== assignmentId && assignment.employeeId === patch.employeeId,
          )
        ) {
          showNotice("warning", "Ese empleado ya está asignado ese día");
          return schedule;
        }

        return {
          ...schedule,
          assignments: schedule.assignments.map((assignment) =>
            assignment.id === assignmentId
              ? {
                  ...assignment,
                  ...patch,
                  manual: true,
                  cashRegister:
                    (patch.area ?? assignment.area) === "Caja"
                      ? patch.cashRegister ?? assignment.cashRegister ?? cashRegisters[0]
                      : undefined,
                }
              : assignment,
          ),
        };
      }),
    }));
  }

  function removeAssignment(assignmentId: string) {
    setState((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) =>
        schedule.date === selectedDate
          ? {
              ...schedule,
              assignments: schedule.assignments.filter(
                (assignment) => assignment.id !== assignmentId,
              ),
            }
          : schedule,
      ),
    }));
  }

  function duplicateSelectedWeek(sourceWeekStart: string) {
    const targetWeekStart = formatDateKey(
      startOfWeek(
        new Date(
          parseDateKey(sourceWeekStart).setDate(
            parseDateKey(sourceWeekStart).getDate() + 7,
          ),
        ),
      ),
    );
    const duplicated = duplicateWeek({
      sourceWeekStart,
      targetWeekStart,
      schedules: state.schedules,
      holidays: state.holidays,
    });

    if (duplicated.length === 0) {
      showNotice("warning", "No hay horarios para duplicar");
      return;
    }

    setState((current) => ({
      ...current,
      schedules: replaceSchedules(current.schedules, duplicated),
    }));
    setSelectedDate(targetWeekStart);
    setReportWeek(targetWeekStart);
    setActiveSection("Generar");
    showNotice("success", "Semana duplicada");
  }

  async function copyWhatsAppMessage() {
    await navigator.clipboard.writeText(whatsappMessage);
    showNotice("success", "Mensaje copiado");
  }

  function downloadCsv() {
    const dailyRows = calculateDailyReport({
      weekStart: reportWeek,
      schedules: state.schedules,
      employees: state.employees,
      shiftTemplates: state.shiftTemplates,
    });
    const csv = rowsToCsv(dailyRows);
    triggerDownload(
      `reporte-diario-${reportWeek}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
  }

  function downloadExcel() {
    const dailyRows = calculateDailyReport({
      weekStart: reportWeek,
      schedules: state.schedules,
      employees: state.employees,
      shiftTemplates: state.shiftTemplates,
    });
    const plainRows = dailyRows.map(dailyReportRowToPlainObject);
    const headers = Object.keys(plainRows[0] ?? dailyReportRowToPlainObject(emptyDailyReportRow));
    const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headers
      .map((header) => `<th>${escapeHtml(header)}</th>`)
      .join("")}</tr></thead><tbody>${plainRows
      .map(
        (row) =>
          `<tr>${headers
            .map((header) => `<td>${escapeHtml(String(row[header as keyof typeof row] ?? ""))}</td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody></table></body></html>`;

    triggerDownload(
      `reporte-diario-${reportWeek}.xls`,
      new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
    );
  }

  function addHoliday() {
    if (!holidayDraft.date || !holidayDraft.name.trim()) {
      showNotice("warning", "Fecha y nombre del festivo son obligatorios");
      return;
    }

    setState((current) => {
      const exists = current.holidays.some((holiday) => holiday.id === holidayDraft.id);
      const nextHoliday = { ...holidayDraft, name: holidayDraft.name.trim() };

      return {
        ...current,
        holidays: exists
          ? current.holidays.map((holiday) =>
              holiday.id === holidayDraft.id ? nextHoliday : holiday,
            )
          : [...current.holidays, nextHoliday],
      };
    });
    setHolidayDraft({ id: makeId(), date: todayKey, name: "", active: true });
    showNotice("success", "Festivo guardado");
  }

  function resetDemoData() {
    setState(initialState);
    setEmployeeDraft(emptyEmployee(shiftTemplatesSeed[0].id));
    setTemplateDraft(emptyTemplate());
    showNotice("success", "Datos iniciales restaurados");
  }

  async function loadSupabaseData(silent = false) {
    if (!supabaseClient) {
      showNotice("warning", "Configura Supabase en .env.local");
      return;
    }

    const [
      templatesResult,
      employeesResult,
      holidaysResult,
      settingsResult,
      schedulesResult,
      assignmentsResult,
    ] = await Promise.all([
      supabaseClient
        .from("shift_templates")
        .select("*")
        .order("schedule_text")
        .returns<DbShiftTemplate[]>(),
      supabaseClient
        .from("employees")
        .select("*")
        .order("name")
        .returns<DbEmployee[]>(),
      supabaseClient
        .from("holidays")
        .select("*")
        .order("holiday_date")
        .returns<DbHoliday[]>(),
      supabaseClient
        .from("payment_settings")
        .select("*")
        .limit(1)
        .returns<DbPaymentSettings[]>(),
      supabaseClient
        .from("schedules")
        .select("*")
        .order("schedule_date")
        .returns<DbSchedule[]>(),
      supabaseClient
        .from("schedule_assignments")
        .select("*")
        .order("assignment_date")
        .returns<DbScheduleAssignment[]>(),
    ]);

    const error =
      templatesResult.error ??
      employeesResult.error ??
      holidaysResult.error ??
      settingsResult.error ??
      schedulesResult.error ??
      assignmentsResult.error;

    if (error) {
      showNotice("warning", error.message);
      return;
    }

    const assignments = assignmentsResult.data ?? [];
    const schedules =
      schedulesResult.data?.map((schedule) => ({
        id: schedule.id,
        date: schedule.schedule_date,
        weekStart: schedule.week_start,
        dayKind: schedule.day_kind,
        isStrongSalesDay: schedule.is_strong_sales_day,
        generatedAt: schedule.generated_at,
        assignments: assignments
          .filter((assignment) => assignment.schedule_id === schedule.id)
          .map(dbAssignmentToApp),
      })) ?? [];
    const settings = settingsResult.data?.[0];

    setState({
      employees: employeesResult.data?.map(dbEmployeeToApp) ?? [],
      shiftTemplates: templatesResult.data?.map(dbTemplateToApp) ?? [],
      holidays: holidaysResult.data?.map(dbHolidayToApp) ?? [],
      schedules,
      paymentSettings: settings ? dbSettingsToApp(settings) : paymentDefaults,
    });
    if (!silent) {
      showNotice("success", "Datos importados desde Supabase");
    }
  }

  async function saveSupabaseData(silent = false) {
    if (!supabaseClient) {
      showNotice("warning", "Configura Supabase en .env.local");
      return;
    }

    const templateRows = state.shiftTemplates.map(appTemplateToDb);
    const employeeRows = state.employees.map(appEmployeeToDb);
    const holidayRows = state.holidays.map(appHolidayToDb);
    const scheduleRows = state.schedules.map(appScheduleToDb);
    const assignmentRows = state.schedules.flatMap((schedule) =>
      schedule.assignments.map(appAssignmentToDb),
    );

    const results = [
      await supabaseClient.from("shift_templates").upsert(templateRows),
      await supabaseClient.from("employees").upsert(employeeRows),
      await supabaseClient.from("holidays").upsert(holidayRows),
      await supabaseClient.from("payment_settings").upsert(appSettingsToDb(state.paymentSettings)),
    ];

    if (state.schedules.length) {
      const scheduleIds = state.schedules.map((schedule) => schedule.id);
      results.push(
        await supabaseClient
          .from("schedule_assignments")
          .delete()
          .in("schedule_id", scheduleIds),
      );
      results.push(await supabaseClient.from("schedules").upsert(scheduleRows));

      if (assignmentRows.length) {
        results.push(
          await supabaseClient.from("schedule_assignments").insert(assignmentRows),
        );
      }
    }

    const error = results.find((result) => result.error)?.error;

    if (error) {
      showNotice("warning", error.message);
      return;
    }

    if (!silent) {
      showNotice("success", "Datos guardados en Supabase");
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f3] text-stone-950">
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-64 border-r border-stone-200 bg-white px-4 py-5 md:block">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-emerald-700 text-white">
            <Store className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Fruver
            </p>
            <h1 className="text-lg font-bold leading-tight">Turnos</h1>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavButton
              key={item.label}
              active={activeSection === item.label}
              icon={item.icon}
              label={item.label}
              onClick={() => setActiveSection(item.label)}
            />
          ))}
        </nav>
      </aside>

      <main className="mx-auto min-h-screen max-w-7xl px-4 pb-48 pt-4 md:ml-64 md:px-6 md:pb-10">
        <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-stone-200 bg-[#f7f8f3]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">
                {formatLongDate(todayKey)}
              </p>
              <h2 className="text-2xl font-bold tracking-normal md:text-3xl">
                {activeSection}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={secondaryButton} onClick={() => setActiveSection("WhatsApp")}>
                <MessageCircle className="size-4" />
                WhatsApp
              </button>
              <button className={primaryButton} onClick={handleGenerateSchedules}>
                <CalendarDays className="size-4" />
                Generar turnos
              </button>
            </div>
          </div>
        </header>

        {notice ? (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {notice.kind === "success" ? (
              <Check className="size-4" />
            ) : (
              <AlertTriangle className="size-4" />
            )}
            {notice.message}
          </div>
        ) : null}

        {activeSection === "Inicio" ? (
          <HomeSection
            activeEmployees={activeEmployees.length}
            schedules={state.schedules}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            setActiveSection={setActiveSection}
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
            resetDraft={() =>
              setEmployeeDraft(emptyEmployee(state.shiftTemplates[0]?.id ?? ""))
            }
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
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            selectedWeekDates={selectedWeekDates}
            selectedProfile={selectedProfile}
            selectedSchedule={selectedSchedule}
            employees={state.employees}
            templates={state.shiftTemplates}
            assignmentDraft={assignmentDraft}
            setAssignmentDraft={setAssignmentDraft}
            addAssignment={addAssignment}
            updateAssignment={updateAssignment}
            removeAssignment={removeAssignment}
            schedules={state.schedules}
            existingWeeks={existingWeeks}
            duplicateSelectedWeek={duplicateSelectedWeek}
          />
        ) : null}

        {activeSection === "WhatsApp" ? (
          <WhatsAppSection
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            message={whatsappMessage}
            copyMessage={copyWhatsAppMessage}
            schedule={selectedSchedule}
          />
        ) : null}

        {activeSection === "Reportes" ? (
          <ReportsSection
            reportWeek={reportWeek}
            setReportWeek={setReportWeek}
            compareWeek={compareWeek}
            setCompareWeek={setCompareWeek}
            rows={reportRows}
            compareRows={compareRows}
            downloadCsv={downloadCsv}
            downloadExcel={downloadExcel}
          />
        ) : null}

        {activeSection === "Configuración" ? (
          <SettingsSection
            settings={state.paymentSettings}
            updatePaymentSettings={updatePaymentSettings}
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

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-stone-200 bg-white md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold ${
                activeSection === item.label ? "text-emerald-700" : "text-stone-500"
              }`}
              onClick={() => setActiveSection(item.label)}
            >
              <Icon className="size-5" />
              <span className="max-w-full truncate px-1">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function HomeSection({
  activeEmployees,
  schedules,
  selectedDate,
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
  const tomorrowSchedule = schedules.find((schedule) => schedule.date === tomorrowKey);
  const totalOvertime = reportRows.reduce((sum, row) => sum + row.overtimeHours, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Empleados activos" value={String(activeEmployees)} icon={Users} />
        <MetricCard
          label="Turnos guardados"
          value={String(schedules.length)}
          icon={CalendarRange}
        />
        <MetricCard
          label="Horas extra semana"
          value={formatHours(totalOvertime)}
          icon={BarChart3}
        />
        <MetricCard
          label="Supabase"
          value={supabaseReady ? "Listo" : "Local"}
          icon={FileSpreadsheet}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className={panelClass}>
          <div className={sectionHeaderClass}>
            <div>
              <p className={eyebrowClass}>Mañana</p>
              <h3 className={sectionTitleClass}>{formatLongDate(tomorrowKey)}</h3>
            </div>
            <button
              className={secondaryButton}
              onClick={() => {
                setSelectedDate(tomorrowKey);
                setActiveSection("Generar");
              }}
            >
              <Pencil className="size-4" />
              Editar
            </button>
          </div>
          {tomorrowSchedule ? (
            <SchedulePreview schedule={tomorrowSchedule} />
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Sin turnos para mañana"
              actionLabel="Generar"
              onAction={() => setActiveSection("Generar")}
            />
          )}
        </section>

        <section className={panelClass}>
          <div className={sectionHeaderClass}>
            <div>
              <p className={eyebrowClass}>Alertas</p>
              <h3 className={sectionTitleClass}>Horas extra</h3>
            </div>
          </div>
          <div className="space-y-2">
            {warnings.length ? (
              warnings.map((row) => (
                <div
                  key={row.employeeId}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-amber-950">{row.employee}</p>
                  <p className="text-amber-800">
                    {formatHours(row.overtimeHours)} horas extra
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-stone-500">Sin alertas semanales.</p>
            )}
          </div>
        </section>
      </div>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Historial</p>
            <h3 className={sectionTitleClass}>Semanas generadas</h3>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {existingWeeks.length ? (
            existingWeeks.map((weekStart) => (
              <div
                key={weekStart}
                className="rounded-lg border border-stone-200 bg-stone-50 p-3"
              >
                <p className="font-semibold">
                  Semana {formatLongDate(weekStart)}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    className={secondaryButton}
                    onClick={() => {
                      setSelectedDate(weekStart);
                      setActiveSection("Generar");
                    }}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </button>
                  <button
                    className={secondaryButton}
                    onClick={() => duplicateSelectedWeek(weekStart)}
                  >
                    <History className="size-4" />
                    Duplicar
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-500">Todavía no hay semanas guardadas.</p>
          )}
        </div>
        <input
          className="sr-only"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          readOnly
        />
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
    <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>CRUD</p>
            <h3 className={sectionTitleClass}>Empleado</h3>
          </div>
          <button className={secondaryButton} onClick={resetDraft}>
            <Plus className="size-4" />
            Nuevo
          </button>
        </div>
        <div className="grid gap-3">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={employeeDraft.name}
              onChange={(event) =>
                setEmployeeDraft({ ...employeeDraft, name: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Área principal">
              <select
                className={inputClass}
                value={employeeDraft.primaryArea}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    primaryArea: event.target.value as Area,
                  })
                }
              >
                {areas.map((area) => (
                  <option key={area}>{area}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo">
              <select
                className={inputClass}
                value={employeeDraft.type}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    type: event.target.value as Employee["type"],
                  })
                }
              >
                <option>Fijo</option>
                <option>Rotativo</option>
              </select>
            </Field>
          </div>
          <Field label="Áreas secundarias">
            <CheckboxRow
              options={areas.filter((area) => area !== employeeDraft.primaryArea)}
              values={employeeDraft.secondaryAreas}
              onChange={(values) =>
                setEmployeeDraft({ ...employeeDraft, secondaryAreas: values })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Día de descanso">
              <select
                className={inputClass}
                value={employeeDraft.dayOff}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    dayOff: event.target.value as DayKey,
                  })
                }
              >
                {dayOptions.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Turno base">
              <select
                className={inputClass}
                value={employeeDraft.baseShiftTemplateId}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    baseShiftTemplateId: event.target.value,
                  })
                }
              >
                {shiftTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.scheduleText}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Nota">
            <textarea
              className={`${inputClass} min-h-20`}
              value={employeeDraft.note ?? ""}
              onChange={(event) =>
                setEmployeeDraft({ ...employeeDraft, note: event.target.value })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor hora normal">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={employeeDraft.normalHourlyRate ?? ""}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    normalHourlyRate: toOptionalNumber(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Valor hora extra">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={employeeDraft.overtimeHourlyRate ?? ""}
                onChange={(event) =>
                  setEmployeeDraft({
                    ...employeeDraft,
                    overtimeHourlyRate: toOptionalNumber(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={employeeDraft.active}
              onChange={(event) =>
                setEmployeeDraft({ ...employeeDraft, active: event.target.checked })
              }
            />
            Activo
          </label>
          <button className={primaryButton} onClick={saveEmployee}>
            <Save className="size-4" />
            Guardar empleado
          </button>
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Listado</p>
            <h3 className={sectionTitleClass}>Empleados</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Área</th>
                <th>Tipo</th>
                <th>Descanso</th>
                <th>Turno base</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const baseTemplate = shiftTemplates.find(
                  (template) => template.id === employee.baseShiftTemplateId,
                );

                return (
                  <tr key={employee.id}>
                    <td className="font-semibold">{employee.name}</td>
                    <td>{employee.primaryArea}</td>
                    <td>{employee.type}</td>
                    <td>{getDayLabel(employee.dayOff)}</td>
                    <td>{baseTemplate?.scheduleText ?? "Sin turno"}</td>
                    <td>{employee.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          className={iconButton}
                          aria-label={`Editar ${employee.name}`}
                          onClick={() => setEmployeeDraft(employee)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          className={iconButton}
                          aria-label={`Cambiar estado de ${employee.name}`}
                          onClick={() =>
                            setState((current) => ({
                              ...current,
                              employees: current.employees.map((item) =>
                                item.id === employee.id
                                  ? { ...item, active: !item.active }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <RefreshCcw className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>CRUD</p>
            <h3 className={sectionTitleClass}>Plantilla</h3>
          </div>
          <button className={secondaryButton} onClick={resetDraft}>
            <Plus className="size-4" />
            Nueva
          </button>
        </div>
        <div className="grid gap-3">
          <Field label="Nombre">
            <input
              className={inputClass}
              value={templateDraft.name}
              onChange={(event) =>
                setTemplateDraft({ ...templateDraft, name: event.target.value })
              }
            />
          </Field>
          <Field label="Horario texto">
            <input
              className={inputClass}
              value={templateDraft.scheduleText}
              onChange={(event) =>
                setTemplateDraft({
                  ...templateDraft,
                  scheduleText: event.target.value,
                })
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Inicio 1">
              <input
                className={inputClass}
                type="time"
                value={templateDraft.start1}
                onChange={(event) =>
                  setTemplateDraft({ ...templateDraft, start1: event.target.value })
                }
              />
            </Field>
            <Field label="Fin 1">
              <input
                className={inputClass}
                type="time"
                value={templateDraft.end1}
                onChange={(event) =>
                  setTemplateDraft({ ...templateDraft, end1: event.target.value })
                }
              />
            </Field>
            <Field label="Inicio 2">
              <input
                className={inputClass}
                type="time"
                value={templateDraft.start2 ?? ""}
                onChange={(event) =>
                  setTemplateDraft({ ...templateDraft, start2: event.target.value })
                }
              />
            </Field>
            <Field label="Fin 2">
              <input
                className={inputClass}
                type="time"
                value={templateDraft.end2 ?? ""}
                onChange={(event) =>
                  setTemplateDraft({ ...templateDraft, end2: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Aplica a">
            <CheckboxRow
              options={dayKindOptions.map((item) => item.value)}
              values={templateDraft.appliesTo}
              labels={Object.fromEntries(dayKindOptions.map((item) => [item.value, item.label]))}
              onChange={(values) =>
                setTemplateDraft({ ...templateDraft, appliesTo: values })
              }
            />
          </Field>
          <Field label="Áreas permitidas">
            <CheckboxRow
              options={areas}
              values={templateDraft.allowedAreas}
              onChange={(values) =>
                setTemplateDraft({ ...templateDraft, allowedAreas: values })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={templateDraft.active}
              onChange={(event) =>
                setTemplateDraft({ ...templateDraft, active: event.target.checked })
              }
            />
            Activa
          </label>
          <button className={primaryButton} onClick={saveTemplate}>
            <Save className="size-4" />
            Guardar plantilla
          </button>
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Base</p>
            <h3 className={sectionTitleClass}>Turnos</h3>
          </div>
        </div>
        <div className="grid gap-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-stone-200 bg-stone-50 p-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">{template.scheduleText}</p>
                  <p className="text-sm text-stone-500">
                    {template.name} · {formatHours(template.totalHours)} h ·{" "}
                    {template.allowedAreas.join(", ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className={iconButton}
                    aria-label={`Editar ${template.name}`}
                    onClick={() => setTemplateDraft(template)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    className={iconButton}
                    aria-label={`Cambiar estado de ${template.name}`}
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        shiftTemplates: current.shiftTemplates.map((item) =>
                          item.id === template.id
                            ? { ...item, active: !item.active }
                            : item,
                        ),
                      }))
                    }
                  >
                    <RefreshCcw className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {template.appliesTo.map((kind) => (
                  <span key={kind} className={tagClass}>
                    {dayKindOptions.find((item) => item.value === kind)?.label ?? kind}
                  </span>
                ))}
                {!template.active ? <span className={tagMutedClass}>Inactiva</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GenerateSection({
  generationMode,
  setGenerationMode,
  generationDate,
  setGenerationDate,
  handleGenerateSchedules,
  selectedDate,
  setSelectedDate,
  selectedWeekDates,
  selectedProfile,
  selectedSchedule,
  employees,
  templates,
  assignmentDraft,
  setAssignmentDraft,
  addAssignment,
  updateAssignment,
  removeAssignment,
  schedules,
  existingWeeks,
  duplicateSelectedWeek,
}: {
  generationMode: "tomorrow" | "week" | "date";
  setGenerationMode: (mode: "tomorrow" | "week" | "date") => void;
  generationDate: string;
  setGenerationDate: (date: string) => void;
  handleGenerateSchedules: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedWeekDates: string[];
  selectedProfile: ReturnType<typeof getDayProfile>;
  selectedSchedule?: DailySchedule;
  employees: Employee[];
  templates: ShiftTemplate[];
  assignmentDraft: {
    employeeId: string;
    area: Area;
    shiftTemplateId: string;
    cashRegister: CashRegister;
  };
  setAssignmentDraft: Dispatch<
    SetStateAction<{
      employeeId: string;
      area: Area;
      shiftTemplateId: string;
      cashRegister: CashRegister;
    }>
  >;
  addAssignment: () => void;
  updateAssignment: (assignmentId: string, patch: Partial<ScheduleAssignment>) => void;
  removeAssignment: (assignmentId: string) => void;
  schedules: DailySchedule[];
  existingWeeks: string[];
  duplicateSelectedWeek: (weekStart: string) => void;
}) {
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [extraHoursModalId, setExtraHoursModalId] = useState<string | null>(null);

  const templatesForDraft = templates.filter(
    (template) =>
      template.active && template.allowedAreas.includes(assignmentDraft.area),
  );

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Generador</p>
            <h3 className={sectionTitleClass}>Crear turnos</h3>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Field label="Rango">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["tomorrow", "Mañana"],
                ["week", "Semana"],
                ["date", "Fecha"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={
                    generationMode === value ? segmentedActiveButton : segmentedButton
                  }
                  onClick={() =>
                    setGenerationMode(value as "tomorrow" | "week" | "date")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fecha">
            <input
              className={inputClass}
              type="date"
              value={generationDate}
              onChange={(event) => setGenerationDate(event.target.value)}
              disabled={generationMode === "tomorrow"}
            />
          </Field>
          <button className={primaryButton} onClick={handleGenerateSchedules}>
            <CalendarDays className="size-4" />
            Generar
          </button>
        </div>
      </section>

      <section className={panelClass}>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {selectedWeekDates.map((dateKey) => {
            const hasSchedule = schedules.some((schedule) => schedule.date === dateKey);
            return (
              <button
                key={dateKey}
                className={`min-w-28 rounded-lg border px-3 py-2 text-left text-sm ${
                  selectedDate === dateKey
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-stone-200 bg-white text-stone-700"
                }`}
                onClick={() => setSelectedDate(dateKey)}
              >
                <span className="block font-semibold">{formatLongDate(dateKey)}</span>
                <span className="text-xs opacity-80">
                  {hasSchedule ? "Guardado" : "Sin turno"}
                </span>
              </button>
            );
          })}
        </div>

        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>{getDayKindLabel(selectedProfile)}</p>
            <h3 className={sectionTitleClass}>{formatLongDate(selectedDate)}</h3>
          </div>
          {selectedProfile.isStrongSalesDay ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Caja fuerte: 4 puestos
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Empleado">
            <select
              className={inputClass}
              value={assignmentDraft.employeeId}
              onChange={(event) =>
                setAssignmentDraft((current) => ({
                  ...current,
                  employeeId: event.target.value,
                }))
              }
            >
              {employees
                .filter((employee) => employee.active)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Área">
            <select
              className={inputClass}
              value={assignmentDraft.area}
              onChange={(event) =>
                setAssignmentDraft((current) => ({
                  ...current,
                  area: event.target.value as Area,
                  shiftTemplateId:
                    templates.find((template) =>
                      template.allowedAreas.includes(event.target.value as Area),
                    )?.id ?? current.shiftTemplateId,
                }))
              }
            >
              {areas.map((area) => (
                <option key={area}>{area}</option>
              ))}
            </select>
          </Field>
          <Field label="Horario">
            <select
              className={inputClass}
              value={assignmentDraft.shiftTemplateId}
              onChange={(event) =>
                setAssignmentDraft((current) => ({
                  ...current,
                  shiftTemplateId: event.target.value,
                }))
              }
            >
              {templatesForDraft.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.scheduleText}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Caja">
            <select
              className={inputClass}
              value={assignmentDraft.cashRegister}
              onChange={(event) =>
                setAssignmentDraft((current) => ({
                  ...current,
                  cashRegister: event.target.value as CashRegister,
                }))
              }
              disabled={assignmentDraft.area !== "Caja"}
            >
              {cashRegisters.map((cashRegister) => (
                <option key={cashRegister}>{cashRegister}</option>
              ))}
            </select>
          </Field>
          <button className={secondaryButton} onClick={addAssignment}>
            <Plus className="size-4" />
            Añadir
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {selectedSchedule?.assignments.length ? (
            selectedSchedule.assignments.map((assignment) => {
              const employee = employees.find(
                (item) => item.id === assignment.employeeId,
              );
              const template = templates.find(
                (item) => item.id === assignment.shiftTemplateId,
              );
              const templatesForAssignment = templates.filter(
                (item) => item.active && item.allowedAreas.includes(assignment.area),
              );

              return (
                <div
                  key={assignment.id}
                  className={`grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm transition-all ${
                    editingAssignmentId === assignment.id ? "ring-2 ring-emerald-500" : ""
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-stone-900">{employee?.name ?? "Empleado"}</h4>
                      <p className="text-sm font-medium text-emerald-700">{assignment.area} {assignment.cashRegister ? `(${assignment.cashRegister})` : ""}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-sm font-semibold text-stone-900 bg-stone-200/50 inline-block px-2 py-1 rounded">
                        {assignment.customScheduleText ?? template?.scheduleText ?? "Sin horario"}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        Normal: {template ? formatHours(template.totalHours) : 0}h
                        {assignment.customTotalHours && assignment.customTotalHours > (template?.totalHours ?? 0) ? (
                          <span className="ml-1 text-amber-600 font-bold">
                            Extra: {formatHours(assignment.customTotalHours - (template?.totalHours ?? 0))}h
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {editingAssignmentId === assignment.id ? (
                    <div className="mt-3 grid gap-3 pt-3 border-t border-stone-200 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
                      <Field label="Empleado">
                        <select
                          className={inputClass}
                          value={assignment.employeeId}
                          onChange={(event) =>
                            updateAssignment(assignment.id, {
                              employeeId: event.target.value,
                            })
                          }
                        >
                          {employees
                            .filter((item) => item.active)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Área">
                        <select
                          className={inputClass}
                          value={assignment.area}
                          onChange={(event) =>
                            updateAssignment(assignment.id, {
                              area: event.target.value as Area,
                              cashRegister:
                                event.target.value === "Caja" ? cashRegisters[0] : undefined,
                            })
                          }
                        >
                          {areas.map((area) => (
                            <option key={area}>{area}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Horario Base">
                        <select
                          className={inputClass}
                          value={assignment.shiftTemplateId}
                          onChange={(event) =>
                            updateAssignment(assignment.id, {
                              shiftTemplateId: event.target.value,
                              customStart1: undefined,
                              customEnd1: undefined,
                              customStart2: undefined,
                              customEnd2: undefined,
                              customTotalHours: undefined,
                              customScheduleText: undefined,
                            })
                          }
                        >
                          {templatesForAssignment.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.scheduleText}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Caja">
                        <select
                          className={inputClass}
                          value={assignment.cashRegister ?? cashRegisters[0]}
                          onChange={(event) =>
                            updateAssignment(assignment.id, {
                              cashRegister: event.target.value as CashRegister,
                            })
                          }
                          disabled={assignment.area !== "Caja"}
                        >
                          {cashRegisters.map((cashRegister) => (
                            <option key={cashRegister}>{cashRegister}</option>
                          ))}
                        </select>
                      </Field>
                      <div className="flex gap-2">
                        <button
                          className={secondaryButton}
                          onClick={() => setEditingAssignmentId(null)}
                        >
                          Ok
                        </button>
                        <button
                          className={dangerButton}
                          onClick={() => removeAssignment(assignment.id)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-stone-200/60">
                      <button
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-stone-200 text-stone-700 transition hover:bg-stone-300"
                        onClick={() => setEditingAssignmentId(assignment.id)}
                      >
                        Editar asignación
                      </button>
                      <button
                        className="text-xs font-bold px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 transition hover:bg-amber-200 flex items-center gap-1"
                        onClick={() => setExtraHoursModalId(assignment.id)}
                      >
                        <Plus className="size-3" />
                        Agregar hora extra
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={Clock3}
              title="Sin asignaciones para esta fecha"
              actionLabel="Generar"
              onAction={handleGenerateSchedules}
            />
          )}
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Historial</p>
            <h3 className={sectionTitleClass}>Duplicar semana</h3>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {existingWeeks.map((weekStart) => (
            <button
              key={weekStart}
              className={secondaryButton}
              onClick={() => duplicateSelectedWeek(weekStart)}
            >
              <History className="size-4" />
              {formatLongDate(weekStart)}
            </button>
          ))}
        </div>
      </section>

      {extraHoursModalId ? (
        <ExtraHoursModal
          assignment={selectedSchedule?.assignments.find((a) => a.id === extraHoursModalId)}
          templates={templates}
          employees={employees}
          onClose={() => setExtraHoursModalId(null)}
          onSave={(assignmentId, patch) => {
            updateAssignment(assignmentId, patch);
            setExtraHoursModalId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ExtraHoursModal({
  assignment,
  templates,
  employees,
  onClose,
  onSave,
}: {
  assignment?: ScheduleAssignment;
  templates: ShiftTemplate[];
  employees: Employee[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<ScheduleAssignment>) => void;
}) {
  const template = templates.find((t) => t.id === assignment?.shiftTemplateId);
  const employee = employees.find((e) => e.id === assignment?.employeeId);

  const [amount, setAmount] = useState<number>(1);
  const [position, setPosition] = useState<"final" | "antes-descanso" | "personalizado">("final");
  const [customStart1, setCustomStart1] = useState(assignment?.customStart1 ?? template?.start1 ?? "");
  const [customEnd1, setCustomEnd1] = useState(assignment?.customEnd1 ?? template?.end1 ?? "");
  const [customStart2, setCustomStart2] = useState(assignment?.customStart2 ?? template?.start2 ?? "");
  const [customEnd2, setCustomEnd2] = useState(assignment?.customEnd2 ?? template?.end2 ?? "");

  if (!assignment || !template) return null;

  const result = applyExtraHours(template, assignment, amount, position, {
    start1: customStart1,
    end1: customEnd1,
    start2: customStart2,
    end2: customEnd2,
  });

  const canConfirm = position !== "personalizado" || (customStart1 && customEnd1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5 border-b border-stone-200 pb-4">
          <h2 className="text-xl font-bold">Agregar hora extra</h2>
          <p className="text-sm text-stone-500 mt-1">Empleado: <span className="font-semibold text-stone-900">{employee?.name}</span></p>
          <p className="text-sm text-stone-500">Horario actual: <span className="font-mono bg-stone-100 px-1 rounded">{assignment.customScheduleText ?? template.scheduleText}</span></p>
        </div>

        <div className="grid gap-4 mb-6">
          <Field label="Posición">
            <select
              className={inputClass}
              value={position}
              onChange={(e) => setPosition(e.target.value as "final" | "antes-descanso" | "personalizado")}
            >
              <option value="final">Al final del turno</option>
              {template.start2 ? <option value="antes-descanso">Antes del descanso</option> : null}
              <option value="personalizado">Personalizado manual</option>
            </select>
          </Field>

          {position !== "personalizado" ? (
            <NumberField
              label="Cantidad de horas extra"
              value={amount}
              onChange={setAmount}
            />
          ) : (
            <div className="grid gap-3 grid-cols-2 bg-stone-50 p-3 rounded-lg border border-stone-200">
              <Field label="Entrada 1"><input type="time" className={inputClass} value={customStart1} onChange={e => setCustomStart1(e.target.value)} /></Field>
              <Field label="Salida 1"><input type="time" className={inputClass} value={customEnd1} onChange={e => setCustomEnd1(e.target.value)} /></Field>
              <Field label="Entrada 2"><input type="time" className={inputClass} value={customStart2} onChange={e => setCustomStart2(e.target.value)} /></Field>
              <Field label="Salida 2"><input type="time" className={inputClass} value={customEnd2} onChange={e => setCustomEnd2(e.target.value)} /></Field>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-emerald-50 p-4 mb-6 border border-emerald-100">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-1">Resultado final</p>
          <p className="text-lg font-bold text-emerald-950">{result.customScheduleText}</p>
          <p className="text-sm text-emerald-800 mt-1">Total: {formatHours(result.customTotalHours)}h</p>
        </div>

        {result.restWarning ? (
          <div className="rounded-lg bg-amber-50 p-4 mb-6 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">Advertencia</p>
              <p className="text-sm text-amber-800">{result.restWarning}. Puedes guardar bajo tu responsabilidad.</p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-3 pt-2">
          <button className={secondaryButton} onClick={onClose}>Cancelar</button>
          <button 
            className={primaryButton} 
            disabled={!canConfirm}
            onClick={() => onSave(assignment.id, {
              customStart1: result.customStart1,
              customEnd1: result.customEnd1,
              customStart2: result.customStart2,
              customEnd2: result.customEnd2,
              customTotalHours: result.customTotalHours,
              customScheduleText: result.customScheduleText,
              manual: true,
            })}
          >
            Confirmar y Guardar
          </button>
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
}: {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  message: string;
  copyMessage: () => void;
  schedule?: DailySchedule;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Fecha</p>
            <h3 className={sectionTitleClass}>{formatLongDate(selectedDate)}</h3>
          </div>
        </div>
        <Field label="Día">
          <input
            className={inputClass}
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </Field>
        <div className="mt-4 grid gap-2">
          <button className={primaryButton} onClick={copyMessage}>
            <Copy className="size-4" />
            Copiar mensaje
          </button>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
            <p className="font-semibold">{schedule?.assignments.length ?? 0} turnos</p>
            <p className="text-stone-500">
              Descanso: {getDayLabel(getDayKey(parseDateKey(selectedDate)))}
            </p>
          </div>
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>WhatsApp</p>
            <h3 className={sectionTitleClass}>Mensaje</h3>
          </div>
          <Clipboard className="size-5 text-emerald-700" />
        </div>
        <textarea
          className="min-h-[520px] w-full resize-y rounded-lg border border-stone-200 bg-stone-950 p-4 font-mono text-sm leading-6 text-stone-50 outline-none focus:border-emerald-600"
          value={message}
          readOnly
        />
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
  compareRows,
  downloadCsv,
  downloadExcel,
}: {
  reportWeek: string;
  setReportWeek: (week: string) => void;
  compareWeek: string;
  setCompareWeek: (week: string) => void;
  rows: EmployeeReportRow[];
  compareRows: EmployeeReportRow[];
  downloadCsv: () => void;
  downloadExcel: () => void;
}) {
  const totals = rows.reduce(
    (summary, row) => ({
      normalHours: summary.normalHours + row.normalHours,
      overtimeHours: summary.overtimeHours + row.overtimeHours,
      overtimePay: summary.overtimePay + row.overtimePay,
    }),
    { normalHours: 0, overtimeHours: 0, overtimePay: 0 },
  );

  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <Field label="Semana">
            <input
              className={inputClass}
              type="date"
              value={reportWeek}
              onChange={(event) => setReportWeek(toWeekStartKey(event.target.value))}
            />
          </Field>
          <Field label="Comparar con">
            <input
              className={inputClass}
              type="date"
              value={compareWeek}
              onChange={(event) => setCompareWeek(toWeekStartKey(event.target.value))}
            />
          </Field>
          <button className={secondaryButton} onClick={downloadCsv}>
            <Download className="size-4" />
            CSV
          </button>
          <button className={primaryButton} onClick={downloadExcel}>
            <FileSpreadsheet className="size-4" />
            Excel
          </button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Horas normales"
          value={formatHours(totals.normalHours)}
          icon={Clock3}
        />
        <MetricCard
          label="Horas extra"
          value={formatHours(totals.overtimeHours)}
          icon={AlertTriangle}
        />
        <MetricCard
          label="Pago extra"
          value={formatCurrency(totals.overtimePay)}
          icon={BarChart3}
        />
      </div>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Pagos</p>
            <h3 className={sectionTitleClass}>Reporte semanal</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Área</th>
                <th>Horas normales</th>
                <th>Horas extra</th>
                <th>Valor hora extra</th>
                <th>Total extra</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.employeeId}>
                    <td className="font-semibold">{row.employee}</td>
                    <td>{row.area}</td>
                    <td>{formatHours(row.normalHours)}</td>
                    <td>{formatHours(row.overtimeHours)}</td>
                    <td>{formatCurrency(row.overtimeHourlyRate)}</td>
                    <td>{formatCurrency(row.overtimePay)}</td>
                    <td>
                      {row.warning ? (
                        <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                          Revisar
                        </span>
                      ) : (
                        "OK"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center text-stone-500">
                    Sin datos para esta semana
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Comparación</p>
            <h3 className={sectionTitleClass}>Horas extra por semana</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Semana actual</th>
                <th>Semana comparada</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const compared = compareRows.find(
                  (item) => item.employeeId === row.employeeId,
                );
                const diff = row.overtimeHours - (compared?.overtimeHours ?? 0);
                return (
                  <tr key={row.employeeId}>
                    <td className="font-semibold">{row.employee}</td>
                    <td>{formatHours(row.overtimeHours)}</td>
                    <td>{formatHours(compared?.overtimeHours ?? 0)}</td>
                    <td className={diff > 0 ? "text-amber-700" : "text-emerald-700"}>
                      {diff > 0 ? "+" : ""}
                      {formatHours(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
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
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Reglas</p>
            <h3 className={sectionTitleClass}>Horas y caja</h3>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Límite diario normal"
            value={settings.dailyNormalHours}
            onChange={(value) => updatePaymentSettings({ dailyNormalHours: value })}
          />
          <NumberField
            label="Límite semanal normal"
            value={settings.weeklyNormalHours}
            onChange={(value) => updatePaymentSettings({ weeklyNormalHours: value })}
          />
          <NumberField
            label="Alerta horas extra"
            value={settings.overtimeAlertHours}
            onChange={(value) => updatePaymentSettings({ overtimeAlertHours: value })}
          />
          <NumberField
            label="Cajas día normal"
            value={settings.defaultCashRegisters}
            onChange={(value) => updatePaymentSettings({ defaultCashRegisters: value })}
          />
          <NumberField
            label="Cajas sábado/festivo"
            value={settings.weekendCashRegisters}
            onChange={(value) => updatePaymentSettings({ weekendCashRegisters: value })}
          />
          <NumberField
            label="Cajas día fuerte"
            value={settings.strongDayCashRegisters}
            onChange={(value) => updatePaymentSettings({ strongDayCashRegisters: value })}
          />
        </div>
        <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
          <p className="font-semibold">Supabase: {supabaseReady ? "Configurado" : "Pendiente"}</p>
          <p className="mt-1 text-stone-500">
            Datos locales activos en este navegador.
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button className={secondaryButton} onClick={loadSupabaseData}>
            <Download className="size-4" />
            Importar
          </button>
          <button className={primaryButton} onClick={saveSupabaseData}>
            <Save className="size-4" />
            Guardar
          </button>
        </div>
        <button className={`${dangerButton} mt-3`} onClick={resetDemoData}>
          <RefreshCcw className="size-4" />
          Restaurar seed
        </button>
      </section>

      <section className={panelClass}>
        <div className={sectionHeaderClass}>
          <div>
            <p className={eyebrowClass}>Colombia</p>
            <h3 className={sectionTitleClass}>Festivos</h3>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <Field label="Fecha">
            <input
              className={inputClass}
              type="date"
              value={holidayDraft.date}
              onChange={(event) =>
                setHolidayDraft({ ...holidayDraft, date: event.target.value })
              }
            />
          </Field>
          <Field label="Nombre">
            <input
              className={inputClass}
              value={holidayDraft.name}
              onChange={(event) =>
                setHolidayDraft({ ...holidayDraft, name: event.target.value })
              }
            />
          </Field>
          <button className={secondaryButton} onClick={addHoliday}>
            <Plus className="size-4" />
            Añadir
          </button>
        </div>
        <div className="mt-4 max-h-[520px] overflow-y-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holidays
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((holiday) => (
                  <tr key={holiday.id}>
                    <td>{holiday.date}</td>
                    <td className="font-semibold">{holiday.name}</td>
                    <td>{holiday.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          className={iconButton}
                          aria-label={`Editar ${holiday.name}`}
                          onClick={() => setHolidayDraft(holiday)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          className={iconButton}
                          aria-label={`Cambiar estado de ${holiday.name}`}
                          onClick={() =>
                            setState((current) => ({
                              ...current,
                              holidays: current.holidays.map((item) =>
                                item.id === holiday.id
                                  ? { ...item, active: !item.active }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <RefreshCcw className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Store;
  label: Section;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${
        active
          ? "bg-emerald-700 text-white"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
      }`}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-stone-500">{label}</p>
        <Icon className="size-5 text-emerald-700" />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-normal">{value}</p>
    </div>
  );
}

function SchedulePreview({ schedule }: { schedule: DailySchedule }) {
  const profile = {
    kind: schedule.dayKind,
    isStrongSalesDay: schedule.isStrongSalesDay,
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className={tagClass}>{getDayKindLabel(profile)}</span>
        <span className={tagMutedClass}>
          {schedule.assignments.length} asignaciones
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {areas.map((area) => {
          const count = schedule.assignments.filter(
            (assignment) => assignment.area === area,
          ).length;

          return (
            <div key={area} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="font-semibold">{area}</p>
              <p className="text-sm text-stone-500">{count} turnos</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: typeof Store;
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
      <Icon className="mb-3 size-8 text-stone-400" />
      <p className="font-semibold text-stone-700">{title}</p>
      <button className={`${secondaryButton} mt-4`} onClick={onAction}>
        <Plus className="size-4" />
        {actionLabel}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-stone-700">
      {label}
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function CheckboxRow<T extends string>({
  options,
  values,
  labels,
  onChange,
}: {
  options: T[];
  values: T[];
  labels?: Record<string, string>;
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            className={checked ? segmentedActiveButton : segmentedButton}
            onClick={() => {
              onChange(
                checked
                  ? values.filter((value) => value !== option)
                  : [...values, option],
              );
            }}
          >
            {labels?.[option] ?? option}
          </button>
        );
      })}
    </div>
  );
}

function getOrCreateSchedule(dateKey: string, state: AppState) {
  const existing = state.schedules.find((schedule) => schedule.date === dateKey);

  if (existing) {
    return existing;
  }

  const profile = getDayProfile(dateKey, state.holidays);
  const scheduleId = makeId();

  return {
    id: scheduleId,
    date: dateKey,
    weekStart: toWeekStartKey(dateKey),
    dayKind: profile.kind,
    isStrongSalesDay: profile.isStrongSalesDay,
    generatedAt: new Date().toISOString(),
    assignments: [],
  };
}

function rowsToCsv(rows: DailyReportRow[]) {
  const headers = [
    "Empleado",
    "Área",
    "Día",
    "Fecha",
    "Horario original",
    "Horario final",
    "Horas normales",
    "Horas extra automáticas",
    "Horas extra manuales",
    "Total horas extra",
    "Motivo / nota",
    "Advertencia descanso",
  ];
  const body = rows.map((row) =>
    [
      row.employeeName,
      row.area,
      row.day,
      row.date,
      row.originalSchedule,
      row.finalSchedule,
      row.normalHours,
      row.automaticOvertime,
      row.manualOvertime,
      row.totalOvertime,
      row.note,
      row.restWarning,
    ]
      .map(csvCell)
      .join(","),
  );

  return [headers.join(","), ...body].join("\n");
}

function dailyReportRowToPlainObject(row: DailyReportRow) {
  return {
    "Empleado": row.employeeName,
    "Área": row.area,
    "Día": row.day,
    "Fecha": row.date,
    "Horario original": row.originalSchedule,
    "Horario final": row.finalSchedule,
    "Horas normales": row.normalHours,
    "Horas extra automáticas": row.automaticOvertime,
    "Horas extra manuales": row.manualOvertime,
    "Total horas extra": row.totalOvertime,
    "Motivo / nota": row.note,
    "Advertencia descanso": row.restWarning,
  };
}

const emptyDailyReportRow: DailyReportRow = {
  employeeId: "",
  employeeName: "",
  area: "Caja",
  day: "",
  date: "",
  originalSchedule: "",
  finalSchedule: "",
  normalHours: 0,
  automaticOvertime: 0,
  manualOvertime: 0,
  totalOvertime: 0,
  note: "",
  restWarning: "",
};

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
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
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toOptionalNumber(value: string) {
  if (value === "") {
    return undefined;
  }

  return Number(value);
}

type DbShiftTemplate = {
  id: string;
  name: string;
  schedule_text: string;
  start1: string;
  end1: string;
  start2: string | null;
  end2: string | null;
  total_hours: number;
  applies_to: DayKind[];
  allowed_areas: Area[];
  active: boolean;
};

type DbEmployee = {
  id: string;
  name: string;
  primary_area: Area;
  secondary_areas: Area[];
  employee_type: Employee["type"];
  day_off: DayKey;
  base_shift_template_id: string;
  note: string | null;
  active: boolean;
  normal_hourly_rate: number | null;
  overtime_hourly_rate: number | null;
};

type DbHoliday = {
  id: string;
  holiday_date: string;
  name: string;
  active: boolean;
};

type DbSchedule = {
  id: string;
  schedule_date: string;
  week_start: string;
  day_kind: DayKind;
  is_strong_sales_day: boolean;
  generated_at: string;
};

type DbScheduleAssignment = {
  id: string;
  schedule_id: string;
  assignment_date: string;
  employee_id: string;
  area: Area;
  shift_template_id: string;
  cash_register: CashRegister | null;
  note: string | null;
  manual: boolean;
  custom_start1: string | null;
  custom_end1: string | null;
  custom_start2: string | null;
  custom_end2: string | null;
  custom_total_hours: number | null;
  custom_schedule_text: string | null;
};

type DbPaymentSettings = {
  id: string;
  daily_normal_hours: number;
  weekly_normal_hours: number;
  overtime_alert_hours: number;
  default_cash_registers: number;
  weekend_cash_registers: number;
  strong_day_cash_registers: number;
};

function dbTemplateToApp(row: DbShiftTemplate): ShiftTemplate {
  return {
    id: row.id,
    name: row.name,
    scheduleText: row.schedule_text,
    start1: toInputTime(row.start1),
    end1: toInputTime(row.end1),
    start2: row.start2 ? toInputTime(row.start2) : undefined,
    end2: row.end2 ? toInputTime(row.end2) : undefined,
    totalHours: Number(row.total_hours),
    appliesTo: row.applies_to ?? [],
    allowedAreas: row.allowed_areas ?? [],
    active: row.active,
  };
}

function dbEmployeeToApp(row: DbEmployee): Employee {
  return {
    id: row.id,
    name: row.name,
    primaryArea: row.primary_area,
    secondaryAreas: row.secondary_areas ?? [],
    type: row.employee_type,
    dayOff: row.day_off,
    baseShiftTemplateId: row.base_shift_template_id,
    note: row.note ?? "",
    active: row.active,
    normalHourlyRate: row.normal_hourly_rate ?? undefined,
    overtimeHourlyRate: row.overtime_hourly_rate ?? undefined,
  };
}

function dbHolidayToApp(row: DbHoliday): Holiday {
  return {
    id: row.id,
    date: row.holiday_date,
    name: row.name,
    active: row.active,
  };
}

function dbAssignmentToApp(row: DbScheduleAssignment): ScheduleAssignment {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    date: row.assignment_date,
    employeeId: row.employee_id,
    area: row.area,
    shiftTemplateId: row.shift_template_id,
    cashRegister: row.cash_register ?? undefined,
    note: row.note ?? undefined,
    manual: row.manual,
    customStart1: row.custom_start1 ?? undefined,
    customEnd1: row.custom_end1 ?? undefined,
    customStart2: row.custom_start2 ?? undefined,
    customEnd2: row.custom_end2 ?? undefined,
    customTotalHours: row.custom_total_hours !== null ? Number(row.custom_total_hours) : undefined,
    customScheduleText: row.custom_schedule_text ?? undefined,
  };
}

function dbSettingsToApp(row: DbPaymentSettings): PaymentSettings {
  return {
    dailyNormalHours: Number(row.daily_normal_hours),
    weeklyNormalHours: Number(row.weekly_normal_hours),
    overtimeAlertHours: Number(row.overtime_alert_hours),
    defaultCashRegisters: row.default_cash_registers,
    weekendCashRegisters: row.weekend_cash_registers,
    strongDayCashRegisters: row.strong_day_cash_registers,
  };
}

function appTemplateToDb(template: ShiftTemplate) {
  return {
    id: template.id,
    name: template.name,
    schedule_text: template.scheduleText,
    start1: template.start1,
    end1: template.end1,
    start2: template.start2 || null,
    end2: template.end2 || null,
    total_hours: template.totalHours,
    applies_to: template.appliesTo,
    allowed_areas: template.allowedAreas,
    active: template.active,
  };
}

function appEmployeeToDb(employee: Employee) {
  return {
    id: employee.id,
    name: employee.name,
    primary_area: employee.primaryArea,
    secondary_areas: employee.secondaryAreas,
    employee_type: employee.type,
    day_off: employee.dayOff,
    base_shift_template_id: employee.baseShiftTemplateId || null,
    note: employee.note || null,
    active: employee.active,
    normal_hourly_rate: employee.normalHourlyRate ?? null,
    overtime_hourly_rate: employee.overtimeHourlyRate ?? null,
  };
}

function appHolidayToDb(holiday: Holiday) {
  return {
    id: holiday.id,
    holiday_date: holiday.date,
    name: holiday.name,
    active: holiday.active,
  };
}

function appScheduleToDb(schedule: DailySchedule) {
  return {
    id: schedule.id,
    schedule_date: schedule.date,
    week_start: schedule.weekStart,
    day_kind: schedule.dayKind,
    is_strong_sales_day: schedule.isStrongSalesDay,
    generated_at: schedule.generatedAt,
  };
}

function appAssignmentToDb(assignment: ScheduleAssignment) {
  return {
    id: assignment.id,
    schedule_id: assignment.scheduleId,
    assignment_date: assignment.date,
    employee_id: assignment.employeeId,
    area: assignment.area,
    shift_template_id: assignment.shiftTemplateId,
    cash_register: assignment.cashRegister ?? null,
    note: assignment.note ?? null,
    manual: assignment.manual,
    custom_start1: assignment.customStart1 ?? null,
    custom_end1: assignment.customEnd1 ?? null,
    custom_start2: assignment.customStart2 ?? null,
    custom_end2: assignment.customEnd2 ?? null,
    custom_total_hours: assignment.customTotalHours ?? null,
    custom_schedule_text: assignment.customScheduleText ?? null,
  };
}

function appSettingsToDb(settings: PaymentSettings) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    daily_normal_hours: settings.dailyNormalHours,
    weekly_normal_hours: settings.weeklyNormalHours,
    overtime_alert_hours: settings.overtimeAlertHours,
    default_cash_registers: settings.defaultCashRegisters,
    weekend_cash_registers: settings.weekendCashRegisters,
    strong_day_cash_registers: settings.strongDayCashRegisters,
  };
}

function toInputTime(value: string) {
  return value.slice(0, 5);
}

const panelClass = "rounded-lg border border-stone-200 bg-white p-4";
const sectionHeaderClass =
  "mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const sectionTitleClass = "text-xl font-bold tracking-normal";
const eyebrowClass = "text-xs font-bold uppercase tracking-[0.16em] text-emerald-700";
const inputClass =
  "min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-stone-100 disabled:text-stone-400";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-800 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800";
const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50";
const iconButton =
  "inline-grid size-10 place-items-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800";
const segmentedButton =
  "min-h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:border-emerald-200 hover:bg-emerald-50";
const segmentedActiveButton =
  "min-h-10 rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-bold text-white";
const tableClass =
  "w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm [&_td]:border-b [&_td]:border-stone-100 [&_td]:px-3 [&_td]:py-3 [&_th]:border-b [&_th]:border-stone-200 [&_th]:px-3 [&_th]:py-3 [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-stone-500";
const tagClass =
  "inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800";
const tagMutedClass =
  "inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-600";
