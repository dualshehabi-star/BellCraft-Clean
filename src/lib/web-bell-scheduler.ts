/**
 * useWebBellScheduler
 *
 * Fires the school bell (via Web Audio API) while the browser tab is open and
 * the user has unlocked audio by tapping the "Enable Bell Sound" button.
 *
 * Limitations vs. the Android APK:
 *  - Browsers throttle JS timers when the tab is hidden or the screen is locked.
 *  - Therefore, bells may be delayed or missed if the user leaves the tab.
 *  - The APK (Expo) uses scheduled system notifications that bypass this limitation.
 */

import { useEffect, useRef } from "react";
import { startBellLoop, CUSTOM_SOUND_KEYS, type BellSound } from "./audio";
import type { BellSettings } from "./bell-store";
import { getDisabledPeriodAlertIds } from "./period-alert-prefs";
import { readDutyAlertSettings, DUTY_CUSTOM_SOUND_KEY } from "./duty-alert-prefs";
import {
  readSpecialDutySettings,
  writeSpecialDutySettings,
  SPECIAL_DUTY_CUSTOM_SOUND_KEY,
} from "./special-duty-prefs";

function getCustomDataUrl(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function asBellSound(s: string | null | undefined): BellSound {
  return (s ?? "classic") as BellSound;
}

export interface TodayPeriod {
  id: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  subjectId?: number | null;
  subjectName?: string | null;
  label?: string | null;
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

export function useWebBellScheduler(
  audioUnlocked: boolean,
  todayPeriods: TodayPeriod[],
  settings: BellSettings,
) {
  const firedRef = useRef<Set<string>>(new Set());
  const lastDayRef = useRef<string>("");
  // Record the second the scheduler first mounted — never fire bells that
  // were already due before we started (prevents phantom rings on page reload).
  const startTimeRef = useRef(nowSec());

  // When the tab comes back from hidden, advance the guard so we don't fire
  // bells that ended while the user was away.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) {
        startTimeRef.current = nowSec();
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

    const schedulerStart = startTimeRef.current;

    const tick = () => {
      resetIfNewDay();
      const ns = nowSec();
      const day = todayStamp();

      for (const p of todayPeriods) {
        // No subject assigned → empty / free cell, do not ring.
        // Number() coerces null/undefined/""/"0" to 0, making the check
        // type-safe regardless of how the API serialises an absent subjectId.
        if (!(Number(p.subjectId) > 0)) continue;
        const startSec = timeStrToSec(p.startTime);
        const endSec = timeStrToSec(p.endTime);

        // ── 1. Pre-start bell ────────────────────────────────────────────────
        if (settings.preStartEnabled) {
          const lead = (settings.leadTimeMin ?? 2) * 60;
          const target = startSec - lead;
          const key = `pre-${p.id}-${day}`;
          if (target >= schedulerStart && ns >= target && ns <= target + WINDOW_SEC && !firedRef.current.has(key)) {
            firedRef.current.add(key);
            const disabledIds = getDisabledPeriodAlertIds();
            if (!disabledIds.has(p.id)) {
              const sound = asBellSound(settings.bellSound);
              startBellLoop(
                sound,
                settings.volume,
                settings.ringDurationSec,
                {
                  maxVolume: settings.maxVolume ?? false,
                  repeatCount: settings.preStartRepeat ?? 1,
                  customDataUrl: sound === "custom"
                    ? getCustomDataUrl(CUSTOM_SOUND_KEYS.preStart)
                    : undefined,
                },
              );
            }
          }
        }

        // ── 2. Pre-end bell ──────────────────────────────────────────────────
        if (settings.preEndEnabled) {
          const before = (settings.preEndMinBefore ?? 5) * 60;
          const target = endSec - before;
          const key = `pre-end-${p.id}-${day}`;
          if (target >= schedulerStart && ns >= target && ns <= target + WINDOW_SEC && !firedRef.current.has(key)) {
            firedRef.current.add(key);
            const sound = asBellSound(settings.preEndSound);
            startBellLoop(
              sound,
              settings.volume,
              settings.preEndDurationSec ?? settings.ringDurationSec,
              {
                maxVolume: settings.maxVolume ?? false,
                repeatCount: settings.preEndRepeat ?? 1,
                customDataUrl: sound === "custom"
                  ? getCustomDataUrl(CUSTOM_SOUND_KEYS.preEnd)
                  : undefined,
              },
            );
          }
        }

        // ── 3. Period end bell ───────────────────────────────────────────────
        if (settings.endEnabled) {
          const key = `end-${p.id}-${day}`;
          if (endSec >= schedulerStart && ns >= endSec && ns <= endSec + WINDOW_SEC && !firedRef.current.has(key)) {
            firedRef.current.add(key);
            const sound = asBellSound(settings.endSound);
            startBellLoop(
              sound,
              settings.volume,
              settings.endDurationSec ?? settings.ringDurationSec,
              {
                maxVolume: settings.maxVolume ?? false,
                repeatCount: settings.endRepeat ?? 1,
                customDataUrl: sound === "custom"
                  ? getCustomDataUrl(CUSTOM_SOUND_KEYS.end)
                  : undefined,
              },
            );
          }
        }
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [audioUnlocked, todayPeriods, settings]);
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
) {
  const firedRef = useRef<Set<string>>(new Set());
  const lastDayRef = useRef<string>("");
  const startTimeRef = useRef(nowSec());

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) startTimeRef.current = nowSec();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!audioUnlocked) return;

    const schedulerStart = startTimeRef.current;

    const tick = () => {
      const stamp = todayStamp();
      if (stamp !== lastDayRef.current) {
        lastDayRef.current = stamp;
        firedRef.current.clear();
      }

      const duty = readDutyAlertSettings();
      if (!duty.enabled || globalSettings.vacationMode) return;

      const ns = nowSec();
      const todayDow = new Date().getDay();
      const customDataUrl =
        (typeof localStorage !== "undefined" ? localStorage.getItem(DUTY_CUSTOM_SOUND_KEY) : null) ?? undefined;

      for (let idx = 0; idx < 2; idx++) {
        const shift = duty.shifts[idx];
        if (shift.dayOfWeek !== todayDow || !shift.startTime) continue;
        const target = timeStrToSec(shift.startTime);
        const key = `duty-${idx}-${stamp}`;
        if (target >= schedulerStart && ns >= target && ns <= target + WINDOW_SEC && !firedRef.current.has(key)) {
          firedRef.current.add(key);
          startBellLoop(
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
  }, [audioUnlocked, globalSettings]);
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
  const firedRef     = useRef(false);
  const startTimeRef = useRef(nowSec());

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) startTimeRef.current = nowSec();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Reset fired guard whenever audio gets unlocked (new page load)
  useEffect(() => {
    firedRef.current = false;
  }, [audioUnlocked]);

  useEffect(() => {
    if (!audioUnlocked) return;

    const schedulerStart = startTimeRef.current;

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
        targetS >= schedulerStart &&
        nowS >= targetS &&
        nowS <= targetS + WINDOW_SEC &&
        !firedRef.current
      ) {
        firedRef.current = true;
        const sound = asBellSound(sd.bellSound);
        const dur   = sd.durationSec === 3600 ? 3600 : sd.durationSec;
        const customDataUrl =
          sound === "custom"
            ? (typeof localStorage !== "undefined"
                ? localStorage.getItem(SPECIAL_DUTY_CUSTOM_SOUND_KEY) ?? undefined
                : undefined)
            : undefined;
        startBellLoop(sound, globalSettings.volume, dur, {
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
