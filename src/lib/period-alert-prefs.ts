/**
 * Per-period pre-start alert preferences.
 *
 * By default ALL periods are enabled. The user can disable individual periods
 * from the period-alert-picker screen. Disabled IDs are stored in localStorage
 * so they survive page refreshes without any API round-trip.
 */
import { useState, useCallback } from "react";

const KEY = "bellcraft_disabled_prestart_periods";

function readDisabled(): Set<number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {}
  return new Set();
}

function writeDisabled(s: Set<number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {}
}

/** React hook — provides a reactive `disabled` set and mutation functions. */
export function useDisabledPeriodAlerts() {
  const [disabled, setDisabled] = useState<Set<number>>(readDisabled);

  const toggle = useCallback((id: number) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeDisabled(next);
      return next;
    });
  }, []);

  const enableAll = useCallback(() => {
    const empty = new Set<number>();
    writeDisabled(empty);
    setDisabled(empty);
  }, []);

  const disableAll = useCallback((ids: number[]) => {
    const all = new Set(ids);
    writeDisabled(all);
    setDisabled(all);
  }, []);

  return {
    disabled,
    toggle,
    enableAll,
    disableAll,
    isEnabled: (id: number) => !disabled.has(id),
  };
}

/** Non-hook helper — used by the bell scheduler outside React. */
export function getDisabledPeriodAlertIds(): Set<number> {
  return readDisabled();
}
