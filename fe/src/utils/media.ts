export function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
}

export function posterStyle(_title?: string | null, posterUrl?: string | null) {
  return posterUrl ? { backgroundImage: `url("${posterUrl}")` } : undefined;
}

export function backdropStyle(_title?: string | null, backdropUrl?: string | null) {
  return backdropUrl ? { backgroundImage: `url("${backdropUrl}")` } : undefined;
}
