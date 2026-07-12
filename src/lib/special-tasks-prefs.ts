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
      return { ...DEFAULT_STORE, ...parsed };
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
  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();
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
