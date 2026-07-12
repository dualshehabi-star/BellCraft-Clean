/**
 * useCapacitorBellScheduler
 *
 * Schedules exact Android alarms via the native BellSchedulerPlugin.
 *
 * The plugin fires BellRingerService (ForegroundService + MediaPlayer with
 * USAGE_ALARM) — plays the custom bell sound even when:
 *   • App is completely closed
 *   • Screen is locked
 *   • Device is in Silent / Do-Not-Disturb mode
 *   • Battery-saver or Doze mode is active
 *   • Device reboots (BellBootReceiver reschedules automatically)
 *
 * No-op in the browser — web scheduling is handled by useWebBellScheduler.
 *
 * Scheduling layers:
 *   1. Data-driven  — any time periods / schedule / settings change
 *   2. App resume   — when app comes back to foreground (cooldown: 10 min)
 *
 * Widget data is pushed to the home-screen widget on every data-driven
 * reschedule so the countdown stays current.
 */
import { useEffect, useRef } from "react";
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
  scheduleNativeBells,
  saveWidgetData,
  toNativeSoundFile,
  type SchedulePeriod,
  type NativeAlarm,
} from "@/lib/native-bell-scheduler";
import type { BellSettings } from "@/lib/bell-store";
import {
  readTasksStore,
  writeTasksStore,
  SPECIAL_TASK_ALARM_BASE,
} from "@/lib/special-tasks-prefs";

const COOLDOWN_MS = 10 * 60 * 1_000;

export function useCapacitorBellScheduler() {
  const qc               = useQueryClient();
  const lastScheduledRef = useRef(0);

  // ── Remote data ────────────────────────────────────────────────────────
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 60_000 },
  });
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), refetchInterval: 60_000 },
  });
  const scheduleId = dashboard?.activeSchedule?.id ?? 0;
  const { data: allPeriods = [] } = useListPeriods(scheduleId, {
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

  periodsRef.current        = allPeriods as SchedulePeriod[];
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
  function autoCompletePassedTasks() {
    const { tasks, autoDeleteCompleted, ...rest } = readTasksStore();
    const now = Date.now();
    let changed = false;
    const GRACE_MS = 5 * 60_000; // 5-minute grace before marking completed

    const updatedTasks = tasks.filter(task => {
      if (!task.enabled || task.completed || !task.date || !task.time) return true;
      const targetMs = new Date(`${task.date}T${task.time}:00`).getTime();
      if (targetMs < now - GRACE_MS) {
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
  }

  // ── Build extra alarms from active special tasks ─────────────────────
  function buildSpecialTaskAlarms(): NativeAlarm[] {
    const { tasks } = readTasksStore();
    const now       = Date.now();
    const alarms: NativeAlarm[] = [];

    for (const task of tasks) {
      if (!task.enabled || task.completed || !task.date || !task.time) continue;
      const ts = new Date(`${task.date}T${task.time}:00`).getTime();
      if (ts <= now) continue;
      alarms.push({
        id:          SPECIAL_TASK_ALARM_BASE + task.numericId,
        timestamp:   ts,
        label:       task.name || "تنبيه المهام الخاصة",
        volume:      1.0,
        durationSec: task.durationSec,
        repeatCount: task.repeatCount ?? 1,
        soundFile:   toNativeSoundFile(task.bellSound),
        // No subjectId → native BellAlarmReceiver treats as special alarm,
        // bypasses day-of-week and subject checks, always rings.
      });
    }
    return alarms;
  }

  function doSchedule(force = false) {
    if (!isCapacitorAndroid())  return;
    if (!settingsRef.current)   return;

    const now = Date.now();
    if (!force && now - lastScheduledRef.current < COOLDOWN_MS) return;
    lastScheduledRef.current = now;

    const activeDays  = parseActiveDays();
    const extraAlarms = buildSpecialTaskAlarms();

    // Schedule regular bell alarms + special task alarms in one cancelAll + scheduleAlarms pass
    scheduleNativeBells(
      periodsRef.current,
      activeDays,
      settingsRef.current,
      14,
      extraAlarms,
    );

    // Push fresh data to the home-screen widget
    saveWidgetData(periodsRef.current, activeDays);
  }

  // ── Layer 1: data-driven ───────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    if (!settings)             return;
    doSchedule(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPeriods, dashboard?.activeSchedule, settings]);

  // ── Layer 1b: re-schedule when special task settings change ───────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    const handler = () => {
      lastScheduledRef.current = 0; // force reschedule
      doSchedule(true);
    };
    window.addEventListener("bellcraft:special-tasks-changed", handler);
    return () => window.removeEventListener("bellcraft:special-tasks-changed", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-complete on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    autoCompletePassedTasks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Layer 2: app resume ────────────────────────────────────────────────
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    let handle: Awaited<ReturnType<typeof App.addListener>> | null = null;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        qc.invalidateQueries();
        autoCompletePassedTasks();
        doSchedule(false);
      }
    }).then((h) => { handle = h; }).catch(() => {});
    return () => { handle?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
