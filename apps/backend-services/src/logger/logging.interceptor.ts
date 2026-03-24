import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";

/**
 * HTTP request/response logger (dev only). Logs method, URL, status code,
 * duration, and at debug level query params, request body, and response body.
 *
 * Uses AppLoggerService so output is NDJSON with requestId/actorId from
 * request context. Registered only when NODE_ENV !== "production".
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  private baseContext(): Record<string, unknown> {
    const ctx = getRequestContext();
    return {
      ...(ctx?.requestId && { requestId: ctx.requestId }),
      ...(ctx?.actorId && { actorId: ctx.actorId }),
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url, path, body, query, params } = request;
    const startTime = Date.now();

    this.logger.log("HTTP request start", {
      ...this.baseContext(),
      method,
      path: path ?? url,
    });

    if (Object.keys(query).length > 0) {
      this.logger.debug("HTTP request query", {
        ...this.baseContext(),
        method,
        path: path ?? url,
        query,
      });
    }

    if (Object.keys(params).length > 0) {
      this.logger.debug("HTTP request params", {
        ...this.baseContext(),
        method,
        path: path ?? url,
        params,
      });
    }

    if (body && Object.keys(body).length > 0) {
      const bodyStr = JSON.stringify(body);
      const truncated =
        bodyStr.length > 500 ? bodyStr.substring(0, 500) + "..." : bodyStr;
      this.logger.debug("HTTP request body", {
        ...this.baseContext(),
        method,
        path: path ?? url,
        body: truncated,
      });
    }

    return next.handle().pipe(
      tap((data) => {
        const durationMs = Date.now() - startTime;
        this.logger.log("HTTP request complete", {
          ...this.baseContext(),
          method,
          path: path ?? url,
          statusCode: response.statusCode,
          durationMs,
        });
        if (data) {
          const dataStr = JSON.stringify(data);
          const truncated =
            dataStr.length > 500 ? dataStr.substring(0, 500) + "..." : dataStr;
          this.logger.debug("HTTP response body", {
            ...this.baseContext(),
            method,
            path: path ?? url,
            responseBody: truncated,
          });
        }
      }),
      catchError(
        (error: { message?: string; stack?: string; status?: number }) => {
          const durationMs = Date.now() - startTime;
          const statusCode = error.status ?? 500;
          this.logger.error("HTTP request failed", {
            ...this.baseContext(),
            method,
            path: path ?? url,
            statusCode,
            durationMs,
            error: error.message ?? String(error),
          });
          if (error.stack) {
            this.logger.debug("HTTP request error stack", {
              ...this.baseContext(),
              method,
              path: path ?? url,
              stack: error.stack,
            });
          }
          throw error;
        },
      ),
    );
  }
}
