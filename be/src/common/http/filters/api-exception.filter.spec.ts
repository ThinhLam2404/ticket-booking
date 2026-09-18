import { BadRequestException, ConflictException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  const resolveError = (exception: unknown) =>
    (new ApiExceptionFilter() as unknown as {
      resolveError: (value: unknown) => unknown;
    }).resolveError(exception);

  it('preserves a stable domain code derived from the business message', () => {
    expect(resolveError(new ConflictException('One or more seats are being held'))).toMatchObject({
      statusCode: 409,
      code: 'SEATS_HELD',
      message: 'One or more seats are being held',
    });
  });

  it('uses VALIDATION_FAILED for class-validator message arrays', () => {
    expect(resolveError(new BadRequestException({ message: ['email must be an email'] }))).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: ['email must be an email'],
    });
  });

  it('preserves an explicit domain code from an exception response', () => {
    expect(resolveError(new ConflictException({ code: 'CUSTOM_CONFLICT', message: 'Conflict' }))).toMatchObject({
      statusCode: 409,
      code: 'CUSTOM_CONFLICT',
      message: 'Conflict',
    });
  });
});
