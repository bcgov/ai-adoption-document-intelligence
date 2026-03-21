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

  it("should set apiKeyId in the request context store when apiKeyPrefix is present (API key auth)", (done) => {
    const request: Record<string, unknown> = {
      apiKeyPrefix: "aBcDeFgH",
      apiKeyGroupId: "group-123",
      headers: { "x-request-id": "req-1", "x-api-key": "aBcDeFgH-rest-of-key" },
      method: "POST",
      path: "/api/resource",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.apiKeyId).toBe("aBcDeFgH");
        done();
      });
    });
  });

  it("should omit sessionId when request is authenticated via API key", (done) => {
    const request: Record<string, unknown> = {
      apiKeyPrefix: "aBcDeFgH",
      apiKeyGroupId: "group-123",
      headers: { "x-request-id": "req-1", "x-api-key": "aBcDeFgH-rest-of-key" },
      method: "POST",
      path: "/api/resource",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.apiKeyId).toBe("aBcDeFgH");
        expect(store.sessionId).toBeUndefined();
        done();
      });
    });
  });

  it("should omit apiKeyId when request is authenticated via JWT", (done) => {
    const request: Record<string, unknown> = {
      user: { sub: "user-1", session_state: "keycloak-session-uuid-456" },
      resolvedIdentity: { userId: "user-1" },
      headers: { "x-request-id": "req-1" },
      method: "GET",
      path: "/api/resource",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.sessionId).toBe("keycloak-session-uuid-456");
        expect(store.apiKeyId).toBeUndefined();
        done();
      });
    });
  });

  it("should only log the key prefix, never the full API key value", (done) => {
    const fullApiKey = "aBcDeFgH-this-is-the-rest-of-the-secret-key-value";
    const request: Record<string, unknown> = {
      apiKeyPrefix: "aBcDeFgH",
      apiKeyGroupId: "group-123",
      headers: { "x-request-id": "req-1", "x-api-key": fullApiKey },
      method: "POST",
      path: "/api/resource",
      res: { statusCode: 200 },
    };

    const store: RequestContextData = { requestId: "req-1" };

    requestContext.run(store, () => {
      const context = createContext(request);
      interceptor.intercept(context, createCallHandler()).subscribe(() => {
        expect(store.apiKeyId).toBe("aBcDeFgH");
        expect(store.apiKeyId).not.toBe(fullApiKey);
        expect(store.apiKeyId?.length).toBeLessThan(fullApiKey.length);
        // Verify the logged context does not contain the full key
        const loggedContext = mockLogger.log.mock.calls[0][1];
        expect(JSON.stringify(loggedContext)).not.toContain(fullApiKey);
        done();
      });
    });
  });
});
