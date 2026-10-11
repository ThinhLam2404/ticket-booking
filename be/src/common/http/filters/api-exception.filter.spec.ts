import { BadRequestException, ConflictException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('ApiExceptionFilter', () => {
  it('logs a safe server-side Prisma code correlated with the request, not raw error data', () => {
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const json = vi.fn();
      const response = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnValue({ json }),
      };
      const request = {
        method: 'POST',
        path: '/api/v1/showtimes/bulk',
        originalUrl: '/api/v1/showtimes/bulk',
        header: () => 'test-request',
      };
      const error = new Prisma.PrismaClientKnownRequestError(
        'secret connection details',
        { code: 'P2028', clientVersion: '6.19.3' },
      );
      new ApiExceptionFilter().catch(error, {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as never);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'api_request_failed',
          prismaCode: 'P2028',
          method: 'POST',
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'secret connection details',
      );
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: 'DATABASE_ERROR',
          details: [],
        }),
      );
    } finally {
      log.mockRestore();
    }
  });
  const resolveError = (exception: unknown) =>
    (
      new ApiExceptionFilter() as unknown as {
        resolveError: (value: unknown) => unknown;
      }
    ).resolveError(exception);

  it('preserves a stable domain code derived from the business message', () => {
    expect(
      resolveError(new ConflictException('One or more seats are being held')),
    ).toMatchObject({
      statusCode: 409,
      code: 'SEATS_HELD',
      message: 'One or more seats are being held',
    });
  });

  it('uses VALIDATION_FAILED for class-validator message arrays', () => {
    expect(
      resolveError(
        new BadRequestException({ message: ['email must be an email'] }),
      ),
    ).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: ['email must be an email'],
    });
  });

  it('preserves an explicit domain code from an exception response', () => {
    expect(
      resolveError(
        new ConflictException({ code: 'CUSTOM_CONFLICT', message: 'Conflict' }),
      ),
    ).toMatchObject({
      statusCode: 409,
      code: 'CUSTOM_CONFLICT',
      message: 'Conflict',
    });
  });
});
