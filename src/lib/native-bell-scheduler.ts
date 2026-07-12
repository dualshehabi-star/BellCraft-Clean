/**
 * native-bell-scheduler.ts
 *
 * JavaScript bridge for the native Android BellSchedulerPlugin.
 *
 * The plugin schedules exact AlarmManager alarms that fire BellRingerService
 * (a ForegroundService using MediaPlayer with USAGE_ALARM) — this plays the
 * bell sound even when:
 *   • The app is completely closed
 *   • The screen is locked
 *   • The device is in Silent or Do-Not-Disturb mode
 *   • Battery-saver / Doze mode is active
 *   • The device reboots (BellBootReceiver reschedules from saved data)
 *
 * Alarm types per period (each independently enabled/disabled by settings):
 *   pre-start  — fires (leadTimeMin or per-period alertMinutesBefore) before startTime (if preStartEnabled)
 *   pre-end    — fires preEndMinBefore minutes before endTime (if preEndEnabled)
 *   end        — fires exactly at endTime (if endEnabled)
 *
 * Empty periods (no subjectId assigned) are always skipped.
 */

import { registerPlugin } from "@capacitor/core";

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
}

interface BellSchedulerPlugin {
  scheduleAlarms(options: { alarms: NativeAlarm[] }): Promise<{ scheduled: number }>;
  cancelAll(): Promise<void>;
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
  scheduleAlarms(_opts: { alarms: NativeAlarm[] }) {
    return Promise.resolve({ scheduled: 0 });
  }
  cancelAll() { return Promise.resolve(); }
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

// ── Public types ───────────────────────────────────────────────────────────

export type SchedulePeriod = {
  id: number;
  dayOfWeek: number;
  startTime: string;           // "HH:MM"
  endTime: string;             // "HH:MM"
  name?: string | null;
  subjectId?: number | null;   // null/undefined → empty slot, skip it
  alertMinutesBefore?: number; // per-period override (0 = exact start time)
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
    case "school_bell": return "school_bell";
    default:            return "classic_bell";
  }
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

export async function scheduleNativeBells(
  periods: SchedulePeriod[],
  activeDays: number[],
  settings: NativeBellSettings,
  daysAhead = 14,
  extraAlarms: NativeAlarm[] = [],
): Promise<void> {
  // Normalize to arrays in case callers pass corrupted / unexpected data.
  const safePeriods: SchedulePeriod[] = Array.isArray(periods) ? periods : [];
  const safeActiveDays: number[] = Array.isArray(activeDays) ? activeDays : [];
  periods = safePeriods;       // eslint-disable-line no-param-reassign
  activeDays = safeActiveDays; // eslint-disable-line no-param-reassign

  // Always cancel first — ensures stale alarms are removed even when disabling.
  await BellScheduler.cancelAll().catch(() => {});

  const now = Date.now();
  const allAlarms: NativeAlarm[] = [];

  // ── Extra one-shot alarms (special tasks) ────────────────────────────────
  // These always schedule regardless of vacation mode or autoRing — they are
  // personal tasks independent of the school bell system.
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

    for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
      const base = new Date(now + dayOffset * 86_400_000);
      base.setHours(0, 0, 0, 0);
      const dow = base.getDay();

      if (!activeDays.includes(dow)) continue;

      for (const period of periods) {
        if (period.dayOfWeek !== dow) continue;

        const subjectId = Number(period.subjectId);
        if (!(subjectId > 0)) continue;

        const pLabel = period.name ? `🔔 ${period.name}` : "🔔 جرس الحصة";
        const pId    = period.id;
        const startTs = toTimestamp(base, period.startTime ?? "00:00");
        const endTs   = toTimestamp(base, period.endTime   ?? "00:00");

        if (settings.preStartEnabled) {
          const leadMin =
            period.alertMinutesBefore != null && period.alertMinutesBefore > 0
              ? period.alertMinutesBefore
              : (settings.leadTimeMin ?? 0);
          if (leadMin > 0) {
            const ts = startTs - leadMin * 60_000;
            if (ts > now) {
              allAlarms.push({
                id: alarmId(dayOffset, pId, "preStart"),
                timestamp: ts, label: pLabel, volume,
                durationSec: durSec, repeatCount: startRepeat,
                soundFile: mainSoundFile, subjectId,
              });
            }
          }
        }

        if (settings.preEndEnabled && (settings.preEndMinBefore ?? 0) > 0) {
          const ts = endTs - (settings.preEndMinBefore ?? 5) * 60_000;
          if (ts > now) {
            allAlarms.push({
              id: alarmId(dayOffset, pId, "preEnd"),
              timestamp: ts,
              label: `⏰ ${period.name ? period.name : "نهاية الحصة قريبًا"}`,
              volume, durationSec: preEndDur, repeatCount: preEndRpt,
              soundFile: preEndSoundFile, subjectId,
            });
          }
        }

        if (settings.endEnabled && endTs > now) {
          allAlarms.push({
            id: alarmId(dayOffset, pId, "end"),
            timestamp: endTs,
            label: `🔔 نهاية ${period.name ? period.name : "الحصة"}`,
            volume, durationSec: endDur, repeatCount: endRpt,
            soundFile: endSoundFile, subjectId,
          });
        }
      }
    }
  }

  if (allAlarms.length > 0) {
    try {
      const result = await BellScheduler.scheduleAlarms({ alarms: allAlarms });
      void result;
    } catch (err) {
      console.error("[BellScheduler] scheduleAlarms failed:", err);
    }
  }
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
