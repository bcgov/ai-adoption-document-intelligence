import { LoggerService, LogLevel } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple file-based logger that writes to both console and a log file.
 * Used for debugging Playwright test failures by providing persistent logs.
 */
export class FileLogger implements LoggerService {
  private logFilePath: string;

  constructor(logFilePath?: string) {
    this.logFilePath = logFilePath || path.join(process.cwd(), 'backend.log');

    // Clear log file on startup (optional - comment out to keep historical logs)
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

  log(message: any, context?: string) {
    console.log(message, context || '');
    this.writeToFile('LOG', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    console.error(message, trace || '', context || '');
    this.writeToFile('ERROR', message, context, trace);
  }

  warn(message: any, context?: string) {
    console.warn(message, context || '');
    this.writeToFile('WARN', message, context);
  }

  debug(message: any, context?: string) {
    console.debug(message, context || '');
    this.writeToFile('DEBUG', message, context);
  }

  verbose(message: any, context?: string) {
    console.log(message, context || '');
    this.writeToFile('VERBOSE', message, context);
  }

  fatal(message: any, context?: string) {
    console.error(message, context || '');
    this.writeToFile('FATAL', message, context);
  }

  setLogLevels?(levels: LogLevel[]) {
    // Not implemented - always log all levels
  }
}
