/**
 * capacitor-bell.ts
 *
 * Android bell scheduling via @capacitor/local-notifications.
 *
 * How it works
 * ────────────
 * • Each time settings or periods change, scheduleAndroidBells() cancels every
 *   pending notification and schedules fresh exact alarms for the next 14 days.
 * • On Android 12+ the plugin calls AlarmManager.setExactAndAllowWhileIdle,
 *   which fires even in Doze mode — matching or exceeding Expo's reliability.
 * • Foreground audio (while the WebView is open) is handled by the existing
 *   useWebBellScheduler — it uses Web Audio API which works inside Capacitor's
 *   WebView just like a regular browser.
 *
 * Rules
 * ─────
 * • Empty cells (no subjectId) are never scheduled.
 * • Only days listed in activeDays are scheduled (respects school calendar).
 * • Past events are always skipped.
 * • End bell only fires when endEnabled === true.
 * • 14-day window means the app only needs to open once per fortnight to
 *   stay current. Self-healing: each notification tap triggers a reschedule
 *   that extends the window forward.
 *
 * Required Android permissions (add to AndroidManifest.xml):
 *   SCHEDULE_EXACT_ALARM   (Android 12 / API 31+)
 *   USE_EXACT_ALARM        (Android 13 / API 33+)
 *   RECEIVE_BOOT_COMPLETED (reschedule after reboot)
 *   POST_NOTIFICATIONS     (Android 13+)
 *   VIBRATE
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { BellSettings } from "./bell-store";
import type { TodayPeriod } from "./web-bell-scheduler";

// ── Detection ─────────────────────────────────────────────────────────────

/** True only when running inside a Capacitor Android container (the APK). */
export function isCapacitorAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// ── Extended period type ──────────────────────────────────────────────────

export interface SchedulePeriod extends TodayPeriod {
  dayOfWeek: number;
  subjectId?: number | null;
  subjectName?: string | null;
}

// ── Alarm channel ─────────────────────────────────────────────────────────

const CHANNEL_ID = "bellcraft-alarm";

/**
 * Creates (or recreates) the dedicated alarm channel on Android.
 * Safe to call on every launch — Capacitor is idempotent for existing channels.
 */
export async function setupAndroidChannel(): Promise<void> {
  if (!isCapacitorAndroid()) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "جرس الحصة 🔔",
      importance: 5, // IMPORTANCE_MAX
      sound: "classic_bell",
      vibration: true,
      visibility: 1, // VISIBILITY_PUBLIC (shows on lock-screen)
      lights: true,
      lightColor: "#FF1e3a8a",
    });
  } catch (e) {
    console.warn("[capacitor-bell] createChannel:", e);
  }
}

// ── Permissions ───────────────────────────────────────────────────────────

export async function requestCapacitorBellPermissions(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false;
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === "granted";
  } catch {
    return false;
  }
}

// ── Notification ID scheme ────────────────────────────────────────────────
// Deterministic, collision-free:
//   ID = dayOffset × 10_000 + periodId × 4 + bellTypeIndex
//   dayOffset:    0–13  (14-day window)
//   periodId:     0–2499 (2499 × 4 = 9996 < 10_000)
//   bellTypeIndex: 0=pre-start, 1=start, 2=pre-end, 3=end
//   Max ID = 13 × 10_000 + 9_999 = 139_999 (fits in 32-bit int)

const BELL_TYPE_IDX = { "pre-start": 0, start: 1, "pre-end": 2, end: 3 } as const;
type BellType = keyof typeof BELL_TYPE_IDX;

function makeNotifId(dayOffset: number, periodId: number, bellType: BellType): number {
  return dayOffset * 10_000 + periodId * 4 + BELL_TYPE_IDX[bellType];
}

// ── Core scheduler ────────────────────────────────────────────────────────

const DAYS_AHEAD = 14;

/**
 * Cancels all pending bell notifications and re-schedules for the next
 * DAYS_AHEAD days.
 *
 * Called automatically by useCapacitorBellScheduler whenever settings,
 * periods, or active schedule change.
 */
