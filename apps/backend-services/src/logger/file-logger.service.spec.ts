import * as fs from "fs";
import { ConsoleLogger } from "@nestjs/common";
import { FileLogger } from "./file-logger.service";

jest.mock("fs", () => ({
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<
  typeof fs.writeFileSync
>;
const mockAppendFileSync = fs.appendFileSync as jest.MockedFunction<
  typeof fs.appendFileSync
>;

describe("FileLogger", () => {
  let logger: FileLogger;
  const testLogPath = "/tmp/test-backend.log";

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress ConsoleLogger output during tests
    jest.spyOn(ConsoleLogger.prototype, "log").mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, "error").mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, "warn").mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, "debug").mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, "verbose").mockImplementation();
    jest.spyOn(ConsoleLogger.prototype, "fatal").mockImplementation();
    logger = new FileLogger(testLogPath);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("writes the startup header to the log file", () => {
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("Backend started at"),
      );
    });

    it("uses default path when none provided", () => {
      const loggerDefault = new FileLogger();
      const callArg = mockWriteFileSync.mock.calls[1]?.[0] as string;
      expect(typeof callArg).toBe("string");
      expect(callArg).toContain("backend.log");
    });

    it("logs to console.error when writeFileSync throws", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error("disk full");
      });
      new FileLogger(testLogPath);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to initialize log file:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("log", () => {
    it("calls super.log and appends LOG entry to file", () => {
      logger.log("hello world");
      expect(ConsoleLogger.prototype.log).toHaveBeenCalledWith(
        "hello world",
        undefined,
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[LOG]"),
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("hello world"),
      );
    });

    it("includes context in log entry when provided", () => {
      logger.log("msg", "MyContext");
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[MyContext]"),
      );
    });
  });

  describe("error", () => {
    it("calls super.error and appends ERROR entry", () => {
      logger.error("something broke", "stack trace", "ErrorCtx");
      expect(ConsoleLogger.prototype.error).toHaveBeenCalledWith(
        "something broke",
        "stack trace",
        "ErrorCtx",
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[ERROR]"),
      );
    });

    it("includes trace in file entry when provided", () => {
      logger.error("err", "the trace");
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("the trace"),
      );
    });

    it("does not include trace section when trace is absent", () => {
      logger.error("err only");
      const entry = (mockAppendFileSync.mock.calls[0][1] as string);
      expect(entry.includes("\nundefined")).toBe(false);
    });
  });

  describe("warn", () => {
    it("calls super.warn and appends WARN entry", () => {
      logger.warn("watch out");
      expect(ConsoleLogger.prototype.warn).toHaveBeenCalledWith(
        "watch out",
        undefined,
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[WARN]"),
      );
    });
  });

  describe("debug", () => {
    it("calls super.debug and appends DEBUG entry", () => {
      logger.debug("debugging");
      expect(ConsoleLogger.prototype.debug).toHaveBeenCalledWith(
        "debugging",
        undefined,
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[DEBUG]"),
      );
    });
  });

  describe("verbose", () => {
    it("calls super.verbose and appends VERBOSE entry", () => {
      logger.verbose("details");
      expect(ConsoleLogger.prototype.verbose).toHaveBeenCalledWith(
        "details",
        undefined,
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[VERBOSE]"),
      );
    });
  });

  describe("fatal", () => {
    it("calls super.fatal and appends FATAL entry", () => {
      logger.fatal("critical failure");
      expect(ConsoleLogger.prototype.fatal).toHaveBeenCalledWith(
        "critical failure",
        undefined,
      );
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        testLogPath,
        expect.stringContaining("[FATAL]"),
      );
    });
  });

  describe("writeToFile error handling", () => {
    it("logs to console.error when appendFileSync throws", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      mockAppendFileSync.mockImplementationOnce(() => {
        throw new Error("write failed");
      });
      logger.log("test");
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to write to log file:",
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
