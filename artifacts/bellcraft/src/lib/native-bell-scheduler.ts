/**
 * native-bell-scheduler.ts
 *
 * JavaScript bridge for the native Android BellSchedulerPlugin.
 *
 * The plugin schedules exact AlarmManager alarms that fire BellRingerService
 * (a ForegroundService using MediaPlayer with USAGE_ALARM). The native path
 * is designed for a closed app / locked screen and restores saved alarms on
 * reboot. Actual background delivery depends on Android permissions, OEM
 * restrictions and the system alarm volume / DND policy; verify on a device.
 *
 * Alarm types per period (each independently enabled/disabled by settings):
 *   start      — fires at startTime when class bells are enabled
 *   pre-start  — fires (leadTimeMin or per-period alertMinutesBefore) before startTime (if preStartEnabled)
 *   pre-end    — fires preEndMinBefore minutes before endTime for enabled periods
 *   end        — fires exactly at endTime (if endEnabled)
 *
 * Empty periods (no subjectId assigned) are always skipped.
 */

import { registerPlugin } from "@capacitor/core";
import {
  getDisabledPeriodAlertIds,
  getDisabledPreEndPeriodAlertIds,
  getDisabledEndPeriodAlertIds,
} from "./period-alert-prefs";
import type { DutyAlertSettings } from "./duty-alert-prefs";
import { DUTY_CUSTOM_SOUND_KEY } from "./duty-alert-prefs";
import { CUSTOM_SOUND_KEYS } from "./audio";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NativeAlarm {
  /** Unique integer ID (used as AlarmManager request code). */
  id: number;
  /** Unix timestamp in milliseconds — must be in the future. */
  timestamp: number;
  /** Human-readable label shown in the foreground notification. */
  label: string;
  /** Volume 0–1. Uses USAGE_ALARM stream (bypasses silent mode). */
  volume: number;
  /** How many seconds to ring. */
  durationSec: number;
  /** How many times to repeat the sound file. */
  repeatCount: number;
  /**
   * Android res/raw filename (without extension).
   * Defaults to "classic_bell" if absent or unrecognised.
   */
  soundFile?: string;
  /**
   * The subjectId of the period this alarm belongs to.
   *   > 0   → valid period with an assigned subject — ring normally.
   *   === 0 → empty/free slot (should be filtered in JS, but native
   *            will also block it as a second line of defence).
   *   absent/undefined → special alarm (duty, test) — always ring.
   */
  subjectId?: number;
  /** Used by the native receiver to recheck individual pre-start/pre-end preferences. */
  periodId?: number;
  bellType?: "start" | "pre-start" | "pre-end" | "end";
  /** Weekly wall-clock recurrence, rearmed natively after each occurrence. */
  weeklyDay?: number;
  localTime?: string;
  localDate?: string;
  customSoundData?: string;
  /** Persistent special-task recurrence metadata; used by Android to rearm after each fire. */
  taskId?: string;
  taskRepeatType?: "once" | "daily" | "specific-days";
  taskRepeatDays?: number[];
  taskDate?: string;
  taskTime?: string;
}

interface BellSchedulerPlugin {
  getAlarmPermissions(): Promise<{ exactAlarm: boolean; notifications: boolean }>;
  getCompletedAlarms(): Promise<{ occurrences: { taskId?: string; alarmId: number; timestamp: number }[] }>;
  scheduleAlarms(options: {
    alarms: NativeAlarm[];
    disabledPreStart?: number[];
    disabledPreEnd?: number[];
    disabledEnd?: number[];
  }): Promise<{ scheduled: number }>;
  cancelAll(): Promise<void>;
  setDisabledPeriodAlertIds(options: { periodIds: number[] }): Promise<void>;
  setDisabledPreEndPeriodAlertIds(options: { periodIds: number[] }): Promise<void>;
  getScheduledCount(): Promise<{ count: number }>;
  /** Push period data to the home-screen widget (Android only). */
  updateWidgetData(options: {
    periodsJson: string;
    activeDaysJson: string;
  }): Promise<void>;
  /** Save a base64 PNG to the device gallery (Android only). */
  saveImageToGallery(options: { base64: string; fileName: string }): Promise<void>;
  /** Open the native share sheet with a PNG image (Android only). */
  shareImageFile(options: { base64: string; fileName: string }): Promise<void>;
  /** Save PNG to internal storage and refresh the timetable image widget (Android only). */
  setTimetableWidgetImage(options: { base64: string }): Promise<void>;
}

