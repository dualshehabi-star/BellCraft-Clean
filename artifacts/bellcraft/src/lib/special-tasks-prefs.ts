/**
 * Special Tasks Alert — data layer.
 *
 * Replaces the single "special duty" alert with an unlimited task list.
 * Each task has its own date, time, ringtone, duration, and alarm ID.
 *
 * Alarm IDs are in the range [SPECIAL_TASK_ALARM_BASE, SPECIAL_TASK_ALARM_BASE + numericId].
 * School bell alarms top out at ~1,400,000; we start at 9,000,000 to avoid any collision.
 */
import { useState, useEffect, useCallback } from "react";

export const SPECIAL_TASK_ALARM_BASE = 9_000_000;
const STORAGE_KEY = "bellcraft_special_tasks_v2";
const COUNTER_KEY = "bellcraft_st_counter";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpecialTaskRepeatType = "once" | "daily" | "specific-days";

export type SpecialTask = {
  id: string;           // UUID — stable across edits
  numericId: number;    // integer used as AlarmManager request code
  name: string;
  enabled: boolean;
  date: string;         // "YYYY-MM-DD"
  time: string;         // "HH:MM"
  bellSound: string;    // BellSound key
  durationSec: number;
  repeatCount: number;
  repeatType: SpecialTaskRepeatType;
  repeatDays: number[]; // Sunday=0 … Saturday=6; used by "specific-days"
  completed: boolean;   // true once alarm has fired
};

export type SpecialTasksStore = {
  tasks: SpecialTask[];
  autoDeleteCompleted: boolean; // global: remove task after it fires, vs keep it
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_STORE: SpecialTasksStore = {
  tasks: [],
  autoDeleteCompleted: false,
};

// ── Custom sound key helpers ───────────────────────────────────────────────────

export function taskSoundKey(id: string): string {
  return `bellcraft_task_sound_${id}`;
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the next local-time occurrence for a task. Repeating tasks use
 * `date` as their start date and continue indefinitely after that date.
 */
export function getNextSpecialTaskOccurrence(
  task: Pick<SpecialTask, "date" | "time" | "repeatType" | "repeatDays">,
  after = new Date(),
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(task.date ?? "");
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(task.time ?? "");
  if (!dateMatch || !timeMatch) return null;

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;

  const start = new Date(year, month, day, hour, minute, 0, 0);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month ||
    start.getDate() !== day
  ) return null;

  const repeatType = task.repeatType ?? "once";
  if (repeatType === "once") return start.getTime() > after.getTime() ? start : null;

  const repeatDays = Array.isArray(task.repeatDays)
    ? [...new Set(task.repeatDays.filter(value => Number.isInteger(value) && value >= 0 && value <= 6))]
    : [];
  if (repeatType === "specific-days" && repeatDays.length === 0) return null;

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate());
  if (today.getTime() > cursor.getTime()) cursor.setTime(today.getTime());

  // A daily task needs at most one day; a weekly task needs at most seven.
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(cursor);
    candidate.setHours(hour, minute, 0, 0);
    const dayMatches = repeatType === "daily" || repeatDays.includes(candidate.getDay());
    if (dayMatches && candidate.getTime() > after.getTime()) return candidate;
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// ── Persistent counter (gives each task a unique numeric alarm ID) ────────────

function nextNumericId(): number {
  try {
    const cur = parseInt(localStorage.getItem(COUNTER_KEY) ?? "0", 10) || 0;
    const next = cur + 1;
    localStorage.setItem(COUNTER_KEY, String(next));
    return next;
  } catch {
    return Date.now() % 1_000_000; // fallback: unlikely to collide
  }
}

// ── I/O ───────────────────────────────────────────────────────────────────────

export function readTasksStore(): SpecialTasksStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SpecialTasksStore>;
      const tasks = Array.isArray(parsed.tasks)
        ? parsed.tasks.map(task => {
            const legacyTask = task as SpecialTask & {
              repeatType?: SpecialTaskRepeatType;
              repeatDays?: number[];
            };
            const repeatType: SpecialTaskRepeatType =
              legacyTask.repeatType === "daily" || legacyTask.repeatType === "specific-days"
                ? legacyTask.repeatType
                : "once";
            return {
              ...legacyTask,
              repeatType,
              repeatDays: Array.isArray(legacyTask.repeatDays)
                ? [...new Set(legacyTask.repeatDays.filter(value => Number.isInteger(value) && value >= 0 && value <= 6))]
                : [],
            };
          })
        : [];
      return { ...DEFAULT_STORE, ...parsed, tasks };
    }
  } catch {}
  return { ...DEFAULT_STORE };
}

export function writeTasksStore(store: SpecialTasksStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bellcraft:special-tasks-changed"));
    }
  } catch {}
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function makeNewTask(): SpecialTask {
  const now   = new Date();
  const today = localDateString(now);
  const hh    = String(now.getHours()).padStart(2, "0");
  const mm    = String(now.getMinutes()).padStart(2, "0");
  return {
    id:          crypto.randomUUID(),
    numericId:   nextNumericId(),
    name:        "",
    enabled:     false,
    date:        today,
    time:        `${hh}:${mm}`,
    bellSound:   "classic",
    durationSec: 10,
    repeatCount: 1,
    repeatType:  "once",
    repeatDays:  [],
    completed:   false,
  };
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useSpecialTasksStore() {
  const [store, setStore] = useState<SpecialTasksStore>(readTasksStore);

  useEffect(() => {
    const handler = () => setStore(readTasksStore());
    window.addEventListener("bellcraft:special-tasks-changed", handler);
    return () => window.removeEventListener("bellcraft:special-tasks-changed", handler);
  }, []);

  const _write = (next: SpecialTasksStore) => {
    writeTasksStore(next);
    setStore(next);
  };

  const updateStore = useCallback((patch: Partial<SpecialTasksStore>) => {
    setStore(prev => {
      const next = { ...prev, ...patch };
      writeTasksStore(next);
      return next;
    });
  }, []);

  const addTask = useCallback((task: SpecialTask) => {
    setStore(prev => {
      const next: SpecialTasksStore = { ...prev, tasks: [...prev.tasks, task] };
      writeTasksStore(next);
      return next;
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<SpecialTask>) => {
    setStore(prev => {
      const next: SpecialTasksStore = {
        ...prev,
        tasks: prev.tasks.map(t => t.id === id ? { ...t, ...patch } : t),
      };
      writeTasksStore(next);
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    // Remove custom sound data too
    try {
      localStorage.removeItem(taskSoundKey(id));
      localStorage.removeItem(`${taskSoundKey(id)}_name`);
    } catch {}
    setStore(prev => {
      const next: SpecialTasksStore = { ...prev, tasks: prev.tasks.filter(t => t.id !== id) };
      writeTasksStore(next);
      return next;
    });
  }, []);

  void _write; // suppress unused warning

  return { store, updateStore, addTask, updateTask, deleteTask };
}
