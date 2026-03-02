import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Application-wide logger that replaces NestJS's default ConsoleLogger.
 * Registered via NestFactory.create({ logger: fileLogger }) in main.ts.
 *
 * - Console: delegates to ConsoleLogger so terminal output keeps standard
 *   NestJS colors, formatting, and log-level filtering.
 * - File: appends a plain-text copy of every log entry to `backend.log`
 *   (or a custom path) for post-mortem debugging (e.g. Playwright runs).
 *
 * All NestJS internals (module init, route registration, etc.) and any
 * code that uses the Logger class will flow through this logger.
 *
 * See also: LoggingInterceptor — adds HTTP request/response logging that
 * NestJS does not provide out of the box.
 */
export class FileLogger extends ConsoleLogger {
  private logFilePath: string;

  constructor(logFilePath?: string) {
    super();
    this.logFilePath = logFilePath || path.join(process.cwd(), 'backend.log');

    try {
      fs.writeFileSync(this.logFilePath, `=== Backend started at ${new Date().toISOString()} ===\n`);
    } catch (error) {
      console.error('Failed to initialize log file:', error);
    }
  }

  private writeToFile(level: string, message: string, context?: string, trace?: string) {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : '';
    const logEntry = `[${timestamp}] [${level}]${contextStr} ${message}${trace ? `\n${trace}` : ''}\n`;

    try {
      fs.appendFileSync(this.logFilePath, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(message: string, context?: string) {
    super.log(message, context);
    this.writeToFile('LOG', message, context);
  }

  error(message: string, trace?: string, context?: string) {
    super.error(message, trace, context);
    this.writeToFile('ERROR', message, context, trace);
  }

  warn(message: string, context?: string) {
    super.warn(message, context);
    this.writeToFile('WARN', message, context);
  }

  debug(message: string, context?: string) {
    super.debug(message, context);
    this.writeToFile('DEBUG', message, context);
  }

  verbose(message: string, context?: string) {
    super.verbose(message, context);
    this.writeToFile('VERBOSE', message, context);
  }

  fatal(message: string, context?: string) {
    super.fatal(message, context);
    this.writeToFile('FATAL', message, context);
  }
}