// ── Web stub (no-op for browser / SSR) ────────────────────────────────────

class BellSchedulerWeb implements BellSchedulerPlugin {
  getAlarmPermissions() { return Promise.resolve({ exactAlarm: false, notifications: false }); }
  getCompletedAlarms() { return Promise.resolve({ occurrences: [] }); }
  scheduleAlarms(_opts: { alarms: NativeAlarm[] }) {
    return Promise.resolve({ scheduled: 0 });
  }
  cancelAll() { return Promise.resolve(); }
  setDisabledPeriodAlertIds(_opts: { periodIds: number[] }) { return Promise.resolve(); }
  setDisabledPreEndPeriodAlertIds(_opts: { periodIds: number[] }) { return Promise.resolve(); }
  getScheduledCount() { return Promise.resolve({ count: 0 }); }
  updateWidgetData(_opts: { periodsJson: string; activeDaysJson: string }) {
    return Promise.resolve();
  }
  saveImageToGallery(_opts: { base64: string; fileName: string }) {
    return Promise.resolve();
  }
  shareImageFile(_opts: { base64: string; fileName: string }) {
    return Promise.resolve();
  }
  setTimetableWidgetImage(_opts: { base64: string }) {
    return Promise.resolve();
  }
}

// ── Plugin instance ────────────────────────────────────────────────────────
// Use a globalThis singleton so Vite HMR module re-evaluation doesn't call
// registerPlugin() a second time (Capacitor warns and ignores duplicates).

const _gk = "__capacitorBellScheduler__" as const;
type G = typeof globalThis & { [_gk]?: BellSchedulerPlugin };

const BellScheduler: BellSchedulerPlugin = (globalThis as G)[_gk] ?? (() => {
  const p = registerPlugin<BellSchedulerPlugin>("BellScheduler", {
    web: async () => new BellSchedulerWeb(),
  });
  (globalThis as G)[_gk] = p;
  return p;
})();

export const getNativeAlarmPermissions = () => BellScheduler.getAlarmPermissions();
export const getNativeCompletedAlarms = () => BellScheduler.getCompletedAlarms();

// ── Public types ───────────────────────────────────────────────────────────

export type SchedulePeriod = {
  id: number;
  dayOfWeek: number;
  startTime: string;           // "HH:MM"
  endTime: string;             // "HH:MM"
  name?: string | null;
  subjectId?: number | null;   // null/undefined → empty slot, skip it
  alertMinutesBefore?: number; // per-period override (0 = exact start time)
  label?: string | null;
};

export type NativeBellSettings = {
  autoRing?: boolean;
  vacationMode?: boolean;
  volume?: number;
  maxVolume?: boolean;
  ringDurationSec?: number;
  // Sound selection — mapped to res/raw filenames by toNativeSoundFile()
  bellSound?: string;        // main start / pre-start sound
  preEndSound?: string;
  endSound?: string;
  // Pre-start bell
  preStartEnabled?: boolean;
  preStartRepeat?: number;
  leadTimeMin?: number;        // minutes before startTime for the pre-start alarm
  // Pre-end bell
  preEndEnabled?: boolean;
  preEndMinBefore?: number;
  preEndDurationSec?: number;
  preEndRepeat?: number;
  // End bell
  endEnabled?: boolean;
  endDurationSec?: number;
  endRepeat?: number;
};

