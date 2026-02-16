import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Intercepts all HTTP requests and logs request/response details.
 * Critical for debugging Playwright test failures.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url, body, query, params } = request;

    const startTime = Date.now();

    // Log incoming request
    this.logger.log(`→ ${method} ${url}`);

    if (Object.keys(query).length > 0) {
      this.logger.debug(`  Query: ${JSON.stringify(query)}`);
    }

    if (Object.keys(params).length > 0) {
      this.logger.debug(`  Params: ${JSON.stringify(params)}`);
    }

    if (body && Object.keys(body).length > 0) {
      // Truncate large bodies to avoid log bloat
      const bodyStr = JSON.stringify(body);
      const truncatedBody = bodyStr.length > 500 ? bodyStr.substring(0, 500) + '...' : bodyStr;
      this.logger.debug(`  Body: ${truncatedBody}`);
    }

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        this.logger.log(`← ${method} ${url} ${response.statusCode} (${duration}ms)`);

        // Log response data for debugging (truncated)
        if (data) {
          const dataStr = JSON.stringify(data);
          const truncatedData = dataStr.length > 500 ? dataStr.substring(0, 500) + '...' : dataStr;
          this.logger.debug(`  Response: ${truncatedData}`);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(`✗ ${method} ${url} ${error.status || 500} (${duration}ms)`);
        this.logger.error(`  Error: ${error.message}`);

        if (error.stack) {
          this.logger.debug(`  Stack: ${error.stack}`);
        }

        throw error;
      }),
    );
  }
}
