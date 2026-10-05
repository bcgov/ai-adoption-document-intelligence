import {
  type ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Request } from "express";
import { AppLoggerService } from "./app-logger.service";

/**
 * Logs HTTP failures that never reach `RequestLoggingInterceptor`.
 *
 * Nest runs guards and route matching before interceptors, so unmatched routes (404)
 * and guard rejections (401/403) produce no "Request completed" entry. Without this
 * filter those requests are invisible in the logs.
 *
 * Delegates to `BaseExceptionFilter` so the HTTP response is unchanged.
 */
@Catch()
export class RequestFailureLoggingFilter extends BaseExceptionFilter {
  constructor(private readonly logger: AppLoggerService) {
    super();
  }

  /**
   * Logs the failure when the interceptor has not already logged it, then defers
   * to the default exception handling.
   *
   * @param exception The thrown exception.
   * @param host Arguments host for the current execution context.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === "http") {
      const request = host.switchToHttp().getRequest<Request>();
      if (request?._loggingCompleted !== true) {
        this.logFailure(exception, request);
      }
    }
    super.catch(exception, host);
  }

  /**
   * Emits a structured log entry for a rejected request.
   *
   * @param exception The thrown exception.
   * @param request The Express request that was rejected.
   */
  private logFailure(exception: unknown, request: Request): void {
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const context = {
      method: request?.method,
      path: request?.path,
      statusCode,
      errorName: exception instanceof Error ? exception.name : "UnknownError",
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error("Request failed", context);
    } else {
      this.logger.warn("Request failed", context);
    }
  }
}
