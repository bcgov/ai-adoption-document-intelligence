import { CallHandler, ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";
import { AppLoggerService } from "./app-logger.service";
import { requestContext, RequestContextData } from "./request-context";

describe("RequestLoggingInterceptor", () => {
  let interceptor: RequestLoggingInterceptor;
  let mockLogger: jest.Mocked<AppLoggerService>;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AppLoggerService>;
    interceptor = new RequestLoggingInterceptor(mockLogger);
  });

  const createContext = (
    request: Record<string, unknown>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getType: () => "http",
    }) as unknown as ExecutionContext;

  const createCallHandler = (statusCode = 200): CallHandler => {
    return {
      handle: () => of(undefined),
    };
  };

  it("should set sessionId in the request context store when session_state is present on req.user", (done) => {
    const request: Record<string, unknown> = {
      user: { sub: "user-1", session_state: "keycloak-session-uuid-123" },
      resolvedIdentity: { userId: "user-1" },
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/test",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBe("keycloak-session-uuid-123");
        expect(store.userId).toBe("user-1");
        done();
      });
    });
  });

  it("should not set sessionId when req.user has no session_state", (done) => {
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      resolvedIdentity: { userId: "user-1" },
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/test",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBeUndefined();
        done();
      });
    });
  });

  it("should not set sessionId when req.user is undefined (unauthenticated)", (done) => {
    const request: Record<string, unknown> = {
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/public",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBeUndefined();
        done();
      });
    });
  });

  it("should not set sessionId when session_state is an empty string", (done) => {
    const request: Record<string, unknown> = {
      user: { sub: "user-1", session_state: "" },
      resolvedIdentity: { userId: "user-1" },
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/test",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBeUndefined();
        done();
      });
    });
  });

  it("should not set sessionId when session_state is not a string", (done) => {
    const request: Record<string, unknown> = {
      user: { sub: "user-1", session_state: 12345 },
      resolvedIdentity: { userId: "user-1" },
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/test",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBeUndefined();
        done();
      });
    });
  });
});