export async function scheduleAndroidBells(
  allPeriods: SchedulePeriod[],
  activeDays: number[],
  settings: BellSettings,
): Promise<void> {
  if (!isCapacitorAndroid()) return;

  const safeAllPeriods: SchedulePeriod[] = Array.isArray(allPeriods) ? allPeriods : [];
  const safeActiveDays: number[] = Array.isArray(activeDays) ? activeDays : [];
  allPeriods = safeAllPeriods;   // eslint-disable-line no-param-reassign
  activeDays = safeActiveDays;   // eslint-disable-line no-param-reassign

  // ── Cancel existing ───────────────────────────────────────────────────
  try {
    const { notifications: pending } = await LocalNotifications.getPending();
    if (pending.length > 0) {
      await LocalNotifications.cancel({ notifications: pending });
    }
  } catch (e) {
    console.warn("[capacitor-bell] cancel:", e);
  }

  if (!settings.autoRing || settings.vacationMode) return;
  if (!allPeriods.length) return;

  const now = Date.now();
  type Notif = Parameters<typeof LocalNotifications.schedule>[0]["notifications"][number];
  const toSchedule: Notif[] = [];

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const target = new Date();
    target.setDate(target.getDate() + offset);
    target.setSeconds(0, 0);

    const dow = target.getDay(); // 0=Sun … 6=Sat

    // Skip non-school days
    if (activeDays.length > 0 && !activeDays.includes(dow)) continue;

    const dayPeriods = allPeriods.filter(
      (p) => p.dayOfWeek === dow && !!p.subjectId,
    );
    if (!dayPeriods.length) continue;

    for (const p of dayPeriods) {
      const name = p.subjectName ?? p.label ?? "الحصة";
      const [sh, sm] = p.startTime.split(":").map(Number);
      const [eh, em] = p.endTime.split(":").map(Number);

      const startAt = new Date(target);
      startAt.setHours(sh, sm, 0, 0);

      const endAt = new Date(target);
      endAt.setHours(eh, em, 0, 0);

      const extra = {
        periodId: p.id,
        dayOfWeek: dow,
        startTime: p.startTime,
        endTime: p.endTime,
      };

      // 1 — Pre-start bell
      if (settings.preStartEnabled) {
        const lead = (settings.leadTimeMin ?? 2) * 60_000;
        const at = new Date(startAt.getTime() - lead);
        if (at.getTime() > now) {
          toSchedule.push({
            id: makeNotifId(offset, p.id, "pre-start"),
            title: "🔔 تنبيه قبل الحصة",
            body: `${name} تبدأ خلال ${settings.leadTimeMin ?? 2} دقيقة`,
            schedule: { at, allowWhileIdle: true },
            channelId: CHANNEL_ID,
            extra: { ...extra, bellType: "pre-start" },
          });
        }
      }

      // 2 — Pre-end bell
      if (settings.preEndEnabled) {
        const before = (settings.preEndMinBefore ?? 5) * 60_000;
        const at = new Date(endAt.getTime() - before);
        if (at.getTime() > now) {
          toSchedule.push({
            id: makeNotifId(offset, p.id, "pre-end"),
            title: "🔔 قريباً — نهاية الحصة",
            body: `${name} تنتهي خلال ${settings.preEndMinBefore ?? 5} دقيقة`,
            schedule: { at, allowWhileIdle: true },
            channelId: CHANNEL_ID,
            extra: { ...extra, bellType: "pre-end" },
          });
        }
      }

      // 4 — Period end bell (only when user explicitly enabled)
      if (settings.endEnabled && endAt.getTime() > now) {
        toSchedule.push({
          id: makeNotifId(offset, p.id, "end"),
          title: "🔔 نهاية الحصة",
          body: `انتهت حصة ${name}`,
          schedule: { at: endAt, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          extra: { ...extra, bellType: "end" },
        });
      }
    }
  }

  if (toSchedule.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications: toSchedule });
    } catch (e) {
      console.warn("[capacitor-bell] schedule:", e);
    }
  }
}

/**
 * Schedules a quick test notification 1 minute from now.
 * Useful for verifying the notification channel is working.
 */
export async function scheduleTestBell(): Promise<Date> {
  if (!isCapacitorAndroid()) throw new Error("Not running on Capacitor Android");
  await setupAndroidChannel();
  const at = new Date(Date.now() + 60_000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 999_999,
        title: "🔔 اختبار الجرس — BellCraft",
        body: "الجرس يعمل حتى مع إغلاق التطبيق ✅",
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: { bellType: "test" },
      },
    ],
  });
  return at;
}
