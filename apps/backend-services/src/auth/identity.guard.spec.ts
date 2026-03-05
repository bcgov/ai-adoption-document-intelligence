import { GroupRole } from "@generated/client";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";
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

  /**
   * Creates a Reflector mock that returns the given IdentityOptions for
   * IDENTITY_KEY and `true` for the isPublic key.
   */
  const createReflectorWithIdentity = (
    identityOptions: IdentityOptions = {},
  ): Reflector =>
    ({
      getAllAndOverride: jest
        .fn()
        .mockImplementation((key: string) =>
          key === IDENTITY_KEY ? identityOptions : true,
        ),
    }) as unknown as Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === "isPublic") return true;
        return undefined; // No @Identity by default
      }),
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

  it("should not include groupRoles in resolvedIdentity for a JWT request", () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: unknown }).groupRoles,
    ).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: API key authentication
  // ---------------------------------------------------------------------------

  it("should set resolvedIdentity with groupRoles and isSystemAdmin for an API-key-authenticated request when @Identity is present", () => {
    const identityGuard = new IdentityGuard(createReflectorWithIdentity());
    const request: Record<string, unknown> = {
      // No request.user — API key auth does not set a user object
      apiKeyGroupId: "group-abc",
    };

    const result = identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({
      isSystemAdmin: false,
      groupRoles: { "group-abc": GroupRole.MEMBER },
    });
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

  it("should prefer API key path over JWT path when apiKeyGroupId is set and @Identity is present", () => {
    const identityGuard = new IdentityGuard(createReflectorWithIdentity());
    // Edge case: both present (should not happen in practice, but guard should be deterministic)
    const request: Record<string, unknown> = {
      user: { sub: "some-user" },
      apiKeyGroupId: "group-id",
    };

    identityGuard.canActivate(createContext(request));

    expect(request.resolvedIdentity).toEqual({
      isSystemAdmin: false,
      groupRoles: { "group-id": GroupRole.MEMBER },
    });
  });

  // ---------------------------------------------------------------------------
  // US-003: API key enrichment controlled by @Identity presence
  // ---------------------------------------------------------------------------

  it("should set isSystemAdmin to false when @Identity is present and request uses an API key", () => {
    const identityGuard = new IdentityGuard(createReflectorWithIdentity());
    const request: Record<string, unknown> = { apiKeyGroupId: "group-123" };

    identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(false);
  });

  it("should set groupRoles with the scoped group as MEMBER when @Identity is present and request uses an API key", () => {
    const identityGuard = new IdentityGuard(createReflectorWithIdentity());
    const request: Record<string, unknown> = { apiKeyGroupId: "group-123" };

    identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: Record<string, GroupRole> })
        .groupRoles,
    ).toEqual({ "group-123": GroupRole.MEMBER });
  });

  it("should not set isSystemAdmin or groupRoles when @Identity is absent and request uses an API key", () => {
    // Default guard has no @Identity in reflector mock
    const request: Record<string, unknown> = { apiKeyGroupId: "group-123" };

    guard.canActivate(createContext(request));

    const identity = request.resolvedIdentity as {
      isSystemAdmin?: boolean;
      groupRoles?: Record<string, GroupRole>;
    };
    expect(identity.isSystemAdmin).toBeUndefined();
    expect(identity.groupRoles).toBeUndefined();
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
