/**
 * local-route-handler.ts
 *
 * Intercepts every /api/* fetch call and serves it from localStorage.
 * The app works 100% offline — no server, no network required for CRUD.
 *
 * Push-notification routes (/api/push/*) are NOT intercepted and still
 * require a network connection (they are optional server-side features).
 *
 * All data is stored under device-scoped localStorage keys so each device
 * still sees only its own data (consistent with the previous isolation model).
 */

// ---------------------------------------------------------------------------
// Storage key factory
// ---------------------------------------------------------------------------

const key = (deviceId: string, table: string) =>
  `bellcraft_${deviceId}_local_${table}`;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function lsRead<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(k: string, value: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch { /* storage full — silent */ }
}

function nextId(deviceId: string): number {
  const k = key(deviceId, "next_id");
  const n = lsRead<number>(k, 1);
  lsWrite(k, n + 1);
  return n;
}

// ---------------------------------------------------------------------------
// Data interfaces (mirror API schemas exactly)
// ---------------------------------------------------------------------------

interface Schedule {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  activeDays: number[];
  createdAt: string;
  updatedAt?: string | null;
}

interface Subject {
  id: number;
  name: string;
  color: string;
  teacher?: string | null;
  createdAt: string;
}

interface Period {
  id: number;
  scheduleId: number;
  subjectId?: number | null;
  subjectName?: string | null;
  subjectColor?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  alertMinutesBefore: number;
  createdAt: string;
}

interface AppSettings {
  id: number;
  bellSound: string;
  volume: number;
  autoRing: boolean;
  vacationMode: boolean;
  leadTimeMin: number;
  ringDurationSec: number;
  maxVolume: boolean;
  preStartEnabled: boolean;
  preStartRepeat: number;
  preEndEnabled: boolean;
  preEndMinBefore: number;
  preEndSound: string;
  preEndDurationSec: number;
  preEndRepeat: number;
  endEnabled: boolean;
  endSound: string;
  endDurationSec: number;
  endRepeat: number;
}

// ---------------------------------------------------------------------------
// Default settings (mirrors server defaults)
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  bellSound: "school-bell",
  volume: 80,
  autoRing: true,
  vacationMode: false,
  leadTimeMin: 5,
  ringDurationSec: 3,
  maxVolume: false,
  preStartEnabled: false,
  preStartRepeat: 1,
  preEndEnabled: false,
  preEndMinBefore: 5,
  preEndSound: "school-bell",
  preEndDurationSec: 3,
  preEndRepeat: 1,
  endEnabled: true,
  endSound: "school-bell",
  endDurationSec: 3,
  endRepeat: 1,
};

// ---------------------------------------------------------------------------
// Per-device accessors
// ---------------------------------------------------------------------------

const getSchedules = (d: string) => lsRead<Schedule[]>(key(d, "schedules"), []);
const saveSchedules = (d: string, v: Schedule[]) => lsWrite(key(d, "schedules"), v);

const getSubjects = (d: string) => lsRead<Subject[]>(key(d, "subjects"), []);
const saveSubjects = (d: string, v: Subject[]) => lsWrite(key(d, "subjects"), v);

const getPeriods = (d: string) => lsRead<Period[]>(key(d, "periods"), []);
const savePeriods = (d: string, v: Period[]) => lsWrite(key(d, "periods"), v);

const getSettings = (d: string): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...lsRead<Partial<AppSettings>>(key(d, "settings"), {}),
});
const saveSettings = (d: string, v: AppSettings) => lsWrite(key(d, "settings"), v);

// ---------------------------------------------------------------------------
// Dashboard computation
// ---------------------------------------------------------------------------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function computeDashboard(deviceId: string) {
  const schedules = getSchedules(deviceId);
  const subjects  = getSubjects(deviceId);
  const allPeriods = getPeriods(deviceId);
  const activeSchedule = schedules.find(s => s.isActive) ?? null;

  const now     = new Date();
  const todayDow = now.getDay();
  const nowMin  = now.getHours() * 60 + now.getMinutes();

  const subMap = new Map(subjects.map(s => [s.id, s]));
  const enrich = (p: Period): Period => {
    const sub = p.subjectId ? subMap.get(p.subjectId) : undefined;
    return { ...p, subjectName: sub?.name ?? null, subjectColor: sub?.color ?? null };
  };

  let todayPeriods: Period[] = [];
  let currentPeriod: Period | null = null;
  let nextPeriod: Period | null = null;
  let totalPeriods = 0;

  if (activeSchedule) {
    const schedPeriods = allPeriods.filter(p => p.scheduleId === activeSchedule.id);
    totalPeriods = schedPeriods.length;
    todayPeriods = schedPeriods
      .filter(p => p.dayOfWeek === todayDow)
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime))
      .map(enrich);

    for (const p of todayPeriods) {
      if (nowMin >= toMin(p.startTime) && nowMin < toMin(p.endTime)) {
        currentPeriod = p;
        break;
      }
    }
    const afterRef = currentPeriod
      ? toMin(currentPeriod.endTime)
      : nowMin;
    nextPeriod = todayPeriods.find(p => toMin(p.startTime) > afterRef) ?? null;
  }

  return {
    totalSchedules: schedules.length,
    totalSubjects:  subjects.length,
    totalPeriods,
    activeSchedule,
    todayPeriods,
    currentPeriod,
    nextPeriod,
  };
}

