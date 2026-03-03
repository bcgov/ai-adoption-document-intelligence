import type { AppLoggerService } from "@/logging/app-logger.service";

export const mockAppLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as unknown as AppLoggerService;
