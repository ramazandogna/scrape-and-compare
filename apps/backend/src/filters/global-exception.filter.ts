/**
 * Global HTTP Exception Filter — returns all errors in a standard JSON format.
 *
 * Exceptions thrown in NestJS pass through this filter.
 * Both HttpException instances (400, 404, etc.) and unexpected errors
 * are delivered to the client in a consistent format.
 *
 * Format:
 *   { statusCode, message, errors?, timestamp, path }
 *
 * Security: stack traces and internal details from unexpected errors
 * are not leaked to the client — only "Internal server error" is returned.
 */

import {
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { logger } from '@/utils/helpers';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  errors?: string[];
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, body } = this.buildResponse(exception, request.url);

    if (statusCode >= 500) {
      logger.error('[ExceptionFilter] Sunucu hatası', {
        statusCode,
        path: request.url,
        error: exception instanceof Error ? exception.message : 'Unknown',
      });
    }

    response.status(statusCode).json(body);
  }

  private buildResponse(
    exception: unknown,
    path: string,
  ): { statusCode: number; body: ErrorResponseBody } {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        return {
          statusCode,
          body: {
            statusCode,
            message: typeof resp['message'] === 'string' ? resp['message'] : exception.message,
            errors: Array.isArray(resp['errors']) ? (resp['errors'] as string[]) : undefined,
            timestamp,
            path,
          },
        };
      }

      return {
        statusCode,
        body: {
          statusCode,
          message: typeof exceptionResponse === 'string' ? exceptionResponse : exception.message,
          timestamp,
          path,
        },
      };
    }

    // Unexpected errors — do not leak internal details
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp,
        path,
      },
    };
  }
}
