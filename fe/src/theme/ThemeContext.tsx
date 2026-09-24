import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveTheme, readThemePreference, THEME_STORAGE_KEY, writeThemePreference } from './theme-storage';
import type { ResolvedTheme, ThemePreference } from './theme-storage';
import { ThemeContext } from './useTheme';

function getSystemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function updateDocumentTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f8fb' : '#08101f');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const theme = resolveTheme(preference, systemTheme);

  useEffect(() => {
    updateDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onSystemThemeChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'light' : 'dark');
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(event.newValue === 'light' || event.newValue === 'dark' || event.newValue === 'system' ? event.newValue : 'system');
    };
    media.addEventListener('change', onSystemThemeChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemThemeChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemePreference(next);
  }, []);
  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
