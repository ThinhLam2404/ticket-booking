import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
  path: string;
  requestId: string;
  timestamp: string;
}

const messageCodes: Record<string, string> = {
  'Invalid email or password': 'AUTH_INVALID_CREDENTIALS',
  'Invalid or expired access token': 'AUTH_ACCESS_TOKEN_INVALID',
  'Invalid or expired refresh token': 'AUTH_REFRESH_TOKEN_INVALID',
  'Bearer token is required': 'AUTH_TOKEN_REQUIRED',
  'User is no longer available': 'USER_NOT_FOUND',
  'Email is already registered': 'AUTH_EMAIL_EXISTS',
  'Insufficient permissions': 'FORBIDDEN',
  'Cinema not found': 'CINEMA_NOT_FOUND',
  'Cinema already exists': 'CINEMA_ALREADY_EXISTS',
  'Cinema cannot be deleted while it has active showtimes': 'CINEMA_HAS_SHOWTIMES',
  'Room not found': 'ROOM_NOT_FOUND',
  'Room already exists in this cinema': 'ROOM_ALREADY_EXISTS',
  'Room cannot be deleted while it has showtimes': 'ROOM_HAS_SHOWTIMES',
  'Movie not found': 'MOVIE_NOT_FOUND',
  'Movie must be published before scheduling': 'MOVIE_NOT_PUBLISHED',
  'Movie was imported concurrently': 'MOVIE_IMPORT_CONFLICT',
  'Showtime not found': 'SHOWTIME_NOT_FOUND',
  'Showtime end must be after its start': 'SHOWTIME_INVALID_ORDER',
  'Showtime must start in the future': 'SHOWTIME_IN_PAST',
  'Showtime start must include an explicit timezone offset': 'SHOWTIME_TIMEZONE_REQUIRED',
  'Showtime start is invalid': 'SHOWTIME_START_INVALID',
  'Room already has an overlapping showtime': 'SHOWTIME_OVERLAP',
  'Showtime seats could not be initialized': 'SHOWTIME_SEATS_INIT_FAILED',
  'Showtime cannot be updated after bookings exist': 'SHOWTIME_HAS_BOOKINGS',
  'Showtime cannot be deleted after bookings exist': 'SHOWTIME_HAS_BOOKINGS',
  'Room must have at least one seat': 'ROOM_NO_SEATS',
  'Room has an invalid seat layout': 'ROOM_LAYOUT_INVALID',
  'Seat already exists in this room': 'SEAT_ALREADY_EXISTS',
  'Seat not found': 'SEAT_NOT_FOUND',
  'Seat cannot be changed while the room has showtimes': 'SEAT_HAS_SHOWTIMES',
  'Seat cannot be deleted while it is used by a showtime': 'SEAT_HAS_SHOWTIMES',
  'Complete seat layouts must be managed in bulk': 'SEAT_LAYOUT_BULK_ONLY',
  'Couple seats must be managed as a complete room layout': 'COUPLE_LAYOUT_REQUIRED',
  'Duplicate seat coordinate in layout': 'SEAT_DUPLICATE_COORDINATE',
  'Room layout cannot be replaced while it has showtimes': 'SEAT_LAYOUT_HAS_SHOWTIMES',
  'Room layout cannot be replaced while it is used by a showtime': 'SEAT_LAYOUT_HAS_SHOWTIMES',
  'At least one seat is required': 'SEAT_REQUIRED',
  'One or more showtime seats were not found': 'SEAT_NOT_FOUND',
  'Couple seat must have a valid partner': 'COUPLE_PARTNER_INVALID',
  'A maximum of 10 physical seats can be held': 'SEAT_LIMIT_EXCEEDED',
  'One or more seats are being held': 'SEATS_HELD',
  'One or more seats are no longer available': 'SEATS_UNAVAILABLE',
  'Showtime has already started': 'SHOWTIME_STARTED',
  'Showtime is too close to start for a seat hold; purchase seats instead': 'PURCHASE_REQUIRED',
  'Seat purchase is only available within the final purchase window': 'PURCHASE_WINDOW',
  'Booking not found': 'BOOKING_NOT_FOUND',
  'Only pending bookings can be cancelled': 'BOOKING_NOT_CANCELLABLE',
  'Booking is no longer available for checkout': 'BOOKING_NOT_PAYABLE',
  'Booking is no longer payable': 'BOOKING_NOT_PAYABLE',
  'Booking no longer owns all selected seats': 'BOOKING_SEATS_NOT_OWNED',
  'Booking could not be confirmed': 'BOOKING_CONFIRM_FAILED',
  'Selected seats could not be sold': 'SEATS_SALE_FAILED',
  'Payment idempotency key is required': 'PAYMENT_IDEMPOTENCY_REQUIRED',
  'Payment idempotency key is already used': 'PAYMENT_IDEMPOTENCY_CONFLICT',
  'Mock payments are disabled': 'PAYMENT_MOCK_DISABLED',
  'Ticket not found': 'TICKET_NOT_FOUND',
  'TMDB movie not found': 'TMDB_MOVIE_NOT_FOUND',
  'TMDB integration is not configured': 'TMDB_NOT_CONFIGURED',
  'TMDB request limit reached': 'TMDB_RATE_LIMITED',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = this.getRequestId(request);
    const error = this.resolveError(exception);

    response.setHeader('X-Request-Id', requestId);
    response.status(error.statusCode).json({
      ...error,
      path: request.originalUrl ?? request.url,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveError(
    exception: unknown,
  ): Omit<ErrorResponse, 'path' | 'requestId' | 'timestamp'> {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const { code, message, details } = this.resolveHttpMessage(
        exceptionResponse,
        statusCode,
      );
      return {
        statusCode,
        code,
        message,
        details,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      details: [],
    };
  }

  private resolvePrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): Omit<ErrorResponse, 'path' | 'requestId' | 'timestamp'> {
    if (exception.code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'DATABASE_CONFLICT',
        message: 'A record with the same unique value already exists',
        details: [],
      };
    }

    if (exception.code === 'P2003') {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'FOREIGN_KEY_CONFLICT',
        message: 'The record is referenced by another resource',
        details: [],
      };
    }

    if (exception.code === 'P2025') {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found',
        details: [],
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'DATABASE_ERROR',
      message: 'Database operation failed',
      details: [],
    };
  }

  private resolveHttpMessage(response: string | object, statusCode: number) {
    if (typeof response === 'string') {
      return {
        code: messageCodes[response] ?? this.codeForStatus(statusCode),
        message: response,
        details: [],
      };
    }

    const record = response as Record<string, unknown>;
    const rawMessage = record.message;
    const explicitCode = typeof record.code === 'string' ? record.code : undefined;
    if (Array.isArray(rawMessage)) {
      return {
        code: explicitCode ?? 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: rawMessage,
      };
    }

    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : 'Request could not be processed';
    return {
      code: explicitCode ?? messageCodes[message] ?? this.codeForStatus(statusCode),
      message,
      details: Array.isArray(record.details) ? record.details : [],
    };
  }

  private codeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
    }
  }

  private getRequestId(request: Request): string {
    const header = request.header('X-Request-Id');
    return header?.trim() || `req_${randomUUID()}`;
  }
}
