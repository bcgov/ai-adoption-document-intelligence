import {
  createLogger,
  getLogLevel,
  type LogContext,
  type Logger as SharedLogger,
} from "@ai-di/shared-logging";
import { Injectable, Optional } from "@nestjs/common";
import { MetricsService } from "@/metrics/metrics.service";
import { getRequestContext } from "./request-context";

@Injectable()
export class AppLoggerService {
  private readonly logger: SharedLogger;

  constructor(@Optional() metricsService?: MetricsService) {
    this.logger = createLogger(
      "backend-services",
      undefined,
      metricsService?.getMetricsHook(),
    );
  }

  private mergeRequestContext(context?: LogContext): LogContext {
    const ctx = getRequestContext();
    return {
      ...(ctx?.requestId && { requestId: ctx.requestId }),
      ...(ctx?.actorId && { actorId: ctx.actorId }),
      ...(ctx?.userId && { userId: ctx.userId }),
      ...(ctx?.sessionId && { sessionId: ctx.sessionId }),
      ...(ctx?.apiKeyId && { apiKeyId: ctx.apiKeyId }),
      ...(ctx?.clientIp && { clientIp: ctx.clientIp }),
      ...context,
    };
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, this.mergeRequestContext(context));
  }

  log(message: string, context?: LogContext): void {
    this.logger.info(message, this.mergeRequestContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, this.mergeRequestContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, this.mergeRequestContext(context));
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(message, this.mergeRequestContext(context));
  }

  child(context: LogContext): SharedLogger {
    return this.logger.child(this.mergeRequestContext(context));
  }

  static getLogLevel = getLogLevel;
}
