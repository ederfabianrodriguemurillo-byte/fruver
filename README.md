# Fruver Turnos

Aplicación web responsive para administrar turnos diarios y semanales de Caja, Pedidos y Domicilios en un fruver. Incluye CRUD de empleados, plantillas de turnos, generador editable, mensaje listo para WhatsApp, festivos de Colombia, descansos, historial semanal y reporte de horas extra con descarga CSV/Excel.

## Stack

- Next.js App Router con TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Vercel

## Correr localmente

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Para validar producción:

```bash
npm run lint
npm run build
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores si vas a conectar Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

La interfaz funciona con seed inicial y persistencia local del navegador. Si las variables de Supabase están configuradas, en `Configuración` puedes importar desde PostgreSQL o guardar el estado actual en las tablas.

## Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/migrations/001_initial_schema.sql` en el SQL editor o con Supabase CLI.
3. Ejecuta `supabase/seed.sql` para cargar turnos, empleados, festivos 2026 y configuración inicial.
4. Configura las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Tablas incluidas:

- `employees`
- `shift_templates`
- `schedules`
- `schedule_assignments`
- `holidays`
- `overtime_reports`
- `payment_settings`

## Deploy en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel, importa el proyecto.
3. Agrega las variables de entorno de Supabase si aplica.
4. Build command: `npm run build`
5. Output: Next.js default

Vercel detecta Next.js automáticamente.

## Módulos

- Inicio: métricas, alertas e historial de semanas.
- Empleados: CRUD con área principal, áreas secundarias, tipo, descanso, turno base, notas, estado y valores de hora.
- Turnos: CRUD de plantillas con horarios partidos o continuos, horas calculadas, áreas y tipos de día.
- Generar: mañana, semana completa o fecha específica; edición manual por día.
- WhatsApp: mensaje agrupado por área y horario, con caja entre paréntesis y descansos al final.
- Reportes: horas normales, horas extra, alerta semanal y exportación CSV/Excel.
- Configuración: reglas de horas, número de cajas y festivos.
