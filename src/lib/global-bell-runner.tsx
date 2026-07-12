import { useState, useEffect, useRef } from "react";
import { useGetDashboard, useListPeriods, getListPeriodsQueryKey } from "@/lib/api-client";
import { useBellStore } from "./bell-store";
import { unlockAudio, startBellLoop, setBellEnabled, type BellSound } from "./audio";
import { useWebBellScheduler, useDutyAlertScheduler, useSpecialDutyScheduler } from "./web-bell-scheduler";
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
    if (isPushSupported()) {
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

  const { data: allPeriods = [] } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });

  const todayDow = new Date().getDay();
  const rawActiveDays = activeSchedule?.activeDays;
  const activeDaysList: number[] = Array.isArray(rawActiveDays) ? rawActiveDays : [];
  // Empty activeDays means no school days are configured — treat as not active
  // (matches the native scheduler: activeDays.length === 0 → no ringing).
  const todayIsActive = activeDaysList.length > 0 && activeDaysList.includes(todayDow);
  const todayLocalPeriods = todayIsActive
    ? allPeriods.filter((p) => p.dayOfWeek === todayDow)
    : [];

  // ── Browser foreground bell (interval-based) ────────────────────────────
  useWebBellScheduler(audioUnlocked, todayLocalPeriods, settings);
  useDutyAlertScheduler(audioUnlocked, settings);
  useSpecialDutyScheduler(audioUnlocked, settings);

  // ── Capacitor Android native bell (no-op in browser) ───────────────────
  useCapacitorBellScheduler();

  // ── Service Worker push message → ring via Web Audio ───────────────────
  // When a push arrives and this tab is open (even if hidden),
  // the SW sends BELL_RING so we play the custom sound.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "BELL_RING") return;
      if (!audioUnlockedRef.current) return;
      const s = settingsRef.current;
      if (!s?.autoRing || s?.vacationMode) return;

      startBellLoop(
        (s.bellSound ?? "classic") as BellSound,
        s.volume ?? 1,
        s.ringDurationSec ?? 6,
        {
          maxVolume: s.maxVolume ?? false,
          repeatCount: s.preStartRepeat ?? 1,
        },
      );
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  // ── Auto-play when app opens via notification tap ───────────────────────
  useEffect(() => {
    if (!window.location.search.includes("autoplay=bell")) return;
    if (!audioUnlockedRef.current) return;
    const s = settingsRef.current;
    if (!s?.autoRing || s?.vacationMode) return;

    const tid = setTimeout(() => {
      startBellLoop(
        (s.bellSound ?? "classic") as BellSound,
        s.volume ?? 1,
        s.ringDurationSec ?? 6,
        { maxVolume: s.maxVolume ?? false, repeatCount: s.preStartRepeat ?? 1 },
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("autoplay");
      window.history.replaceState({}, "", url.toString());
    }, 400);
    return () => clearTimeout(tid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BellRunnerContext.Provider value={{ audioUnlocked, pushEnabled, handleEnableAudio, handleDisableAudio }}>
      {children}
    </BellRunnerContext.Provider>
  );
}
