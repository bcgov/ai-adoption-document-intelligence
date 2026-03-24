import type { NextFunction, Request, Response } from "express";
import { AppLoggerService } from "./app-logger.service";
import { LoggingMiddleware } from "./logging.middleware";
import { requestContext } from "./request-context";
import type { Socket } from "net";

jest.mock("./request-context", () => ({
  requestContext: { run: jest.fn() },
  getRequestContext: jest.fn(),
}));

const mockRun = requestContext.run as jest.MockedFunction<
  typeof requestContext.run
>;

const mockLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
} as unknown as AppLoggerService;

describe("LoggingMiddleware", () => {
  let middleware: LoggingMiddleware;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = new LoggingMiddleware(mockLogger);

    mockRes = { setHeader: jest.fn() } as Partial<Response>;
    mockNext = jest.fn();

    mockRun.mockImplementation((_store, callback) => callback());
  });

  function createMockRequest(
    headers: Record<string, string | string[] | undefined> = {},
    remoteAddress?: string,
  ): Request {
    return {
      headers,
      socket: { remoteAddress } as Socket,
    } as unknown as Request;
  }

  it("sets a UUID request-id header on the request", () => {
    const req = createMockRequest({}, "127.0.0.1");
    middleware.use(req, mockRes as Response, mockNext);
    const requestId = req.headers["x-request-id"];
    expect(typeof requestId).toBe("string");
    expect((requestId as string).length).toBeGreaterThan(0);
  });

  it("sets the x-request-id header on the response", () => {
    const req = createMockRequest({}, "127.0.0.1");
    middleware.use(req, mockRes as Response, mockNext);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
  });

  it("runs the context store and calls next", () => {
    const req = createMockRequest({}, "127.0.0.1");
    middleware.use(req, mockRes as Response, mockNext);
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: expect.any(String) }),
      expect.any(Function),
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it("assigns the same requestId to request header and context store", () => {
    const req = createMockRequest({}, "127.0.0.1");
    middleware.use(req, mockRes as Response, mockNext);
    const headerRequestId = req.headers["x-request-id"];
    const storeArg = mockRun.mock.calls[0][0];
    expect(storeArg.requestId).toBe(headerRequestId);
  });

  it("generates unique requestIds across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const req = createMockRequest({}, "127.0.0.1");
      middleware.use(req, mockRes as Response, mockNext);
      ids.add(req.headers["x-request-id"] as string);
    }
    expect(ids.size).toBe(5);
  });

  describe("clientIp extraction", () => {
    it("extracts clientIp from X-Forwarded-For header (first IP)", () => {
      const req = createMockRequest(
        { "x-forwarded-for": "203.0.113.50, 70.41.3.18, 150.172.238.178" },
        "127.0.0.1",
      );
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("203.0.113.50");
    });

    it("trims whitespace from X-Forwarded-For first IP", () => {
      const req = createMockRequest(
        { "x-forwarded-for": "  10.0.0.1 , 10.0.0.2" },
        "127.0.0.1",
      );
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("10.0.0.1");
    });

    it("extracts clientIp from single-entry X-Forwarded-For header", () => {
      const req = createMockRequest(
        { "x-forwarded-for": "192.168.1.1" },
        "127.0.0.1",
      );
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("192.168.1.1");
    });

    it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
      const req = createMockRequest(
        { "x-real-ip": "10.0.0.5" },
        "127.0.0.1",
      );
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("10.0.0.5");
    });

    it("falls back to socket remoteAddress when no proxy headers present", () => {
      const req = createMockRequest({}, "::1");
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("::1");
    });

    it("prefers X-Forwarded-For over X-Real-IP", () => {
      const req = createMockRequest(
        {
          "x-forwarded-for": "203.0.113.50",
          "x-real-ip": "10.0.0.5",
        },
        "127.0.0.1",
      );
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBe("203.0.113.50");
    });

    it("sets clientIp to undefined when no headers and no socket address", () => {
      const req = createMockRequest({}, undefined);
      middleware.use(req, mockRes as Response, mockNext);
      const storeArg = mockRun.mock.calls[0][0];
      expect(storeArg.clientIp).toBeUndefined();
    });
  });
});