// ---------------------------------------------------------------------------
// Mock Response factory
// ---------------------------------------------------------------------------

function res(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function res404(msg = "Not found"): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Call this from customFetch before making a real network request.
 *
 * @param method     HTTP method (uppercase)
 * @param rawUrl     Full URL or path-only string after applyBaseUrl()
 * @param body       Parsed request body (already JSON.parse'd)
 * @param deviceId   Current device UUID from localStorage
 * @returns          A Response to return immediately, or null to fall through to fetch()
 */
export function localRouteHandler(
  method: string,
  rawUrl: string,
  body: unknown,
  deviceId: string | null,
): Response | null {
  // Extract just the pathname (works for both "/api/x" and "https://host/api/x")
  let pathname: string;
  try {
    pathname = rawUrl.startsWith("/") ? rawUrl : new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }

  // Strip query string and trailing slash
  const path = pathname.split("?")[0].replace(/\/$/, "");
  const m    = method.toUpperCase();

  // Only intercept /api/* routes
  if (!path.startsWith("/api/")) return null;

  // Push notifications — always go to network
  if (path.startsWith("/api/push")) return null;

  // Need a device ID for all data operations (except healthz)
  const d = deviceId ?? "default";

  // ── Health ────────────────────────────────────────────────────────────────
  if (path === "/api/healthz") return res({ status: "ok" });

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (path === "/api/dashboard" && m === "GET") {
    return res(computeDashboard(d));
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  if (path === "/api/settings") {
    if (m === "GET") return res(getSettings(d));
    if (m === "PUT") {
      const updated = { ...getSettings(d), ...(body as Partial<AppSettings>) };
      saveSettings(d, updated);
      return res(updated);
    }
  }

  // ── Schedules list ────────────────────────────────────────────────────────
  if (path === "/api/schedules") {
    if (m === "GET") return res(getSchedules(d));
    if (m === "POST") {
      const inp = body as { name: string; description?: string; activeDays?: number[] };
      const s: Schedule = {
        id:          nextId(d),
        name:        inp.name,
        description: inp.description ?? null,
        isActive:    false,
        activeDays:  inp.activeDays ?? [],
        createdAt:   new Date().toISOString(),
        updatedAt:   null,
      };
      saveSchedules(d, [...getSchedules(d), s]);
      return res(s, 201);
    }
  }

  // ── Schedule :id ──────────────────────────────────────────────────────────
  const scheduleById = path.match(/^\/api\/schedules\/(\d+)$/);
  if (scheduleById) {
    const id = Number(scheduleById[1]);
    const list = getSchedules(d);
    const idx  = list.findIndex(s => s.id === id);
    if (m === "GET") return idx >= 0 ? res(list[idx]) : res404();
    if (m === "PATCH") {
      if (idx < 0) return res404();
      list[idx] = { ...list[idx], ...(body as Partial<Schedule>), updatedAt: new Date().toISOString() };
      saveSchedules(d, list);
      return res(list[idx]);
    }
    if (m === "DELETE") {
      if (idx < 0) return res404();
      saveSchedules(d, list.filter(s => s.id !== id));
      savePeriods(d, getPeriods(d).filter(p => p.scheduleId !== id));
      return res({});
    }
  }

  // ── Activate schedule ─────────────────────────────────────────────────────
  const activateMatch = path.match(/^\/api\/schedules\/(\d+)\/activate$/);
  if (activateMatch && m === "PATCH") {
    const id = Number(activateMatch[1]);
    const list = getSchedules(d).map(s => ({ ...s, isActive: s.id === id }));
    saveSchedules(d, list);
    const found = list.find(s => s.id === id);
    return found ? res(found) : res404();
  }

  // ── Copy schedule ─────────────────────────────────────────────────────────
  const copyMatch = path.match(/^\/api\/schedules\/(\d+)\/copy$/);
  if (copyMatch && m === "POST") {
    const id  = Number(copyMatch[1]);
    const orig = getSchedules(d).find(s => s.id === id);
    if (!orig) return res404();
    const copy: Schedule = {
      ...orig,
      id:        nextId(d),
      name:      `نسخة من ${orig.name}`,
      isActive:  false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    saveSchedules(d, [...getSchedules(d), copy]);
    const origPeriods = getPeriods(d).filter(p => p.scheduleId === id);
    const copiedPeriods: Period[] = origPeriods.map(p => ({
      ...p, id: nextId(d), scheduleId: copy.id, createdAt: new Date().toISOString(),
    }));
    savePeriods(d, [...getPeriods(d), ...copiedPeriods]);
    return res(copy, 201);
  }

  // ── Clear subject assignments on schedule ─────────────────────────────────
  const clearSubjectsMatch = path.match(/^\/api\/schedules\/(\d+)\/subjects$/);
  if (clearSubjectsMatch && m === "DELETE") {
    const id = Number(clearSubjectsMatch[1]);
    savePeriods(d, getPeriods(d).map(p =>
      p.scheduleId === id
        ? { ...p, subjectId: null, subjectName: null, subjectColor: null }
        : p
    ));
    return res({});
  }

  // ── Periods for a schedule ────────────────────────────────────────────────
  const periodsForSched = path.match(/^\/api\/schedules\/(\d+)\/periods$/);
  if (periodsForSched) {
    const scheduleId = Number(periodsForSched[1]);
    const subMap = new Map(getSubjects(d).map(s => [s.id, s]));
    const enrich = (p: Period): Period => {
      const sub = p.subjectId ? subMap.get(p.subjectId) : undefined;
      return { ...p, subjectName: sub?.name ?? null, subjectColor: sub?.color ?? null };
    };

    if (m === "GET") {
      const periods = getPeriods(d)
        .filter(p => p.scheduleId === scheduleId)
        .sort((a, b) =>
          a.dayOfWeek !== b.dayOfWeek
            ? a.dayOfWeek - b.dayOfWeek
            : toMin(a.startTime) - toMin(b.startTime)
        )
        .map(enrich);
      return res(periods);
    }
    if (m === "POST") {
      const inp = body as {
        subjectId?: number; dayOfWeek: number;
        startTime: string; endTime: string;
        label?: string; alertMinutesBefore?: number;
      };
      const sub = inp.subjectId ? subMap.get(inp.subjectId) : undefined;
      const p: Period = {
        id:                nextId(d),
        scheduleId,
        subjectId:         inp.subjectId ?? null,
        subjectName:       sub?.name ?? null,
        subjectColor:      sub?.color ?? null,
        dayOfWeek:         inp.dayOfWeek,
        startTime:         inp.startTime,
        endTime:           inp.endTime,
        label:             inp.label ?? null,
        alertMinutesBefore: inp.alertMinutesBefore ?? 5,
        createdAt:         new Date().toISOString(),
      };
      savePeriods(d, [...getPeriods(d), p]);
      return res(p, 201);
    }
    if (m === "DELETE") {
      savePeriods(d, getPeriods(d).filter(p => p.scheduleId !== scheduleId));
      return res({});
    }
  }

  // ── Period :id ────────────────────────────────────────────────────────────
  const periodById = path.match(/^\/api\/periods\/(\d+)$/);
  if (periodById) {
    const id     = Number(periodById[1]);
    const list   = getPeriods(d);
    const idx    = list.findIndex(p => p.id === id);
    if (m === "PATCH") {
      if (idx < 0) return res404();
      const upd    = body as Partial<Period>;
      const subMap = new Map(getSubjects(d).map(s => [s.id, s]));
      const merged: Period = { ...list[idx], ...upd };
      if (upd.subjectId !== undefined) {
        const sub = upd.subjectId ? subMap.get(upd.subjectId) : undefined;
        merged.subjectName  = sub?.name  ?? null;
        merged.subjectColor = sub?.color ?? null;
      }
      list[idx] = merged;
      savePeriods(d, list);
      return res(list[idx]);
    }
    if (m === "DELETE") {
      if (idx < 0) return res404();
      savePeriods(d, list.filter(p => p.id !== id));
      return res({});
    }
  }

  // ── Subjects list ─────────────────────────────────────────────────────────
  if (path === "/api/subjects") {
    if (m === "GET")  return res(getSubjects(d));
    if (m === "POST") {
      const inp = body as { name: string; color: string; teacher?: string };
      const s: Subject = {
        id:        nextId(d),
        name:      inp.name,
        color:     inp.color,
        teacher:   inp.teacher ?? null,
        createdAt: new Date().toISOString(),
      };
      saveSubjects(d, [...getSubjects(d), s]);
      return res(s, 201);
    }
  }

  // ── Subject :id ───────────────────────────────────────────────────────────
  const subjectById = path.match(/^\/api\/subjects\/(\d+)$/);
  if (subjectById) {
    const id   = Number(subjectById[1]);
    const list = getSubjects(d);
    const idx  = list.findIndex(s => s.id === id);
    if (m === "PATCH") {
      if (idx < 0) return res404();
      const upd = body as Partial<Subject>;
      list[idx] = { ...list[idx], ...upd };
      saveSubjects(d, list);
      // Cascade subject name/color into periods
      if (upd.name !== undefined || upd.color !== undefined) {
        savePeriods(d, getPeriods(d).map(p =>
          p.subjectId === id
            ? { ...p, subjectName: list[idx].name, subjectColor: list[idx].color }
            : p
        ));
      }
      return res(list[idx]);
    }
    if (m === "DELETE") {
      if (idx < 0) return res404();
      saveSubjects(d, list.filter(s => s.id !== id));
      savePeriods(d, getPeriods(d).map(p =>
        p.subjectId === id
          ? { ...p, subjectId: null, subjectName: null, subjectColor: null }
          : p
      ));
      return res({});
    }
  }

  // Unknown /api/* route — fall through to network
  return null;
}
