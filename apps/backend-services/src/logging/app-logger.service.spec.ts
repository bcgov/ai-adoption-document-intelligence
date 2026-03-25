const mockLoggerMethods = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock("@ai-di/shared-logging", () => ({
  createLogger: jest.fn(() => mockLoggerMethods),
  getLogLevel: jest.fn(() => "info"),
}));

jest.mock("./request-context", () => ({
  getRequestContext: jest.fn(),
}));

import { AppLoggerService } from "./app-logger.service";
import { getRequestContext } from "./request-context";

const mockGetRequestContext = getRequestContext as jest.MockedFunction<
  typeof getRequestContext
>;

describe("AppLoggerService", () => {
  let service: AppLoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppLoggerService();
  });

  describe("without request context", () => {
    beforeEach(() => mockGetRequestContext.mockReturnValue(undefined));

    it("debug delegates to logger.debug with no extra context", () => {
      service.debug("test message");
      expect(mockLoggerMethods.debug).toHaveBeenCalledWith("test message", {});
    });

    it("debug merges provided context", () => {
      service.debug("msg", { key: "val" });
      expect(mockLoggerMethods.debug).toHaveBeenCalledWith("msg", {
        key: "val",
      });
    });

    it("log delegates to logger.info", () => {
      service.log("log msg");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("log msg", {});
    });

    it("info delegates to logger.info", () => {
      service.info("info msg");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("info msg", {});
    });

    it("warn delegates to logger.warn", () => {
      service.warn("warn msg");
      expect(mockLoggerMethods.warn).toHaveBeenCalledWith("warn msg", {});
    });

    it("error delegates to logger.error", () => {
      service.error("err msg");
      expect(mockLoggerMethods.error).toHaveBeenCalledWith("err msg", {});
    });

    it("child delegates to logger.child with provided context", () => {
      const childLogger = { debug: jest.fn() };
      mockLoggerMethods.child.mockReturnValueOnce(childLogger);
      const result = service.child({ module: "test" });
      expect(mockLoggerMethods.child).toHaveBeenCalledWith({ module: "test" });
      expect(result).toBe(childLogger);
    });
  });

  describe("with full request context (requestId and userId)", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({
        requestId: "req-123",
        actorId: "user-456",
      }),
    );

    it("debug merges requestId and actorId", () => {
      service.debug("trace");
      expect(mockLoggerMethods.debug).toHaveBeenCalledWith("trace", {
        requestId: "req-123",
        actorId: "user-456",
      });
    });

    it("child merges request context", () => {
      service.child({ extra: "val" });
      expect(mockLoggerMethods.child).toHaveBeenCalledWith({
        requestId: "req-123",
        actorId: "user-456",
        extra: "val",
      });
    });

    it("provided context overrides merged context", () => {
      service.log("msg", { requestId: "override" });
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("msg", {
        requestId: "override",
        actorId: "user-456",
      });
    });
  });

  describe("with partial request context (only requestId)", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({ requestId: "req-only" }),
    );

    it("does not add userId when absent from context", () => {
      service.log("msg");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("msg", {
        requestId: "req-only",
      });
    });
  });

  describe("with sessionId in request context", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({
        requestId: "req-1",
        userId: "user-1",
        sessionId: "session-abc-123",
      }),
    );

    it("includes sessionId in merged context", () => {
      service.log("test message");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("test message", {
        requestId: "req-1",
        userId: "user-1",
        sessionId: "session-abc-123",
      });
    });
  });

  describe("with clientIp in request context", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({
        requestId: "req-3",
        clientIp: "203.0.113.50",
      }),
    );

    it("includes clientIp in merged context", () => {
      service.log("test message");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("test message", {
        requestId: "req-3",
        clientIp: "203.0.113.50",
      });
    });
  });

  describe("with apiKeyId in request context", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({
        requestId: "req-5",
        apiKeyId: "aBcDeFgH",
      }),
    );

    it("includes apiKeyId in merged context", () => {
      service.log("test message");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("test message", {
        requestId: "req-5",
        apiKeyId: "aBcDeFgH",
      });
    });
  });

  describe("omits falsy optional fields", () => {
    beforeEach(() =>
      mockGetRequestContext.mockReturnValue({
        requestId: "req-6",
        sessionId: undefined,
        apiKeyId: undefined,
        clientIp: undefined,
      }),
    );

    it("does not include undefined optional fields", () => {
      service.log("test message");
      expect(mockLoggerMethods.info).toHaveBeenCalledWith("test message", {
        requestId: "req-6",
      });
    });
  });

  describe("static getLogLevel", () => {
    it("exposes the getLogLevel function", () => {
      expect(AppLoggerService.getLogLevel).toBeDefined();
      expect(typeof AppLoggerService.getLogLevel).toBe("function");
    });
  });
});
