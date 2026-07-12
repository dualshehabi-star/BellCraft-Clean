/**
 * Special Duty Alert preferences.
 *
 * A one-time alarm on a specific date and time that rings exactly once,
 * then auto-disables itself.  Stored in localStorage (no API round-trip).
 */
import { useState, useEffect, useCallback } from "react";

export const SPECIAL_DUTY_CUSTOM_SOUND_KEY = "bellcraft_custom_sound_special_duty";
const SETTINGS_KEY = "bellcraft_special_duty_alert";

export type SpecialDutySettings = {
  enabled: boolean;
  date: string;         // "YYYY-MM-DD" — empty means not set
  time: string;         // "HH:MM"     — empty means not set
  bellSound: string;    // BellSound value
  durationSec: number;  // 5 | 10 | 15 | 30 | 60 | 3600 (3600 = until dismissed)
  repeatCount: number;
  title: string;        // notification title shown on lock screen
  body: string;         // notification body
  completed: boolean;   // true once the alarm has fired
};

const DEFAULT: SpecialDutySettings = {
  enabled: false,
  date: "",
  time: "",
  bellSound: "classic",
  durationSec: 10,
  repeatCount: 1,
  title: "تنبيه المناوبة الخاص",
  body: "حان وقت التنبيه الخاص",
  completed: false,
};

export function readSpecialDutySettings(): SpecialDutySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT };
}

export function writeSpecialDutySettings(s: SpecialDutySettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bellcraft:special-duty-changed"));
    }
  } catch {}
}

/** React hook — provides reactive special duty settings. */
export function useSpecialDutySettings() {
  const [settings, setSettings] = useState<SpecialDutySettings>(readSpecialDutySettings);

  // Re-sync when another component writes (e.g. after alarm fires)
  useEffect(() => {
    const handler = () => setSettings(readSpecialDutySettings());
    window.addEventListener("bellcraft:special-duty-changed", handler);
    return () => window.removeEventListener("bellcraft:special-duty-changed", handler);
  }, []);

  const update = useCallback((patch: Partial<SpecialDutySettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      writeSpecialDutySettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
