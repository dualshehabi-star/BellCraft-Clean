/**
 * useWebBellScheduler
 *
 * Fires the school bell (via Web Audio API) while the browser tab is open and
 * the user has unlocked audio by tapping the "Enable Bell Sound" button.
 *
 * Limitations vs. the Android APK:
 *  - Browsers throttle JS timers when the tab is hidden or the screen is locked.
 *  - Therefore, bells may be delayed or missed if the user leaves the tab.
 *  - The Capacitor Android build uses exact AlarmManager alarms and a native
 *    foreground service to play the sound without relying on browser timers.
 */

import { useEffect, useRef } from "react";
import { enqueueScheduledBell, CUSTOM_SOUND_KEYS, type BellSound } from "./audio";
import type { BellSettings } from "./bell-store";
import { getDueSchoolBells, type SchedulePeriod } from "./native-bell-scheduler";
import { buildNativeDutyAlarms } from "./native-bell-scheduler";
import type { NativeAlarm } from "./native-bell-scheduler";
import { readDutyAlertSettings, DUTY_CUSTOM_SOUND_KEY } from "./duty-alert-prefs";
import {
  readSpecialDutySettings,
  writeSpecialDutySettings,
  SPECIAL_DUTY_CUSTOM_SOUND_KEY,
} from "./special-duty-prefs";
import {
  getNextSpecialTaskOccurrence,
  localDateString,
  readTasksStore,
  taskSoundKey,
  writeTasksStore,
} from "./special-tasks-prefs";

