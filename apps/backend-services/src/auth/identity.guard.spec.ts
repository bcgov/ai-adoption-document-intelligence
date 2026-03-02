import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdentityGuard } from "./identity.guard";

describe("IdentityGuard", () => {
  let guard: IdentityGuard;
  let reflector: Reflector;

  /**
   * Builds a minimal mock ExecutionContext backed by the given request object.
   */
  const createContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    guard = new IdentityGuard(reflector);
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: JWT authentication
  // ---------------------------------------------------------------------------

  it("should set resolvedIdentity with userId only for a JWT-authenticated request", () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id", email: "jwt@example.com", roles: ["user"] },
    };

    const result = guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({ userId: "jwt-user-id" });
  });

  it("should not include groupId in resolvedIdentity for a JWT request", () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupId?: string }).groupId,
    ).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: API key authentication
  // ---------------------------------------------------------------------------

  it("should set resolvedIdentity with only groupId for an API-key-authenticated request", () => {
    const request: Record<string, unknown> = {
      // No request.user — API key auth does not set a user object
      apiKeyGroupId: "group-abc",
    };

    const result = guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({ groupId: "group-abc" });
  });

  it("should not include userId in resolvedIdentity for API key authentication", () => {
    const request: Record<string, unknown> = {
      apiKeyGroupId: "specific-group-id",
    };

    guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { userId?: string }).userId,
    ).toBeUndefined();
  });

  it("should prefer API key path over JWT path when apiKeyGroupId is set", () => {
    // Edge case: both present (should not happen in practice, but guard should be deterministic)
    const request: Record<string, unknown> = {
      user: { sub: "some-user" },
      apiKeyGroupId: "group-id",
    };

    guard.canActivate(createContext(request));

    expect(request.resolvedIdentity).toEqual({ groupId: "group-id" });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: No authenticated user (public route or unauthenticated)
  // ---------------------------------------------------------------------------

  it("should return true and skip identity resolution when request.user is absent", () => {
    const request: Record<string, unknown> = {};

    const result = guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toBeUndefined();
  });

  it("should return true and skip identity resolution when request.user has no sub", () => {
    const request: Record<string, unknown> = {
      user: { email: "nosub@example.com" },
    };

    const result = guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Composability with existing auth guards
  // ---------------------------------------------------------------------------

  it("should always return true and never throw", () => {
    const requests = [
      {},
      { user: { sub: "user-1" } },
      { apiKeyGroupId: "group-1" },
    ];

    for (const request of requests) {
      expect(() =>
        guard.canActivate(createContext(request as Record<string, unknown>)),
      ).not.toThrow();
      const result = guard.canActivate(
        createContext(request as Record<string, unknown>),
      );
      expect(result).toBe(true);
    }
  });

  it("should not modify request.user when setting resolvedIdentity", () => {
    const originalUser = {
      sub: "user-id",
      email: "user@example.com",
      roles: ["user"],
    };
    const request: Record<string, unknown> = { user: { ...originalUser } };

    guard.canActivate(createContext(request));

    expect(request.user).toEqual(originalUser);
  });
});
