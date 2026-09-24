import { describe, expect, it, vi } from 'vitest';
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY, writeThemePreference } from './theme-storage';

describe('theme storage', () => {
  it('resolves system preference from the OS theme', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('reads and writes valid preferences', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    expect(readThemePreference()).toBe('system');
    writeThemePreference('light');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemePreference()).toBe('light');
    vi.unstubAllGlobals();
  });

  it('falls back safely for invalid or unavailable storage', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'sepia', setItem: () => { throw new Error('denied'); } } });
    expect(readThemePreference()).toBe('system');
    expect(() => writeThemePreference('dark')).not.toThrow();
    vi.unstubAllGlobals();
  });
});
