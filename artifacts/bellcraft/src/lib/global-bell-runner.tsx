import { useState, useEffect, useRef } from "react";
import { useGetDashboard, useListPeriods, getListPeriodsQueryKey } from "@/lib/api-client";
import { useBellStore } from "./bell-store";
import { unlockAudio, setBellEnabled } from "./audio";
import { getDueSchoolBells } from "./native-bell-scheduler";
import {
  useWebBellScheduler,
  useDutyAlertScheduler,
  useSpecialDutyScheduler,
  useWebSpecialTaskScheduler,
  ringSchoolOccurrence,
} from "./web-bell-scheduler";
import { BellRunnerContext } from "./bell-runner-context";
import { useCapacitorBellScheduler } from "@/hooks/use-capacitor-bell-scheduler";
import { isCapacitorAndroid } from "@/lib/capacitor-bell";
import {
  subscribePush,
  unsubscribePush,
  getPushSubscription,
  registerServiceWorker,
  isPushSupported,
} from "./web-push-subscription";

const AUDIO_UNLOCKED_KEY = "bellcraft_audio_unlocked";

export function GlobalBellRunner({ children }: { children: React.ReactNode }) {
  const { settings } = useBellStore();
  const { data: dashboard } = useGetDashboard();

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(
    () => localStorage.getItem(AUDIO_UNLOCKED_KEY) === "1",
  );
  const [pushEnabled, setPushEnabled] = useState(false);

  const audioUnlockedRef = useRef(audioUnlocked);
  audioUnlockedRef.current = audioUnlocked;
  const settingsRef = useRef(settings);
  const mountedAtRef = useRef(Date.now());
  settingsRef.current = settings;

  // ── Auto-unlock audio in Capacitor Android (no browser restriction there) ──
  // In a native WebView the audio policy is not enforced by the browser, so we
  // enable the bell immediately without requiring the user to tap a button.
  // Note: setBaseUrl is called synchronously in main.tsx before createRoot.
  useEffect(() => {
    if (isCapacitorAndroid()) {
      unlockAudio();
      setAudioUnlocked(true);
      localStorage.setItem(AUDIO_UNLOCKED_KEY, "1");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Register SW and check push status on mount ─────────────────────────
  useEffect(() => {
    if (isCapacitorAndroid()) return;
    registerServiceWorker();
    getPushSubscription().then((sub) => setPushEnabled(!!sub)).catch(() => {});
  }, []);

  // ── Keep the audio module's hard gate in sync with React state ──────────
  // This runs on mount (restoring from localStorage) and on every change.
  // The gate inside audio.ts ensures startBellLoop never fires without this.
  useEffect(() => {
    setBellEnabled(audioUnlocked);
  }, [audioUnlocked]);

  // ── Combined enable: unlock Web Audio + subscribe to push ──────────────
  const handleEnableAudio = () => {
    unlockAudio();
    setAudioUnlocked(true);
    localStorage.setItem(AUDIO_UNLOCKED_KEY, "1");

    // Also subscribe to push so the bell fires even when the tab is closed.
    // This is a no-op if the browser doesn't support push or permission denied.
    if (!isCapacitorAndroid() && isPushSupported()) {
      subscribePush().then((sub) => setPushEnabled(!!sub)).catch(() => {});
    }
  };

  const handleDisableAudio = () => {
    setBellEnabled(false);
    setAudioUnlocked(false);
    localStorage.removeItem(AUDIO_UNLOCKED_KEY);
    // Unsubscribe push when the user explicitly disables the bell
    unsubscribePush().then(() => setPushEnabled(false)).catch(() => {});
  };

  const activeSchedule = dashboard?.activeSchedule;
  const scheduleId = activeSchedule?.id ?? 0;
  const nativeAndroid = isCapacitorAndroid();

  const { data: allPeriods = [] } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });

  const rawActiveDays = activeSchedule?.activeDays;
  const activeDaysList: number[] = Array.isArray(rawActiveDays) ? rawActiveDays : [];
  const scheduleDataRef = useRef({ periods: allPeriods, activeDays: activeDaysList });
  scheduleDataRef.current = { periods: allPeriods, activeDays: activeDaysList };

  // ── Browser foreground bell (interval-based) ────────────────────────────
  // Android uses AlarmManager for exact, background-safe bells. Running the
  // foreground Web Audio loop there as well causes same-time alarms to replace
  // or duplicate one another.
  const foregroundAudioEnabled = audioUnlocked && !nativeAndroid;
  useWebBellScheduler(foregroundAudioEnabled, allPeriods, settings, activeDaysList);
  useDutyAlertScheduler(foregroundAudioEnabled, settings, allPeriods, activeDaysList);
  useSpecialDutyScheduler(foregroundAudioEnabled, settings);
  useWebSpecialTaskScheduler(foregroundAudioEnabled, settings);

  // ── Capacitor Android native bell (no-op in browser) ───────────────────
  useCapacitorBellScheduler();

  // ── Service Worker push message → ring via Web Audio ───────────────────
  // When a push arrives and this tab is open (even if hidden),
  // the SW sends BELL_RING so we play the custom sound.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "BELL_RING") return;
      if (isCapacitorAndroid()) return;
      if (!audioUnlockedRef.current) return;
      const s = settingsRef.current;
      if (!s?.autoRing || s?.vacationMode) return;

      // Never trust an old server notification to bypass current local
      // per-period choices or replay an event after its due window.
      const data = scheduleDataRef.current;
      for (const alarm of getDueSchoolBells(data.periods, data.activeDays, s, Date.now(), mountedAtRef.current)) {
        ringSchoolOccurrence(alarm, s);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  // A notification tap opens the app only. It is not a new alarm occurrence.

  return (
    <BellRunnerContext.Provider value={{ audioUnlocked, pushEnabled, handleEnableAudio, handleDisableAudio }}>
      {children}
    </BellRunnerContext.Provider>
  );
}
