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
      const { message, details } = this.resolveHttpMessage(exceptionResponse);
      return {
        statusCode,
        code: this.codeForStatus(statusCode),
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

  private resolveHttpMessage(response: string | object) {
    if (typeof response === 'string') {
      return { message: response, details: [] };
    }

    const record = response as Record<string, unknown>;
    const rawMessage = record.message;
    if (Array.isArray(rawMessage)) {
      return {
        message: 'Request validation failed',
        details: rawMessage,
      };
    }

    return {
      message:
        typeof rawMessage === 'string'
          ? rawMessage
          : 'Request could not be processed',
      details: [],
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
