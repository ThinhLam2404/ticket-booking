const hiddenFields = new Set([
  'passwordHash',
  'holdToken',
  'requestHash',
  'heldByBookingId',
  'idempotencyKey',
]);

function countName(name: string): string {
  return `${name.replace(/s$/, '')}Count`;
}

export function toPublicResponse<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toPublicResponse(item)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === 'object' &&
    'toFixed' in value &&
    typeof value.toFixed === 'function'
  ) {
    return value.toFixed(2) as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (hiddenFields.has(key)) {
      continue;
    }

    if (key === '_count' && nestedValue && typeof nestedValue === 'object') {
      for (const [countKey, countValue] of Object.entries(nestedValue)) {
        result[countName(countKey)] = countValue;
      }
      continue;
    }

    result[key] = toPublicResponse(nestedValue);
  }

  return result as T;
}