// ── Alarm ID scheme ────────────────────────────────────────────────────────
// Each (dayOffset, period, bellType) triple maps to a deterministic ID so
// that cancelAll + re-schedule never leaves duplicate alarms.
//
//   id = dayOffset × 100_000 + periodId × 4 + bellTypeIndex
//   dayOffset    : 0–13    (14-day window)
//   periodId     : 0–24999 (fits in 5 digits × 4 = 99_996 < 100_000)
//   bellTypeIndex: 0=start, 1=pre-start, 2=pre-end, 3=end
//   Max id       : 13 × 100_000 + 99_999 = 1_399_999  (fits in 32-bit int)

const BTYPE = { start: 0, preStart: 1, preEnd: 2, end: 3 } as const;

function alarmId(dayOffset: number, periodId: number, type: keyof typeof BTYPE): number {
  return dayOffset * 100_000 + periodId * 4 + BTYPE[type];
}

// ── Helper: convert "HH:MM" + a base date to a UTC timestamp ──────────────
// Uses arithmetic on the timestamp to avoid the JS Date#setHours quirk where
// negative minutes silently roll back into the previous day.

function toTimestamp(baseDate: Date, hhmm: string, offsetMs = 0): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return NaN;
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.getTime() - offsetMs;
}

/**
 * Map a JS BellSound key to the corresponding Android res/raw filename
 * (without extension). All files must exist in res/raw/.
 *
 * 'classic'  → classic_bell   (R.raw.classic_bell)
 * 'chime'    → chime          (R.raw.chime)
 * 'gentle'      → neptune        (R.raw.neptune)
 * 'musical'     → musical_bell   (R.raw.musical_bell)
 * 'alarm'       → alarm_bell     (R.raw.alarm_bell)
 * 'school_bell' → school_bell    (R.raw.school_bell  — WAV, high quality)
 * 'custom'      → classic_bell   (data-URL can't be passed to native service)
 */
export function toNativeSoundFile(bellSound?: string | null): string {
  switch (bellSound) {
    case "chime":       return "chime";
    case "gentle":      return "neptune";
    case "musical":     return "musical_bell";
    case "alarm":       return "alarm_bell";
    case "school-bell":
    case "school_bell": return "school_bell";
    default:            return "classic_bell";
  }
}

export function nativeCustomSound(sound: string | undefined, key: string): Pick<NativeAlarm, "customSoundData"> {
  if (sound !== "custom") return {};
  const data = localStorage.getItem(key);
  if (!data) throw new Error("CUSTOM_SOUND_MISSING");
  return { customSoundData: data };
}

/** Separate request-code range; school bells end below 1.4M and task alarms start at 9M. */
export const DUTY_ALARM_ID_BASE = 8_000_000;

/**
 * Build exact alarms for the two configured duty shifts over the same rolling
 * window as the school bells. Each shift is tied to its selected timetable
 * period so edits to that period's start time are reflected on the next build.
 */
