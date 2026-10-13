/**
 * Per-period pre-start and pre-end alert preferences.
 *
 * By default ALL periods are enabled. The user can disable individual periods
 * from the period-alert-picker screen. The two alert types use separate
 * persisted lists so changing one cannot change the other.
 */
import { useState, useCallback, useRef } from "react";

const KEY = "bellcraft_disabled_prestart_periods";
const PRE_END_KEY = "bellcraft_disabled_preend_periods";
const END_KEY = "bellcraft_disabled_end_periods";
export const PERIOD_ALERT_PREFS_CHANGED_EVENT = "bellcraft:period-alert-prefs-changed";

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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PERIOD_ALERT_PREFS_CHANGED_EVENT));
  }
}

/** React hook — provides a reactive `disabled` set and mutation functions. */
export function useDisabledPeriodAlerts() {
  const [disabled, setDisabled] = useState<Set<number>>(readDisabled);
  const current = useRef(disabled);
  const commit = useCallback((next: Set<number>) => {
    current.current = next;
    setDisabled(next);
    writeDisabled(next);
  }, []);

  const toggle = useCallback((id: number) => {
      const next = new Set(current.current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      commit(next);
  }, [commit]);

  const enableAll = useCallback((ids: number[]) => {
    const next = new Set(current.current);
    ids.forEach(id => next.delete(id));
    commit(next);
  }, [commit]);

  const disableAll = useCallback((ids: number[]) => {
    commit(new Set([...current.current, ...ids]));
  }, [commit]);

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

function readDisabledPreEnd(): Set<number> {
  try {
    const raw = localStorage.getItem(PRE_END_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch {}
  return new Set();
}

function writeDisabledPreEnd(disabled: Set<number>) {
  try {
    localStorage.setItem(PRE_END_KEY, JSON.stringify([...disabled]));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PERIOD_ALERT_PREFS_CHANGED_EVENT));
  }
}

/** Non-hook helpers — used by the pre-end scheduler and bulk actions. */
export function getDisabledPreEndPeriodAlertIds(): Set<number> {
  return readDisabledPreEnd();
}

export function setDisabledPreEndPeriodAlertIds(periodIds: number[]): void {
  writeDisabledPreEnd(new Set(periodIds));
}

/** React hook — stores pre-end exclusions separately from pre-start choices. */
export function useDisabledPreEndPeriodAlerts() {
  const [disabled, setDisabled] = useState<Set<number>>(readDisabledPreEnd);
  const disabledRef = useRef(disabled);

  const commit = useCallback((next: Set<number>) => {
    const value = new Set(next);
    disabledRef.current = value;
    setDisabled(value);
    writeDisabledPreEnd(value);
  }, []);

  const toggle = useCallback((id: number) => {
    const next = new Set(disabledRef.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit(next);
  }, [commit]);

  const enableAll = useCallback((ids: number[]) => {
    const next = new Set(disabledRef.current);
    ids.forEach((id) => next.delete(id));
    commit(next);
  }, [commit]);

  const disableAll = useCallback((ids: number[]) => {
    const next = new Set(disabledRef.current);
    ids.forEach((id) => next.add(id));
    commit(next);
  }, [commit]);

  return {
    disabled,
    toggle,
    enableAll,
    disableAll,
    isEnabled: (id: number) => !disabled.has(id),
  };
}

export function getDisabledEndPeriodAlertIds(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(END_KEY) ?? "[]") as number[]);
  } catch { return new Set(); }
}

/** Exact-end choices never affect either advance warning. */
export function useDisabledEndPeriodAlerts() {
  const [disabled, setDisabled] = useState(getDisabledEndPeriodAlertIds);
  const current = useRef(disabled);
  const commit = useCallback((next: Set<number>) => {
    current.current = next;
    setDisabled(next);
    localStorage.setItem(END_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(PERIOD_ALERT_PREFS_CHANGED_EVENT));
  }, []);
  return {
    disabled,
    isEnabled: (id: number) => !disabled.has(id),
    toggle: (id: number) => {
      const next = new Set(current.current);
      if (next.has(id)) next.delete(id); else next.add(id);
      commit(next);
    },
    enableAll: (ids: number[]) => {
      const next = new Set(current.current);
      ids.forEach(id => next.delete(id));
      commit(next);
    },
    disableAll: (ids: number[]) => commit(new Set([...current.current, ...ids])),
  };
}
