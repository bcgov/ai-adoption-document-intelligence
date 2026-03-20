import type { NextFunction, Request, Response } from "express";
import { LoggingMiddleware } from "./logging.middleware";
import { AppLoggerService } from "./app-logger.service";
import { requestContext } from "./request-context";
import type { Socket } from "net";

describe("LoggingMiddleware", () => {
  let middleware: LoggingMiddleware;
  let mockLogger: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AppLoggerService>;
    middleware = new LoggingMiddleware(mockLogger);
  });

  function createMockRequest(
    headers: Record<string, string | string[] | undefined>,
    remoteAddress?: string,
  ): Request {
    return {
      headers,
      socket: { remoteAddress } as Socket,
    } as unknown as Request;
  }

  function createMockResponse(): Response {
    return {
      setHeader: jest.fn(),
    } as unknown as Response;
  }

  it("should extract clientIp from X-Forwarded-For header (first IP)", (done) => {
    const req = createMockRequest(
      { "x-forwarded-for": "203.0.113.50, 70.41.3.18, 150.172.238.178" },
      "127.0.0.1",
    );
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("203.0.113.50");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should trim whitespace from X-Forwarded-For first IP", (done) => {
    const req = createMockRequest(
      { "x-forwarded-for": "  10.0.0.1 , 10.0.0.2" },
      "127.0.0.1",
    );
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("10.0.0.1");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should extract clientIp from single-entry X-Forwarded-For header", (done) => {
    const req = createMockRequest(
      { "x-forwarded-for": "192.168.1.1" },
      "127.0.0.1",
    );
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("192.168.1.1");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should fallback to X-Real-IP when X-Forwarded-For is absent", (done) => {
    const req = createMockRequest(
      { "x-real-ip": "10.0.0.5" },
      "127.0.0.1",
    );
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("10.0.0.5");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should fallback to socket remoteAddress when no proxy headers present", (done) => {
    const req = createMockRequest({}, "::1");
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("::1");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should prefer X-Forwarded-For over X-Real-IP", (done) => {
    const req = createMockRequest(
      {
        "x-forwarded-for": "203.0.113.50",
        "x-real-ip": "10.0.0.5",
      },
      "127.0.0.1",
    );
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBe("203.0.113.50");
      done();
    };
    middleware.use(req, res, next);
  });

  it("should set clientIp to undefined when no headers and no socket address", (done) => {
    const req = createMockRequest({}, undefined);
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.clientIp).toBeUndefined();
      done();
    };
    middleware.use(req, res, next);
  });

  it("should always generate a requestId", (done) => {
    const req = createMockRequest({}, "127.0.0.1");
    const res = createMockResponse();
    const next: NextFunction = () => {
      const store = requestContext.getStore();
      expect(store?.requestId).toBeDefined();
      expect(typeof store?.requestId).toBe("string");
      done();
    };
    middleware.use(req, res, next);
  });
});