export function buildNativeDutyAlarms(
  duty: DutyAlertSettings,
  bellSettings: Pick<NativeBellSettings, "vacationMode" | "volume" | "maxVolume">,
  periods: SchedulePeriod[],
  activeDays: number[],
  daysAhead = 14,
  now = Date.now(),
): NativeAlarm[] {
  if (!duty?.enabled) return [];

  const activeDaySet = new Set(Array.isArray(activeDays) ? activeDays : []);
  const periodsById = new Map(
    (Array.isArray(periods) ? periods : []).map((period) => [period.id, period]),
  );
  const shifts = Array.isArray(duty.shifts) ? duty.shifts : [];
  const alarms: NativeAlarm[] = [];
  const count = Number.isFinite(daysAhead) ? Math.min(7, Math.max(0, Math.floor(daysAhead))) : 7;

  for (let dayOffset = 0; dayOffset < count; dayOffset++) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);
    const dow = day.getDay();
    if (!activeDaySet.has(dow)) continue;

    for (let idx = 0; idx < 2; idx++) {
      const shift = shifts[idx];
      if (!shift || shift.dayOfWeek !== dow || shift.periodId == null) continue;

      const period = periodsById.get(shift.periodId);
      if (!period || period.dayOfWeek !== dow || !period.startTime) continue;
      const [hours, minutes] = period.startTime.split(":").map(Number);
      if (
        !Number.isInteger(hours) || hours < 0 || hours > 23 ||
        !Number.isInteger(minutes) || minutes < 0 || minutes > 59
      ) continue;

      const timestamp = toTimestamp(day, period.startTime);
      let nextTimestamp = timestamp;
      if (nextTimestamp <= now) {
        const next = new Date(timestamp);
        next.setDate(next.getDate() + 7);
        nextTimestamp = next.getTime();
      }

      alarms.push({
        id: DUTY_ALARM_ID_BASE + idx,
        timestamp: nextTimestamp,
        weeklyDay: dow,
        localTime: period.startTime,
        label: idx === 0 ? "🔔 تنبيه المناوبة — الفسحة الأولى" : "🔔 تنبيه المناوبة — الفسحة الثانية",
        volume: bellSettings.maxVolume ? 1.0 : (bellSettings.volume ?? 1.0),
        durationSec: duty.ringDurationSec ?? 6,
        repeatCount: duty.repeatCount ?? 1,
        soundFile: toNativeSoundFile(duty.bellSound),
        ...nativeCustomSound(duty.bellSound, DUTY_CUSTOM_SOUND_KEY),
      });
    }
  }

  return alarms;
}

// ── Core scheduler ─────────────────────────────────────────────────────────

/**
 * Build the alarm list and schedule them via the native plugin.
 *
 * @param periods    All periods in the active schedule (all days).
 * @param activeDays Which days-of-week (0=Sun … 6=Sat) are active.
 * @param settings   Bell settings (volume, duration, enabled flags …).
 * @param daysAhead  How many days forward to schedule (default: 14).
 */
export const SPECIAL_DUTY_ALARM_ID = 999_997;

