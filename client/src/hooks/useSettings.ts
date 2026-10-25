import { useCallback, useEffect, useState } from 'react';

export type WeightUnit = 'kg' | 'lb';
export type ThemePreference = 'dark' | 'light' | 'system';

export interface Settings {
  weight_unit: WeightUnit;
  theme: ThemePreference;
  rest_duration: number;
}

const STORAGE_KEY = 'fittrack.settings';

const DEFAULTS: Settings = {
  weight_unit: 'kg',
  theme: 'dark',
  rest_duration: 90,
};

function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      weight_unit: parsed.weight_unit === 'lb' ? 'lb' : 'kg',
      theme: parsed.theme ?? DEFAULTS.theme,
      rest_duration:
        typeof parsed.rest_duration === 'number' ? parsed.rest_duration : DEFAULTS.rest_duration,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * Persists user preferences (weight unit, theme, default rest duration) in
 * localStorage so they survive a reload.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage may be unavailable in private mode — preferences are optional.
    }
  }, [settings]);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }));
  }, []);

  return { settings, update };
}
