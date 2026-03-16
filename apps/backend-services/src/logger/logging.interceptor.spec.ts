import { of, throwError } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request, Response } from "express";
import { LoggingInterceptor } from "./logging.interceptor";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";

jest.mock("@/logging/request-context", () => ({
  getRequestContext: jest.fn(),
}));

const mockGetRequestContext = getRequestContext as jest.MockedFunction<
  typeof getRequestContext
>;

const mockLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
} as unknown as AppLoggerService;

const makeHttpContext = (
  req: Partial<Request> = {},
  res: Partial<Response> = {},
): ExecutionContext =>
  ({
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: <T>() =>
        ({
          method: "GET",
          url: "/api/test",
          path: "/api/test",
          body: {},
          query: {},
          params: {},
          ...req,
        }) as T,
      getResponse: <T>() => ({ statusCode: 200, ...res }) as T,
    }),
  }) as unknown as ExecutionContext;

describe("LoggingInterceptor", () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockReturnValue(undefined);
    interceptor = new LoggingInterceptor(mockLogger);
  });

  describe("non-HTTP context", () => {
    it("returns next.handle() without logging for non-http context", () => {
      const nonHttpCtx = {
        getType: () => "rpc",
      } as unknown as ExecutionContext;
      const values: unknown[] = [];
      const next: CallHandler = { handle: () => of("rpc-result") };
      interceptor.intercept(nonHttpCtx, next).subscribe((v) => values.push(v));
      expect(values).toEqual(["rpc-result"]);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe("HTTP context - request start logging", () => {
    it("logs HTTP request start with method and path", () => {
      const ctx = makeHttpContext({ method: "POST", path: "/api/items" });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "HTTP request start",
        expect.objectContaining({ method: "POST", path: "/api/items" }),
      );
    });

    it("uses url when path is undefined", () => {
      const ctx = makeHttpContext({ url: "/url-path", path: undefined as unknown as string });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "HTTP request start",
        expect.objectContaining({ path: "/url-path" }),
      );
    });

    it("includes requestId and userId from request context when present", () => {
      mockGetRequestContext.mockReturnValue({
        requestId: "req-123",
        userId: "user-abc",
      });
      const ctx = makeHttpContext();
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "HTTP request start",
        expect.objectContaining({ requestId: "req-123", userId: "user-abc" }),
      );
    });
  });

  describe("query logging", () => {
    it("logs query when query params are present", () => {
      const ctx = makeHttpContext({ query: { filter: "active" } });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "HTTP request query",
        expect.objectContaining({ query: { filter: "active" } }),
      );
    });

    it("skips query logging when query is empty", () => {
      const ctx = makeHttpContext({ query: {} });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        "HTTP request query",
        expect.anything(),
      );
    });
  });

  describe("params logging", () => {
    it("logs params when route params are present", () => {
      const ctx = makeHttpContext({ params: { id: "42" } });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "HTTP request params",
        expect.objectContaining({ params: { id: "42" } }),
      );
    });

    it("skips params logging when params is empty", () => {
      const ctx = makeHttpContext({ params: {} });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        "HTTP request params",
        expect.anything(),
      );
    });
  });

  describe("body logging", () => {
    it("logs body when body has keys", () => {
      const ctx = makeHttpContext({ body: { name: "test" } });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "HTTP request body",
        expect.objectContaining({ body: '{"name":"test"}' }),
      );
    });

    it("skips body logging when body is empty", () => {
      const ctx = makeHttpContext({ body: {} });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        "HTTP request body",
        expect.anything(),
      );
    });

    it("skips body logging when body is null", () => {
      const ctx = makeHttpContext({ body: null });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        "HTTP request body",
        expect.anything(),
      );
    });

    it("truncates body longer than 500 characters", () => {
      const largeBody = { data: "x".repeat(600) };
      const ctx = makeHttpContext({ body: largeBody });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      const call = (mockLogger.debug as jest.Mock).mock.calls.find(
        (c: unknown[]) => c[0] === "HTTP request body",
      );
      expect(call).toBeDefined();
      expect((call[1].body as string).endsWith("...")).toBe(true);
    });

    it("does not truncate body under 500 characters", () => {
      const smallBody = { key: "short" };
      const ctx = makeHttpContext({ body: smallBody });
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      const call = (mockLogger.debug as jest.Mock).mock.calls.find(
        (c: unknown[]) => c[0] === "HTTP request body",
      );
      expect(call).toBeDefined();
      expect((call[1].body as string).endsWith("...")).toBe(false);
    });
  });

  describe("response tap", () => {
    it("logs HTTP request complete on success", () => {
      const ctx = makeHttpContext();
      const next: CallHandler = { handle: () => of({ id: 1 }) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "HTTP request complete",
        expect.objectContaining({ statusCode: 200, durationMs: expect.any(Number) }),
      );
    });

    it("logs response body when data is present", () => {
      const ctx = makeHttpContext();
      const next: CallHandler = { handle: () => of({ id: 1 }) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "HTTP response body",
        expect.objectContaining({ responseBody: '{"id":1}' }),
      );
    });

    it("skips response body logging when data is null/undefined", () => {
      const ctx = makeHttpContext();
      const next: CallHandler = { handle: () => of(null) };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        "HTTP response body",
        expect.anything(),
      );
    });

    it("truncates response body longer than 500 chars", () => {
      const largeData = { result: "y".repeat(600) };
      const ctx = makeHttpContext();
      const next: CallHandler = { handle: () => of(largeData) };
      interceptor.intercept(ctx, next).subscribe();
      const call = (mockLogger.debug as jest.Mock).mock.calls.find(
        (c: unknown[]) => c[0] === "HTTP response body",
      );
      expect(call).toBeDefined();
      expect((call[1].responseBody as string).endsWith("...")).toBe(true);
    });
  });

  describe("error handling via catchError", () => {
    it("logs HTTP request failed with status from error.status", (done) => {
      const ctx = makeHttpContext();
      const next: CallHandler = {
        handle: () => throwError(() => ({ message: "not found", status: 404 })),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(mockLogger.error).toHaveBeenCalledWith(
            "HTTP request failed",
            expect.objectContaining({ statusCode: 404 }),
          );
          done();
        },
      });
    });

    it("defaults statusCode to 500 when error.status is absent", (done) => {
      const ctx = makeHttpContext();
      const next: CallHandler = {
        handle: () => throwError(() => ({ message: "unknown" })),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(mockLogger.error).toHaveBeenCalledWith(
            "HTTP request failed",
            expect.objectContaining({ statusCode: 500 }),
          );
          done();
        },
      });
    });

    it("logs stack trace at debug level when error.stack is present", (done) => {
      const ctx = makeHttpContext();
      const next: CallHandler = {
        handle: () =>
          throwError(() => ({ message: "err", stack: "Error: err\n  at X" })),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(mockLogger.debug).toHaveBeenCalledWith(
            "HTTP request error stack",
            expect.objectContaining({ stack: "Error: err\n  at X" }),
          );
          done();
        },
      });
    });

    it("skips stack debug when error.stack is absent", (done) => {
      const ctx = makeHttpContext();
      const next: CallHandler = {
        handle: () => throwError(() => ({ message: "no stack" })),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(mockLogger.debug).not.toHaveBeenCalledWith(
            "HTTP request error stack",
            expect.anything(),
          );
          done();
        },
      });
    });

    it("re-throws the error after logging", (done) => {
      const originalError = { message: "boom", status: 503 };
      const ctx = makeHttpContext();
      const next: CallHandler = {
        handle: () => throwError(() => originalError),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: (err: unknown) => {
          expect(err).toBe(originalError);
          done();
        },
      });
    });
  });
});