export function buildNativeBellAlarms(
  periods: SchedulePeriod[],
  activeDays: number[],
  settings: NativeBellSettings,
  daysAhead = 14,
  extraAlarms: NativeAlarm[] = [],
  now = Date.now(),
): NativeAlarm[] {
  // Normalize to arrays in case callers pass corrupted / unexpected data.
  const safePeriods: SchedulePeriod[] = Array.isArray(periods) ? periods : [];
  const safeActiveDays: number[] = Array.isArray(activeDays) ? activeDays : [];
  periods = safePeriods;       // eslint-disable-line no-param-reassign
  activeDays = safeActiveDays; // eslint-disable-line no-param-reassign

  const disabledPeriodAlertIds = getDisabledPeriodAlertIds();
  const disabledPreEndPeriodAlertIds = getDisabledPreEndPeriodAlertIds();
  const disabledEndIds = getDisabledEndPeriodAlertIds();
  const allAlarms: NativeAlarm[] = [];

  // ── Extra alerts (special tasks and duty shifts) ────────────────────────
  // These schedule independently of vacation mode and autoRing. Special-task
  // recurrences rearm natively after each occurrence.
  for (const extra of extraAlarms) {
    if (extra.timestamp > now) allAlarms.push(extra);
  }

  // ── School bells (only when enabled and not in vacation mode) ────────────
  if (settings.autoRing && !settings.vacationMode && periods.length && activeDays.length) {
    const volume      = settings.maxVolume         ? 1.0 : (settings.volume       ?? 1.0);
    const durSec      = settings.ringDurationSec   ?? 6;
    const startRepeat = settings.preStartRepeat    ?? 1;
    const preEndDur   = settings.preEndDurationSec ?? durSec;
    const preEndRpt   = settings.preEndRepeat      ?? 1;
    const endDur      = settings.endDurationSec    ?? durSec;
    const endRpt      = settings.endRepeat         ?? 1;

    const mainSoundFile   = toNativeSoundFile(settings.bellSound);
    const preEndSoundFile = toNativeSoundFile(settings.preEndSound);
    const endSoundFile    = toNativeSoundFile(settings.endSound);

    for (let dayOffset = 0; dayOffset < Math.min(7, daysAhead); dayOffset++) {
      const base = new Date(now);
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + dayOffset);
      const dow = base.getDay();

      if (!activeDays.includes(dow)) continue;

      for (const period of periods) {
        if (period.dayOfWeek !== dow) continue;

        const subjectId = Number(period.subjectId);
        if (!(subjectId > 0)) continue;

        if (period.label?.match(/فسحة|break|استراحة/i)) continue;
        if (!/^\d{2}:\d{2}$/.test(period.startTime) || !/^\d{2}:\d{2}$/.test(period.endTime)) continue;
        const pLabel = `🔔 ${period.name ?? period.label ?? "جرس الحصة"}`;
        const pId    = period.id;
        const startTs = toTimestamp(base, period.startTime ?? "00:00");
        let endTs   = toTimestamp(base, period.endTime   ?? "00:00");
        if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs === startTs) continue;
        if (endTs < startTs) {
          const nextDay = new Date(endTs);
          nextDay.setDate(nextDay.getDate() + 1);
          endTs = nextDay.getTime();
        }
        const add = (alarm: NativeAlarm) => {
          let occurrence = new Date(alarm.timestamp);
          const weeklyDay = occurrence.getDay();
          const localTime = `${String(occurrence.getHours()).padStart(2, "0")}:${String(occurrence.getMinutes()).padStart(2, "0")}`;
          if (occurrence.getTime() <= now) {
            occurrence.setDate(occurrence.getDate() + 7);
          }
          allAlarms.push({ ...alarm, id: allAlarms.filter(a => a.periodId != null).length + 1,
            timestamp: occurrence.getTime(), weeklyDay, localTime });
        };
        // Exact start is independent of both advance warnings.
        add({
          id: alarmId(dayOffset, pId, "start"), timestamp: startTs,
          label: pLabel, volume, durationSec: durSec, repeatCount: 1,
          soundFile: mainSoundFile, subjectId, periodId: pId, bellType: "start",
          ...nativeCustomSound(settings.bellSound, CUSTOM_SOUND_KEYS.preStart),
        });

        if (settings.preStartEnabled && !disabledPeriodAlertIds.has(pId)) {
          const leadMin =
            period.alertMinutesBefore != null && period.alertMinutesBefore >= 0
              ? period.alertMinutesBefore
              : (settings.leadTimeMin ?? 0);
          if (leadMin > 0) {
            const ts = startTs - leadMin * 60_000;
              if (ts < startTs) {
                add({
                id: alarmId(dayOffset, pId, "preStart"),
                timestamp: ts, label: pLabel, volume,
                durationSec: durSec, repeatCount: startRepeat,
                soundFile: mainSoundFile, subjectId,
                periodId: pId, bellType: "pre-start",
                ...nativeCustomSound(settings.bellSound, CUSTOM_SOUND_KEYS.preStart),
              });
            }
          }
        }

        if (
          settings.preEndEnabled &&
          !disabledPreEndPeriodAlertIds.has(pId) &&
          (settings.preEndMinBefore ?? 0) > 0
        ) {
          const ts = endTs - (settings.preEndMinBefore ?? 5) * 60_000;
          if (ts >= startTs && ts < endTs) {
            add({
              id: alarmId(dayOffset, pId, "preEnd"),
              timestamp: ts,
              label: `⏰ ${period.name ? period.name : "نهاية الحصة قريبًا"}`,
              volume, durationSec: preEndDur, repeatCount: preEndRpt,
              soundFile: preEndSoundFile, subjectId,
              periodId: pId, bellType: "pre-end",
              ...nativeCustomSound(settings.preEndSound, CUSTOM_SOUND_KEYS.preEnd),
            });
          }
        }

        if (settings.endEnabled && !disabledEndIds.has(pId)) {
          add({
            id: alarmId(dayOffset, pId, "end"),
            timestamp: endTs,
            label: `🔔 نهاية ${period.name ? period.name : "الحصة"}`,
            volume, durationSec: endDur, repeatCount: endRpt,
            soundFile: endSoundFile, subjectId,
            periodId: pId, bellType: "end",
            ...nativeCustomSound(settings.endSound, CUSTOM_SOUND_KEYS.end),
          });
        }
      }
    }
  }

  return allAlarms;
}

