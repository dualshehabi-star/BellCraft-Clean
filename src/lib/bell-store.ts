import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from '@/lib/api-client';
import type { AppSettings } from '@/lib/api-client';
import type { BellSound } from './audio';

export type { AppSettings as BellSettings };

export interface BellLogEntry {
  id: string;
  time: number;
  label: string;
  source: 'auto' | 'manual';
}

const DEFAULT_SETTINGS: Omit<AppSettings, 'id'> = {
  bellSound: 'classic',
  volume: 1.0,
  autoRing: true,
  vacationMode: false,
  leadTimeMin: 2,
  ringDurationSec: 6,
  maxVolume: false,
  preStartEnabled: true,
  preStartRepeat: 1,
  preEndEnabled: false,
  preEndMinBefore: 5,
  preEndSound: 'classic',
  preEndDurationSec: 6,
  preEndRepeat: 1,
  endEnabled: false,
  endSound: 'classic',
  endDurationSec: 6,
  endRepeat: 1,
};

const LOG_KEY = 'bellcraft_bell_log';

function loadLog(): BellLogEntry[] {
  try {
    const s = localStorage.getItem(LOG_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return [];
}

function saveLog(log: BellLogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 50)));
}

export function useBellStore() {
  const queryClient = useQueryClient();
  const { data: apiSettings } = useGetSettings();
  const updateSettingsMutation = useUpdateSettings();

  const settings: AppSettings = apiSettings ?? { id: 0, ...DEFAULT_SETTINGS };

  const updateSettings = useCallback(
    (patch: Partial<Omit<AppSettings, 'id'>>) => {
      const current = queryClient.getQueryData<AppSettings>(getGetSettingsQueryKey()) ?? settings;
      queryClient.setQueryData<AppSettings>(getGetSettingsQueryKey(), { ...current, ...patch });
      updateSettingsMutation.mutate(
        { data: patch },
        {
          onError: () => {
            queryClient.setQueryData<AppSettings>(getGetSettingsQueryKey(), current);
          },
        }
      );
    },
    [queryClient, settings, updateSettingsMutation]
  );

  const addBellLog = useCallback((label: string, source: 'auto' | 'manual') => {
    const entry: BellLogEntry = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      time: Date.now(),
      label,
      source,
    };
    const prev = loadLog();
    const next = [entry, ...prev].slice(0, 50);
    saveLog(next);
  }, []);

  const clearBellLog = useCallback(() => {
    localStorage.removeItem(LOG_KEY);
  }, []);

  const bellLog = loadLog();

  return {
    settings: {
      ...settings,
      bellSound: settings.bellSound as BellSound,
    },
    updateSettings,
    bellLog,
    addBellLog,
    clearBellLog,
  };
}
