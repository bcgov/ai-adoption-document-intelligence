import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { CsrfGuard } from "./csrf.guard";
import { AUTH_COOKIE_NAMES, CSRF_HEADER_NAME } from "./cookie-auth.utils";

function createMockContext(overrides: {
  method: string;
  headers?: Record<string, string | undefined>;
  cookies?: Record<string, string>;
}): ExecutionContext {
  const request = {
    method: overrides.method,
    headers: overrides.headers || {},
    cookies: overrides.cookies || {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe("CsrfGuard", () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  describe("safe methods", () => {
    it.each(["GET", "HEAD", "OPTIONS"])("should allow %s requests", (method) => {
      const context = createMockContext({ method });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("Bearer token requests", () => {
    it("should skip CSRF check for Bearer-authenticated requests", () => {
      const context = createMockContext({
        method: "POST",
        headers: { authorization: "Bearer some-jwt-token" },
        cookies: { [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "token" },
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("API key requests", () => {
    it("should skip CSRF check for API key requests", () => {
      const context = createMockContext({
        method: "POST",
        headers: { "x-api-key": "some-api-key" },
        cookies: { [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "token" },
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("no auth cookie", () => {
    it("should skip CSRF check when no access_token cookie is present", () => {
      const context = createMockContext({
        method: "POST",
        cookies: {},
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("cookie-authenticated state-changing requests", () => {
    it("should allow when CSRF header matches CSRF cookie", () => {
      const csrfValue = "valid-csrf-token";
      const context = createMockContext({
        method: "POST",
        headers: { [CSRF_HEADER_NAME]: csrfValue },
        cookies: {
          [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "jwt",
          [AUTH_COOKIE_NAMES.CSRF_TOKEN]: csrfValue,
        },
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should throw ForbiddenException when CSRF header is missing", () => {
      const context = createMockContext({
        method: "POST",
        cookies: {
          [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "jwt",
          [AUTH_COOKIE_NAMES.CSRF_TOKEN]: "csrf-value",
        },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when CSRF cookie is missing", () => {
      const context = createMockContext({
        method: "DELETE",
        headers: { [CSRF_HEADER_NAME]: "csrf-value" },
        cookies: {
          [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "jwt",
        },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when CSRF header and cookie don't match", () => {
      const context = createMockContext({
        method: "PUT",
        headers: { [CSRF_HEADER_NAME]: "wrong-value" },
        cookies: {
          [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "jwt",
          [AUTH_COOKIE_NAMES.CSRF_TOKEN]: "correct-value",
        },
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should work for PUT, DELETE, and PATCH methods", () => {
      const csrfValue = "valid-csrf";
      for (const method of ["PUT", "DELETE", "PATCH"]) {
        const context = createMockContext({
          method,
          headers: { [CSRF_HEADER_NAME]: csrfValue },
          cookies: {
            [AUTH_COOKIE_NAMES.ACCESS_TOKEN]: "jwt",
            [AUTH_COOKIE_NAMES.CSRF_TOKEN]: csrfValue,
          },
        });
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });
});
