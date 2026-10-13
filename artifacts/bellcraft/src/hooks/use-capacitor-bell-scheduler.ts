/**
 * useCapacitorBellScheduler
 *
 * Schedules exact Android alarms via the native BellSchedulerPlugin.
 *
 * The plugin fires BellRingerService (ForegroundService + MediaPlayer with
 * USAGE_ALARM). Background and reboot support must be verified on a real
 * device; permissions, OEM restrictions, alarm volume and DND still apply.
 *
 * No-op in the browser — web scheduling is handled by useWebBellScheduler.
 *
 * Scheduling layers:
 *   1. Data-driven  — any time periods / schedule / settings change
 *   2. App resume   — refresh data and restore the current alarm batch
 *
 * Widget data is pushed to the home-screen widget on every data-driven
 * reschedule so the countdown stays current.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { App } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboard,
  useGetSettings,
  useListPeriods,
  getListPeriodsQueryKey,
  getGetDashboardQueryKey,
  getGetSettingsQueryKey,
  type Schedule,
} from "@/lib/api-client";
import { isCapacitorAndroid } from "@/lib/capacitor-bell";
import {
  buildNativeDutyAlarms,
  scheduleNativeBells,
  saveWidgetData,
  toNativeSoundFile,
  nativeCustomSound,
  getNativeAlarmPermissions,
  getNativeCompletedAlarms,
  SPECIAL_DUTY_ALARM_ID,
  type SchedulePeriod,
  type NativeAlarm,
} from "@/lib/native-bell-scheduler";
import type { BellSettings } from "@/lib/bell-store";
import {
  readTasksStore,
  writeTasksStore,
  SPECIAL_TASK_ALARM_BASE,
  getNextSpecialTaskOccurrence,
  taskSoundKey,
} from "@/lib/special-tasks-prefs";
import { PERIOD_ALERT_PREFS_CHANGED_EVENT, getDisabledPeriodAlertIds, getDisabledPreEndPeriodAlertIds, getDisabledEndPeriodAlertIds } from "@/lib/period-alert-prefs";
import { readSpecialDutySettings, writeSpecialDutySettings, SPECIAL_DUTY_CUSTOM_SOUND_KEY } from "@/lib/special-duty-prefs";
import { CUSTOM_SOUND_KEYS } from "@/lib/audio";
import {
  readDutyAlertSettings,
  DUTY_ALERT_SETTINGS_CHANGED_EVENT,
  DUTY_CUSTOM_SOUND_KEY,
} from "@/lib/duty-alert-prefs";

const COOLDOWN_MS = 10 * 60 * 1_000;

export function useCapacitorBellScheduler() {
  const qc               = useQueryClient();
  const lastScheduledRef = useRef(0);
  const lastSignatureRef = useRef("");

  // ── Remote data ────────────────────────────────────────────────────────
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 60_000 },
  });
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), refetchInterval: 60_000 },
  });
  const scheduleId = dashboard?.activeSchedule?.id ?? 0;
  const { data: allPeriods, isSuccess: periodsReady } = useListPeriods(scheduleId, {
    query: {
      enabled: !!scheduleId,
      queryKey: getListPeriodsQueryKey(scheduleId),
      refetchInterval: 60_000,
    },
  });

  // ── Live refs ──────────────────────────────────────────────────────────
  const periodsRef         = useRef<SchedulePeriod[]>([]);
  const settingsRef        = useRef<BellSettings | null>(null);
  const activeScheduleRef  = useRef<Schedule | null>(null);

   periodsRef.current        = (allPeriods ?? []) as SchedulePeriod[];
  settingsRef.current       = (settings as BellSettings) ?? null;
  activeScheduleRef.current = dashboard?.activeSchedule ?? null;

  // ── Helpers ────────────────────────────────────────────────────────────

  function parseActiveDays(): number[] {
    const ad = activeScheduleRef.current?.activeDays;
    if (Array.isArray(ad))      return ad;
    if (typeof ad === "string") {
      try { return JSON.parse(ad); } catch { return []; }
    }
    return [];
  }

  // ── Special Tasks: auto-complete alarms that already fired ────────────
  // When the app opens after an alarm rang (Android fired it natively),
  // detect that the scheduled time is now in the past and mark as completed.
  // If autoDeleteCompleted is set, remove the task entirely.
  async function autoCompletePassedTasks() {
    let occurrences: Awaited<ReturnType<typeof getNativeCompletedAlarms>>["occurrences"];
    try {
      ({ occurrences } = await getNativeCompletedAlarms());
    } catch (error) {
      console.error("[BellScheduler] Cannot read actual playback records", error);
      return;
    }
    const { tasks, autoDeleteCompleted, ...rest } = readTasksStore();
    let changed = false;

    const updatedTasks = tasks.filter(task => {
      if (!task.enabled || task.completed || !task.date || !task.time) return true;
      if (task.repeatType === "daily" || task.repeatType === "specific-days") return true;
      const targetMs = new Date(`${task.date}T${task.time}:00`).getTime();
      if (occurrences.some(event => event.taskId === task.id && event.timestamp === targetMs)) {
        changed = true;
        if (autoDeleteCompleted) return false; // delete
        task.completed = true;  // eslint-disable-line no-param-reassign
        task.enabled   = false; // eslint-disable-line no-param-reassign
        return true;
      }
      return true;
    });

    if (changed) {
      writeTasksStore({ tasks: updatedTasks, autoDeleteCompleted, ...rest });
    }
    const duty = readSpecialDutySettings();
    const timestamp = new Date(`${duty.date}T${duty.time}:00`).getTime();
    if (duty.enabled && !duty.completed && occurrences.some(event =>
      event.alarmId === SPECIAL_DUTY_ALARM_ID && event.timestamp === timestamp)) {
      writeSpecialDutySettings({ ...duty, enabled: false, completed: true });
    }
  }

  // ── Build extra alarms from active special tasks ─────────────────────
  function buildSpecialTaskAlarms(): NativeAlarm[] {
    const { tasks } = readTasksStore();
    const now       = Date.now();
    const alarms: NativeAlarm[] = [];

    for (const task of tasks) {
      if (!task.enabled || task.completed || !task.date || !task.time) continue;
      const nextOccurrence = getNextSpecialTaskOccurrence(task, new Date(now));
      if (!nextOccurrence) continue;
      const bellSettings = settingsRef.current;
      alarms.push({
        id:          SPECIAL_TASK_ALARM_BASE + task.numericId,
        timestamp:   nextOccurrence.getTime(),
        label:       task.name || "تنبيه المهام الخاصة",
        volume:      bellSettings?.maxVolume ? 1 : bellSettings?.volume ?? 1,
        durationSec: task.durationSec,
        repeatCount: task.repeatCount ?? 1,
        soundFile:   toNativeSoundFile(task.bellSound),
        ...nativeCustomSound(task.bellSound, taskSoundKey(task.id)),
        taskId:      task.id,
        taskRepeatType: task.repeatType ?? "once",
        taskRepeatDays: task.repeatDays ?? [],
        taskDate:    task.date,
        taskTime:    task.time,
        // No subjectId → native BellAlarmReceiver treats as special alarm,
        // bypasses day-of-week and subject checks, always rings.
      });
    }
    const specialDuty = readSpecialDutySettings();
    const timestamp = new Date(`${specialDuty.date}T${specialDuty.time}:00`).getTime();
    if (specialDuty.enabled && !specialDuty.completed && timestamp > now) {
      alarms.push({
        id: SPECIAL_DUTY_ALARM_ID, timestamp,
        label: specialDuty.title || "تنبيه المناوبة الخاص",
        volume: settingsRef.current?.maxVolume ? 1 : settingsRef.current?.volume ?? 1,
        durationSec: specialDuty.durationSec, repeatCount: specialDuty.repeatCount,
        soundFile: toNativeSoundFile(specialDuty.bellSound),
        localDate: specialDuty.date, localTime: specialDuty.time,
        ...nativeCustomSound(specialDuty.bellSound, SPECIAL_DUTY_CUSTOM_SOUND_KEY),
      });
    }
    return alarms;
  }

  function doSchedule(force = false) {
    if (!isCapacitorAndroid())  return;
    if (!settingsRef.current)   return;
    // Never erase saved background alarms with an initial not-yet-loaded list.
    if (!dashboard || (scheduleId && !periodsReady)) return;

    const now = Date.now();
    if (!force && now - lastScheduledRef.current < COOLDOWN_MS) return;
    const signature = JSON.stringify({
      periods: periodsRef.current, settings: settingsRef.current,
      schedule: activeScheduleRef.current, tasks: readTasksStore(),
      duty: readDutyAlertSettings(), specialDuty: readSpecialDutySettings(),
      preStart: [...getDisabledPeriodAlertIds()], preEnd: [...getDisabledPreEndPeriodAlertIds()],
      end: [...getDisabledEndPeriodAlertIds()],
      sounds: [
        ...Object.values(CUSTOM_SOUND_KEYS), DUTY_CUSTOM_SOUND_KEY, SPECIAL_DUTY_CUSTOM_SOUND_KEY,
        ...readTasksStore().tasks.map(task => taskSoundKey(task.id)),
      ].map(key => localStorage.getItem(key)),
    });
    if (force && signature === lastSignatureRef.current) return;
    lastScheduledRef.current = now;
    try {
    const activeDays = parseActiveDays();
    const bellSettings = settingsRef.current;
    const dutyAlarms = buildNativeDutyAlarms(
      readDutyAlertSettings(),
      {
        vacationMode: bellSettings.vacationMode,
        volume: bellSettings.volume,
        maxVolume: bellSettings.maxVolume,
      },
      periodsRef.current,
      activeDays,
    );
    const extraAlarms = [...buildSpecialTaskAlarms(), ...dutyAlarms];

    // Schedule regular bell alarms + special task alarms in one cancelAll + scheduleAlarms pass
    const signatureForRun = signature;
    lastSignatureRef.current = signature;
    scheduleNativeBells(
      periodsRef.current,
      activeDays,
      settingsRef.current,
      14,
      extraAlarms,
    ).catch((error: unknown) => {
      if (lastSignatureRef.current === signatureForRun) {
        lastSignatureRef.current = "";
        lastScheduledRef.current = 0;
      }
      console.error("[BellScheduler] Native schedule was NOT installed", error);
      toast.error(String(error).includes("EXACT_ALARM_PERMISSION_REQUIRED")
        ? "لم تتم جدولة الجرس: اسمح بالمنبهات والتذكيرات لتطبيق BellCraft في إعدادات Android."
        : "تعذّرت جدولة الجرس. راجع إعدادات الصوت وصلاحيات Android.", { id: "native-alarm-error" });
    });

    // Push fresh data to the home-screen widget
    saveWidgetData(periodsRef.current, activeDays);
    } catch (error) {
      lastSignatureRef.current = "";
      lastScheduledRef.current = 0;
      console.error("[BellScheduler] Cannot build alarms", error);
      toast.error("تعذّر تجهيز التنبيهات؛ تأكد من وجود ملف الصوت المخصص.", { id: "native-alarm-error" });
    }
  }

  // ── Layer 1: data-driven ───────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    if (!settings)             return;
    doSchedule(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPeriods, dashboard?.activeSchedule, settings, periodsReady]);

  // ── Layer 1b: re-schedule when special task settings change ───────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    const handler = () => {
      lastScheduledRef.current = 0; // force reschedule
      doSchedule(true);
    };
    window.addEventListener("bellcraft:special-tasks-changed", handler);
    window.addEventListener("bellcraft:special-duty-changed", handler);
    return () => {
      window.removeEventListener("bellcraft:special-tasks-changed", handler);
      window.removeEventListener("bellcraft:special-duty-changed", handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, scheduleId, periodsReady]);

  // Duty settings live in localStorage; rebuild the full batch immediately
  // after a shift/day/time change so the old native alarm is cancelled.
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    const handler = () => {
      lastScheduledRef.current = 0;
      doSchedule(true);
    };
    window.addEventListener(DUTY_ALERT_SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DUTY_ALERT_SETTINGS_CHANGED_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, scheduleId, periodsReady]);

  // A period's pre-start preference is local to the device, not API data.
  // Rebuild native alarms immediately when it changes so disabled alarms that
  // were already queued are cancelled without waiting for the resume cooldown.
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    const handler = () => {
      lastScheduledRef.current = 0;
      doSchedule(true);
    };
    window.addEventListener(PERIOD_ALERT_PREFS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PERIOD_ALERT_PREFS_CHANGED_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, scheduleId, periodsReady]);

  // ── Auto-complete on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    getNativeAlarmPermissions().then(permissions => {
      if (!permissions.notifications) {
        toast.warning("إشعارات BellCraft غير مسموحة. فعّلها من إعدادات Android لعرض إشعارات الجرس.", { id: "native-notifications" });
      }
    }).catch(error => console.error("[BellScheduler] Permission check failed", error));
    autoCompletePassedTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer 2: app resume ────────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    let handle: Awaited<ReturnType<typeof App.addListener>> | null = null;
    let disposed = false;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        qc.invalidateQueries();
        autoCompletePassedTasks();
        lastScheduledRef.current = 0;
        doSchedule(false);
      }
    }).then((h) => { if (disposed) h.remove(); else handle = h; }).catch(error => {
      console.error("[BellScheduler] App resume listener failed", error);
    });
    return () => { disposed = true; handle?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard, scheduleId, periodsReady]);
}
