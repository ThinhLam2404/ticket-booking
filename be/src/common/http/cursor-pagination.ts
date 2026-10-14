import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const CURSOR_VERSION = 1;
function cursorSecret() {
  return process.env.JWT_ACCESS_SECRET ?? 'development-cursor-secret';
}

type CursorDirection = 'after' | 'before';

export type CursorPayload = {
  version: number;
  direction: CursorDirection;
  sortValue: string;
  id: string;
  scope: string;
};

function sign(value: string) {
  return createHmac('sha256', cursorSecret()).update(value).digest('base64url');
}

export function encodeCursor(payload: Omit<CursorPayload, 'version'>) {
  const value = Buffer.from(
    JSON.stringify({ version: CURSOR_VERSION, ...payload }),
  ).toString('base64url');
  return `${value}.${sign(value)}`;
}

export function decodeCursor(
  cursor: string,
  expectedScope: string,
  expectedDirection?: CursorDirection,
): CursorPayload {
  try {
    const parts = cursor.split('.');
    if (parts.length !== 2) throw new Error('invalid cursor');
    const [value, signature] = parts;
    if (!value || !signature) throw new Error('invalid cursor');
    const expectedSignature = sign(value);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(
        createHash('sha256').update(actual).digest(),
        createHash('sha256').update(expected).digest(),
      )
    ) {
      throw new Error('invalid cursor signature');
    }
    const payload = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    if (
      payload.version !== CURSOR_VERSION ||
      payload.scope !== expectedScope ||
      typeof payload.id !== 'string' ||
      typeof payload.sortValue !== 'string' ||
      !Number.isFinite(Date.parse(payload.sortValue))
    ) {
      throw new Error('invalid cursor payload');
    }
    if (payload.direction !== 'after' && payload.direction !== 'before')
      throw new Error('invalid cursor direction');
    if (expectedDirection && payload.direction !== expectedDirection)
      throw new Error('invalid cursor direction');
    return payload as CursorPayload;
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

export function assertCursorDirection(after?: string, before?: string) {
  if (after && before)
    throw new BadRequestException('Use either after or before, not both');
}

export function cursorWhere(payload: CursorPayload, sortField: string) {
  const comparison = payload.direction === 'after' ? 'lt' : 'gt';
  return {
    AND: [
      {
        OR: [
          { [sortField]: { [comparison]: new Date(payload.sortValue) } },
          {
            [sortField]: new Date(payload.sortValue),
            id: { [comparison]: payload.id },
          },
        ],
      },
    ],
  };
}

export function buildCursorMeta<T extends { id: string }>(
  rows: T[],
  limit: number,
  scope: string,
  direction: CursorDirection,
  getSortValue: (row: T) => Date,
  hasIncomingCursor: boolean,
) {
  const hasMore = rows.length > limit;
  // `before` queries are fetched ASC. The first rows are closest to the
  // cursor; reverse them back into the public DESC order.
  const pageRows = direction === 'before' ? rows.slice(0, limit) : rows.slice(0, limit);
  const data = direction === 'before' ? [...pageRows].reverse() : pageRows;
  const newest = data[0];
  const oldest = data.at(-1);
  return {
    data,
    meta: {
      limit,
      hasNextPage: direction === 'before' ? hasIncomingCursor : hasMore,
      hasPreviousPage: direction === 'before' ? hasMore : hasIncomingCursor,
      nextCursor: oldest
        ? encodeCursor({
            direction: 'after',
            sortValue: getSortValue(oldest).toISOString(),
            id: oldest.id,
            scope,
          })
        : null,
      previousCursor: newest
        ? encodeCursor({
            direction: 'before',
            sortValue: getSortValue(newest).toISOString(),
            id: newest.id,
            scope,
          })
        : null,
    },
  };
}
