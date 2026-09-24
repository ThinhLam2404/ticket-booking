import { useTheme } from '../theme/useTheme';
import type { ThemePreference } from '../theme/theme-storage';

const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Hệ thống' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();
  return <label className={`theme-control${compact ? ' theme-control-compact' : ''}`}>
    <span className="sr-only">Giao diện</span>
    <select aria-label="Chọn giao diện" value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      {themeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { theme, setPreference } = useTheme();
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  return <button
    className={`theme-switch${compact ? ' theme-switch-compact' : ''}`}
    type="button"
    aria-label={`Chuyển sang giao diện ${nextTheme === 'light' ? 'sáng' : 'tối'}`}
    aria-pressed={theme === 'dark'}
    onClick={() => setPreference(nextTheme)}
  >
    <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    <span>{theme === 'light' ? 'Tối' : 'Sáng'}</span>
  </button>;
}
