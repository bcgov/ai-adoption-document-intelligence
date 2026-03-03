import { Injectable } from "@nestjs/common";
import {
  createLogger,
  getLogLevel,
  type Logger as SharedLogger,
  type LogContext,
} from "@ai-di/shared-logging";
import { getRequestContext } from "./request-context";

const BASE_LOGGER = createLogger("backend-services");

@Injectable()
export class AppLoggerService {
  private readonly logger: SharedLogger = BASE_LOGGER;

  private mergeRequestContext(context?: LogContext): LogContext {
    const ctx = getRequestContext();
    return {
      ...(ctx?.requestId && { requestId: ctx.requestId }),
      ...(ctx?.userId && { userId: ctx.userId }),
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
