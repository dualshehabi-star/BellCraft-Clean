/**
 * Duty-shift alert preferences.
 *
 * Stored in localStorage so no API round-trip is needed.
 * Supports two independently-configurable duty shifts (فسحة 1 + فسحة 2).
 */
import { useState, useCallback } from "react";

export const DUTY_CUSTOM_SOUND_KEY = "bellcraft_custom_sound_duty";
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
}

/** React hook — provides reactive duty alert settings. */
export function useDutyAlertSettings() {
  const [settings, setSettings] = useState<DutyAlertSettings>(readDutyAlertSettings);

  const update = useCallback((patch: Partial<Omit<DutyAlertSettings, "shifts">>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  const updateShift = useCallback((idx: 0 | 1, patch: Partial<DutyShift>) => {
    setSettings(prev => {
      const shifts: [DutyShift, DutyShift] = [
        { ...prev.shifts[0] },
        { ...prev.shifts[1] },
      ];
      shifts[idx] = { ...shifts[idx], ...patch };
      const next = { ...prev, shifts };
      write(next);
      return next;
    });
  }, []);

  return { settings, update, updateShift };
}