let scheduleQueue: Promise<unknown> = Promise.resolve();

/** Same event plan as Android, constrained to due foreground occurrences. */
export function getDueSchoolBells(
  periods: SchedulePeriod[], activeDays: number[], settings: NativeBellSettings,
  now: number, startedAt: number,
): NativeAlarm[] {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return buildNativeBellAlarms(periods, activeDays, settings, 7, [], yesterday.getTime())
    .filter(alarm => alarm.timestamp >= startedAt && alarm.timestamp <= now &&
      now - alarm.timestamp <= 20_000);
}
export function scheduleNativeBells(
  periods: SchedulePeriod[], activeDays: number[], settings: NativeBellSettings,
  daysAhead = 14, extraAlarms: NativeAlarm[] = [],
): Promise<void> {
  const options = {
    alarms: buildNativeBellAlarms(periods, activeDays, settings, daysAhead, extraAlarms),
    disabledPreStart: [...getDisabledPeriodAlertIds()],
    disabledPreEnd: [...getDisabledPreEndPeriodAlertIds()],
    disabledEnd: [...getDisabledEndPeriodAlertIds()],
  };
  // One native replacement transaction, ordered across polling and local edits.
  const work = scheduleQueue.then(async () => {
    await BellScheduler.scheduleAlarms(options);
  });
  scheduleQueue = work.catch(() => {});
  return work;
}

export async function cancelNativeBells(): Promise<void> {
  try {
    await BellScheduler.cancelAll();
  } catch (err) {
    console.error("[BellScheduler] cancelAll failed:", err);
  }
}

/**
 * Save a PNG image (base64 string) to the device gallery via the native plugin.
 *
 * On Android this writes to Pictures/BellCraft/ using MediaStore (API 29+)
 * or direct file write + MediaScanner (API < 29). No-op in the browser.
 */
export async function saveNativeImage(base64: string, fileName: string): Promise<void> {
  try {
    await BellScheduler.saveImageToGallery({ base64, fileName });
  } catch (err) {
    console.error("[BellScheduler] saveImageToGallery failed:", err);
    throw err;
  }
}

/**
 * Open the Android native share sheet with a PNG image.
 *
 * Writes the image to the app cache dir, then fires Intent.ACTION_SEND so
 * the user can choose any installed app (WhatsApp, email, Drive, etc.).
 * No-op in the browser.
 */
export async function shareNativeImage(base64: string, fileName: string): Promise<void> {
  try {
    await BellScheduler.shareImageFile({ base64, fileName });
  } catch (err) {
    console.error("[BellScheduler] shareImageFile failed:", err);
    throw err;
  }
}

/**
 * Save a timetable PNG (base64) to internal storage and refresh the
 * TimetableWidgetProvider home-screen widget.
 *
 * Call this every time the user captures the schedule grid so the widget
 * always shows the latest image. No-op outside the native Android container.
 */
export async function setTimetableWidgetImage(base64: string): Promise<void> {
  try {
    await BellScheduler.setTimetableWidgetImage({ base64 });
  } catch (err) {
    console.error("[BellScheduler] setTimetableWidgetImage failed:", err);
  }
}

/**
 * Push the active schedule's period data to the Android home-screen widget.
 *
 * Call this whenever the active schedule, periods, or activeDays change so
 * the widget shows up-to-date information immediately.
 *
 * No-op when running in the browser or outside the native Android container.
 */
export async function saveWidgetData(
  periods: SchedulePeriod[],
  activeDays: number[],
): Promise<void> {
  try {
    await BellScheduler.updateWidgetData({
      periodsJson:   JSON.stringify(periods),
      activeDaysJson: JSON.stringify(activeDays),
    });
  } catch (err) {
    console.error("[BellScheduler] updateWidgetData failed:", err);
  }
}
