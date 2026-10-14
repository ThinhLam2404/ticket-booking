import { BadRequestException } from '@nestjs/common';
import {
  assertCursorDirection,
  buildCursorMeta,
  decodeCursor,
  encodeCursor,
} from './cursor-pagination.js';

describe('cursor pagination', () => {
  const scope = 'bookings:user-1:CONFIRMED:';

  it('round-trips an opaque signed cursor', () => {
    const cursor = encodeCursor({
      direction: 'after',
      sortValue: '2026-10-15T10:00:00.000Z',
      id: 'booking-2',
      scope,
    });

    expect(cursor).not.toContain('booking-2');
    expect(decodeCursor(cursor, scope, 'after')).toMatchObject({
      version: 1,
      direction: 'after',
      sortValue: '2026-10-15T10:00:00.000Z',
      id: 'booking-2',
      scope,
    });
  });

  it.each([
    ['tampered', (cursor: string) => `${cursor}x`],
    ['wrong scope', (cursor: string) => cursor],
  ])('rejects %s cursors', (_, transform) => {
    const cursor = encodeCursor({
      direction: 'after',
      sortValue: '2026-10-15T10:00:00.000Z',
      id: 'booking-2',
      scope,
    });
    const value = transform(cursor);
    expect(() => decodeCursor(value, 'different-scope', 'after')).toThrow(
      BadRequestException,
    );
  });

  it('rejects a cursor used in the wrong direction', () => {
    const cursor = encodeCursor({
      direction: 'after',
      sortValue: '2026-10-15T10:00:00.000Z',
      id: 'booking-2',
      scope,
    });

    expect(() => decodeCursor(cursor, scope, 'before')).toThrow(
      'Invalid pagination cursor',
    );
  });

  it('rejects simultaneous after and before parameters', () => {
    expect(() => assertCursorDirection('after', 'before')).toThrow(
      'Use either after or before, not both',
    );
  });

  it('keeps equal timestamps deterministic with the id tie-breaker', () => {
    const timestamp = new Date('2026-10-15T10:00:00.000Z');
    const page = buildCursorMeta(
      [
        { id: 'booking-c', createdAt: timestamp },
        { id: 'booking-b', createdAt: timestamp },
        { id: 'booking-a', createdAt: timestamp },
      ],
      2,
      scope,
      'after',
      (row) => row.createdAt,
      false,
    );

    expect(page.data.map((row) => row.id)).toEqual(['booking-c', 'booking-b']);
    expect(page.meta.hasNextPage).toBe(true);
    expect(page.meta.nextCursor).toBeTruthy();
    expect(decodeCursor(page.meta.nextCursor!, scope, 'after').id).toBe(
      'booking-b',
    );
  });

  it('reverses a backwards query while preserving navigation cursors', () => {
    const timestamp = new Date('2026-10-15T10:00:00.000Z');
    const page = buildCursorMeta(
      [
        { id: 'booking-b', createdAt: timestamp },
        { id: 'booking-c', createdAt: timestamp },
        { id: 'booking-d', createdAt: timestamp },
      ],
      2,
      scope,
      'before',
      (row) => row.createdAt,
      true,
    );

    expect(page.data.map((row) => row.id)).toEqual(['booking-c', 'booking-b']);
    expect(page.meta.hasPreviousPage).toBe(true);
    expect(page.meta.hasNextPage).toBe(true);
    expect(decodeCursor(page.meta.nextCursor!, scope, 'after').id).toBe(
      'booking-b',
    );
    expect(decodeCursor(page.meta.previousCursor!, scope, 'before').id).toBe(
      'booking-c',
    );
  });
});