function getCustomDataUrl(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function asBellSound(s: string | null | undefined): BellSound {
  return (s === "school-bell" ? "school_bell" : s ?? "classic") as BellSound;
}

export interface TodayPeriod {
  id: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  subjectId?: number | null;
  subjectName?: string | null;
  label?: string | null;
  alertMinutesBefore?: number;
}

function timeStrToSec(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + m * 60;
}

function nowSec(): number {
  const d = new Date();
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// How many seconds around a bell time we still consider "on time".
// Wide enough to survive a short background throttle; narrow enough that two
// distinct bell events (e.g. end-of-one & start-of-next) don't bleed together.
const WINDOW_SEC = 20;
const schoolOccurrences = new Set<string>();
let schoolOccurrenceDay = "";

/** Shared by the foreground timer and push delivery, so one event rings once. */
export function ringSchoolOccurrence(alarm: NativeAlarm, settings: BellSettings): void {
  const day = todayStamp();
  if (schoolOccurrenceDay !== day) {
    schoolOccurrenceDay = day;
    schoolOccurrences.clear();
  }
  const key = `${alarm.periodId}:${alarm.bellType}:${alarm.timestamp}`;
  if (schoolOccurrences.has(key)) return;
  schoolOccurrences.add(key);
  const sound = alarm.bellType === "end" ? settings.endSound
    : alarm.bellType === "pre-end" ? settings.preEndSound : settings.bellSound;
  enqueueScheduledBell(asBellSound(sound), alarm.volume, alarm.durationSec, {
    maxVolume: settings.maxVolume, repeatCount: alarm.repeatCount,
    customDataUrl: alarm.customSoundData,
  });
}

export function useWebBellScheduler(
  audioUnlocked: boolean,
  periods: SchedulePeriod[],
  settings: BellSettings,
  activeDays: number[],
) {
  const firedRef = useRef<Set<string>>(new Set());
  const lastDayRef = useRef<string>("");
  // Record the second the scheduler first mounted — never fire bells that
  // were already due before we started (prevents phantom rings on page reload).
  const startTimeRef = useRef(Date.now());

  // When the tab comes back from hidden, advance the guard so we don't fire
  // bells that ended while the user was away.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        startTimeRef.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    // Clear the fired-set at midnight (day stamp changes).
    const resetIfNewDay = () => {
      const stamp = todayStamp();
      if (stamp !== lastDayRef.current) {
        lastDayRef.current = stamp;
        firedRef.current.clear();
      }
    };

    if (!audioUnlocked || !settings.autoRing || settings.vacationMode) return;

    const tick = () => {
      resetIfNewDay();
      // The browser and APK now derive the same four independent event types,
      // including overnight classes, instead of maintaining divergent rules.
      for (const alarm of getDueSchoolBells(periods, activeDays, settings, Date.now(), startTimeRef.current)) {
        const key = `${alarm.periodId}:${alarm.bellType}:${alarm.timestamp}`;
        if (firedRef.current.has(key)) continue;
        firedRef.current.add(key);
        ringSchoolOccurrence(alarm, settings);
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [audioUnlocked, periods, settings, activeDays]);
}

// ── Duty-shift alert scheduler ───────────────────────────────────────────────
export interface AllPeriod {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  subjectName?: string | null;
}

export function useDutyAlertScheduler(
  audioUnlocked: boolean,
  globalSettings: BellSettings,
  periods: SchedulePeriod[],
  activeDays: number[],
) {
  const firedRef = useRef<Set<string>>(new Set());
  const lastDayRef = useRef<string>("");
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) startTimeRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!audioUnlocked) return;

    const tick = () => {
      const stamp = todayStamp();
      if (stamp !== lastDayRef.current) {
        lastDayRef.current = stamp;
        firedRef.current.clear();
      }

      const duty = readDutyAlertSettings();
      if (!duty.enabled) return;

      const now = Date.now();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const customDataUrl =
        (typeof localStorage !== "undefined" ? localStorage.getItem(DUTY_CUSTOM_SOUND_KEY) : null) ?? undefined;

      for (const alarm of buildNativeDutyAlarms(duty, globalSettings, periods, activeDays, 7, yesterday.getTime())) {
        const target = alarm.timestamp;
        const key = `duty-${alarm.id}-${target}`;
        if (target >= startTimeRef.current && now >= target && now <= target + WINDOW_SEC * 1000 && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          enqueueScheduledBell(
            asBellSound(duty.bellSound),
            globalSettings.volume,
            duty.ringDurationSec,
            { maxVolume: globalSettings.maxVolume ?? false, repeatCount: duty.repeatCount ?? 1, customDataUrl },
          );
        }
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [audioUnlocked, globalSettings, periods, activeDays]);
}

// ── Special Duty Alert scheduler ─────────────────────────────────────────────
/**
 * One-shot alarm: fires exactly once on the configured date + time,
 * then marks itself completed so it never re-fires.
 */
export function useSpecialDutyScheduler(
  audioUnlocked: boolean,
  globalSettings: BellSettings,
) {
  const firedRef     = useRef(new Set<number>());
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) startTimeRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Reset fired guard whenever audio gets unlocked (new page load)
  useEffect(() => {
    firedRef.current.clear();
  }, [audioUnlocked]);

  useEffect(() => {
    if (!audioUnlocked) return;

    const tick = () => {
      const sd = readSpecialDutySettings();
      if (!sd.enabled || sd.completed) return;
      if (!sd.date || !sd.time)        return;

      const targetMs = new Date(`${sd.date}T${sd.time}:00`).getTime();
      const nowMs    = Date.now();
      const nowS     = nowMs / 1_000;
      const targetS  = targetMs / 1_000;

      // Fire if we're within the WINDOW and haven't fired this session yet
      if (
        targetMs >= startTimeRef.current &&
        nowS >= targetS &&
        nowS <= targetS + WINDOW_SEC &&
        !firedRef.current.has(targetMs)
      ) {
        firedRef.current.add(targetMs);
        const sound = asBellSound(sd.bellSound);
        const dur   = sd.durationSec === 3600 ? 3600 : sd.durationSec;
        const customDataUrl =
          sound === "custom"
            ? (typeof localStorage !== "undefined"
                ? localStorage.getItem(SPECIAL_DUTY_CUSTOM_SOUND_KEY) ?? undefined
                : undefined)
            : undefined;
        enqueueScheduledBell(sound, globalSettings.volume, dur, {
          maxVolume:   globalSettings.maxVolume ?? false,
          repeatCount: sd.repeatCount ?? 1,
          customDataUrl,
        });
        // Auto-complete — disable so alarm never re-fires
        writeSpecialDutySettings({ ...sd, enabled: false, completed: true });
      }
    };

    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [audioUnlocked, globalSettings]);
}

// ── Special-task scheduler (web foreground only) ──────────────────────────────
/**
 * Web Audio can ring special tasks while the BellCraft tab is open and audio
 * has been unlocked. Android uses its exact native alarms instead.
 */
export function useWebSpecialTaskScheduler(
  audioUnlocked: boolean,
  globalSettings: BellSettings,
) {
  const firedRef = useRef<Set<string>>(new Set());
  const firedDayRef = useRef(localDateString());
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!audioUnlocked) return;

    const tick = () => {
      const now = Date.now();
      const day = localDateString(new Date(now));
      if (day !== firedDayRef.current) {
        firedDayRef.current = day;
        firedRef.current.clear();
      }

      const store = readTasksStore();
      for (const task of store.tasks) {
        if (!task.enabled || task.completed) continue;

        // Look back only far enough to tolerate interval drift. Never ring
        // tasks whose due time was already past when this tab opened.
        const occurrence = getNextSpecialTaskOccurrence(task, new Date(now - WINDOW_SEC * 1000));
        if (!occurrence) continue;
        const occurrenceMs = occurrence.getTime();
        if (
          occurrenceMs < startedAtRef.current ||
          occurrenceMs > now ||
          now - occurrenceMs > WINDOW_SEC * 1000
        ) continue;

        const occurrenceKey = `${task.id}:${occurrenceMs}`;
        if (firedRef.current.has(occurrenceKey)) continue;
        firedRef.current.add(occurrenceKey);

        const sound = asBellSound(task.bellSound);
        enqueueScheduledBell(
          sound,
          globalSettings.maxVolume ? 1 : globalSettings.volume,
          task.durationSec,
          {
            maxVolume: globalSettings.maxVolume ?? false,
            repeatCount: task.repeatCount ?? 1,
            customDataUrl: sound === "custom"
              ? getCustomDataUrl(taskSoundKey(task.id))
              : undefined,
          },
        );

        if (task.repeatType !== "daily" && task.repeatType !== "specific-days") {
          const latest = readTasksStore();
          const remaining = latest.autoDeleteCompleted
            ? latest.tasks.filter(item => item.id !== task.id)
            : latest.tasks.map(item => item.id === task.id
              ? { ...item, enabled: false, completed: true }
              : item);
          if (latest.autoDeleteCompleted) {
            try {
              localStorage.removeItem(taskSoundKey(task.id));
              localStorage.removeItem(`${taskSoundKey(task.id)}_name`);
            } catch {}
          }
          writeTasksStore({ ...latest, tasks: remaining });
        }
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [audioUnlocked, globalSettings]);
}
