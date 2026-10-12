/**
 * Duty-shift alert preferences.
 *
 * Stored in localStorage so no API round-trip is needed.
 * Supports two independently-configurable duty shifts (فسحة 1 + فسحة 2).
 */
import { useState, useCallback, useRef } from "react";

export const DUTY_CUSTOM_SOUND_KEY = "bellcraft_custom_sound_duty";
export const DUTY_ALERT_SETTINGS_CHANGED_EVENT = "bellcraft:duty-alert-settings-changed";
const SETTINGS_KEY = "bellcraft_duty_alert";

export type DutyShift = {
  dayOfWeek: number | null;  // 0-6
  periodId: number | null;
  startTime: string | null;  // cached for quick scheduler lookup
};

export type DutyAlertSettings = {
  enabled: boolean;
  bellSound: string;
  ringDurationSec: number;
  repeatCount: number;
  shifts: [DutyShift, DutyShift];
};

const DEFAULT: DutyAlertSettings = {
  enabled: false,
  bellSound: "classic",
  ringDurationSec: 6,
  repeatCount: 1,
  shifts: [
    { dayOfWeek: null, periodId: null, startTime: null },
    { dayOfWeek: null, periodId: null, startTime: null },
  ],
};

export function readDutyAlertSettings(): DutyAlertSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT };
}

function write(s: DutyAlertSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DUTY_ALERT_SETTINGS_CHANGED_EVENT));
  }
}

/** React hook — provides reactive duty alert settings. */
export function useDutyAlertSettings() {
  const [settings, setSettings] = useState<DutyAlertSettings>(readDutyAlertSettings);
  const settingsRef = useRef(settings);

  const update = useCallback((patch: Partial<Omit<DutyAlertSettings, "shifts">>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    write(next);
  }, []);

  const updateShift = useCallback((idx: 0 | 1, patch: Partial<DutyShift>) => {
    const shifts: [DutyShift, DutyShift] = [
      { ...settingsRef.current.shifts[0] },
      { ...settingsRef.current.shifts[1] },
    ];
    shifts[idx] = { ...shifts[idx], ...patch };
    const next = { ...settingsRef.current, shifts };
    settingsRef.current = next;
    setSettings(next);
    write(next);
  }, []);

  return { settings, update, updateShift };
}
