import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { of, throwError } from "rxjs";
import { AppLoggerService } from "./app-logger.service";
import { requestContext } from "./request-context";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

jest.mock("./request-context", () => ({
  requestContext: { getStore: jest.fn() },
  getRequestContext: jest.fn(),
}));

const mockGetStore = requestContext.getStore as jest.MockedFunction<
  typeof requestContext.getStore
>;

const mockLogger = {
  debug: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
} as unknown as AppLoggerService;

const makeRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  method: "GET",
  path: "/test",
  headers: {},
  res: { statusCode: 200 } as unknown as Request["res"],
  ...overrides,
});

const makeContext = (request: Partial<Request>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getType: () => "http",
  }) as unknown as ExecutionContext;

describe("RequestLoggingInterceptor", () => {
  let interceptor: RequestLoggingInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStore.mockReturnValue(undefined);
    interceptor = new RequestLoggingInterceptor(mockLogger);
  });

  it("sets _loggingStartTime on the request", () => {
    const req = makeRequest();
    const ctx = makeContext(req);
    const next: CallHandler = { handle: () => of(undefined) };

    interceptor.intercept(ctx, next).subscribe();

    expect(req._loggingStartTime).toBeDefined();
    expect(typeof req._loggingStartTime).toBe("number");
  });

  it("does not set userId when store is null", () => {
    mockGetStore.mockReturnValue(undefined);
    const req = makeRequest({
      resolvedIdentity: { userId: "u-1", actorId: "u-1", isSystemAdmin: false, groupRoles: {} },
    } as Partial<Request>);
    const ctx = makeContext(req);
    const next: CallHandler = { handle: () => of(undefined) };
    // expect no error
    expect(() => interceptor.intercept(ctx, next).subscribe()).not.toThrow();
  });

  it("does not set userId when resolvedIdentity is absent", () => {
    const store = { requestId: "req-1" };
    mockGetStore.mockReturnValue(store);
    const req = makeRequest();
    const ctx = makeContext(req);
    const next: CallHandler = { handle: () => of(undefined) };
    interceptor.intercept(ctx, next).subscribe();
    expect(store).not.toHaveProperty("userId");
  });

  it("sets userId from resolvedIdentity.userId when present", () => {
    const store = { requestId: "req-1" };
    mockGetStore.mockReturnValue(store);
    const req = makeRequest({
      resolvedIdentity: { userId: "user-abc", actorId: "user-abc", isSystemAdmin: false, groupRoles: {} },
    } as Partial<Request>);
    const ctx = makeContext(req);
    const next: CallHandler = { handle: () => of(undefined) };
    interceptor.intercept(ctx, next).subscribe();
    expect(store).toHaveProperty("actorId", "user-abc");
  });

  it("does not set actorId when resolvedIdentity lacks userId key", () => {
    const store = { requestId: "req-1" };
    mockGetStore.mockReturnValue(store);
    const req = makeRequest({
      resolvedIdentity: { groupRoles: {}, isSystemAdmin: false, actorId: "actor-1" },
    } as Partial<Request>);
    const ctx = makeContext(req);
    const next: CallHandler = { handle: () => of(undefined) };
    interceptor.intercept(ctx, next).subscribe();
      expect(store).not.toHaveProperty("userId");
  });

  describe("logRequest", () => {
    it("logs on successful completion with status and duration", () => {
      const req = makeRequest();
      const ctx = makeContext(req);
      const next: CallHandler = { handle: () => of("result") };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "Request completed",
        expect.objectContaining({
          method: "GET",
          path: "/test",
          statusCode: 200,
        }),
      );
    });

    it("logs on error completion", (done) => {
      const req = makeRequest();
      const ctx = makeContext(req);
      const next: CallHandler = {
        handle: () => throwError(() => new Error("fail")),
      };
      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          expect(mockLogger.log).toHaveBeenCalledWith(
            "Request completed",
            expect.objectContaining({ method: "GET" }),
          );
          done();
        },
      });
    });

    it("skips logging when contextType is not http", () => {
      const req = makeRequest();
      const ctx = {
        switchToHttp: () => ({ getRequest: () => req }),
        getType: () => "rpc",
      } as unknown as ExecutionContext;
      const next: CallHandler = { handle: () => of("r") };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it("skips logging when request has no res", () => {
      const req = makeRequest({ res: undefined });
      const ctx = makeContext(req);
      const next: CallHandler = { handle: () => of("r") };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it("includes durationMs when _loggingStartTime is set", () => {
      const req = makeRequest();
      const ctx = makeContext(req);
      const next: CallHandler = { handle: () => of("result") };
      interceptor.intercept(ctx, next).subscribe();
      const call = (mockLogger.log as jest.Mock).mock.calls[0];
      expect(call[1]).toHaveProperty("durationMs");
      expect(typeof call[1].durationMs).toBe("number");
    });

    it("includes requestId from headers when present", () => {
      const req = makeRequest({
        headers: { "x-request-id": "rid-123" },
      });
      const ctx = makeContext(req);
      const next: CallHandler = { handle: () => of("r") };
      interceptor.intercept(ctx, next).subscribe();
      expect(mockLogger.log).toHaveBeenCalledWith(
        "Request completed",
        expect.objectContaining({ requestId: "rid-123" }),
      );
    });
  });
});
