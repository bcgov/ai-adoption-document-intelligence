import { GroupRole } from "@generated/client";
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserService } from "@/actor/user.service";
import { IDENTITY_KEY, IdentityOptions } from "./identity.decorator";
import { IdentityGuard } from "./identity.guard";

describe("IdentityGuard", () => {
  let guard: IdentityGuard;
  let reflector: Reflector;
  let userService: jest.Mocked<Pick<UserService, "findUserWithGroups">>;

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
    userService = {
      findUserWithGroups: jest.fn().mockResolvedValue({
        is_system_admin: false,
        actor_id: "actor-id",
        userGroups: [],
      } as never),
    };
    reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => {
        if (key === "isPublic") return true;
        return undefined; // No @Identity by default
      }),
    } as unknown as Reflector;
    guard = new IdentityGuard(reflector, userService as unknown as UserService);
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: JWT authentication (no @Identity — userId only, no DB queries)
  // ---------------------------------------------------------------------------

  it("should set resolvedIdentity with userId, isSystemAdmin, and groupRoles for a JWT-authenticated request", async () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id", email: "jwt@example.com", roles: ["user"] },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({
      userId: "jwt-user-id",
      isSystemAdmin: false,
      groupRoles: {},
      actorId: "actor-id",
    });
  });

  it("should include groupRoles in resolvedIdentity for a JWT request even when @Identity is absent", async () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    await guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: unknown }).groupRoles,
    ).toEqual({});
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: API key authentication
  // ---------------------------------------------------------------------------

  it("should set resolvedIdentity with groupRoles and isSystemAdmin for an API-key-authenticated request when @Identity is present", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      // No request.user — API key auth does not set a user object
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({
      isSystemAdmin: false,
      groupRoles: { "group-abc": GroupRole.MEMBER },
      actorId: "api-actor-id",
    });
  });

  it("should not include userId in resolvedIdentity for API key authentication when @Identity with allowApiKey is present", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "specific-group-id", actorId: "api-actor-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { userId?: string }).userId,
    ).toBeUndefined();
  });

  it("should prefer API key path over JWT path when apiKey is set and @Identity is present", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    // Edge case: both present (should not happen in practice, but guard should be deterministic)
    const request: Record<string, unknown> = {
      user: { sub: "some-user" },
      apiKey: { groupId: "group-id", actorId: "api-actor-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(request.resolvedIdentity).toEqual({
      isSystemAdmin: false,
      groupRoles: { "group-id": GroupRole.MEMBER },
      actorId: "api-actor-id",
    });
  });

  // ---------------------------------------------------------------------------
  // US-003: API key enrichment controlled by @Identity presence
  // ---------------------------------------------------------------------------

  it("should set isSystemAdmin to false when @Identity is present and request uses an API key", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-123", actorId: "api-actor-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(false);
  });

  it("should set groupRoles with the scoped group as MEMBER when @Identity is present and request uses an API key", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-123", actorId: "api-actor-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: Record<string, GroupRole> })
        .groupRoles,
    ).toEqual({ "group-123": GroupRole.MEMBER });
  });

  it("should throw ForbiddenException when @Identity is absent and request uses an API key", async () => {
    // Default guard has no @Identity in reflector mock
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-123", actorId: "api-actor-id" },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: No authenticated user (public route or unauthenticated)
  // ---------------------------------------------------------------------------

  it("should return true and skip identity resolution when request.user is absent", async () => {
    const request: Record<string, unknown> = {};

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toBeUndefined();
  });

  it("should return true and skip identity resolution when request.user has no sub", async () => {
    const request: Record<string, unknown> = {
      user: { email: "nosub@example.com" },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Composability with existing auth guards
  // ---------------------------------------------------------------------------

  it("should always return true and never throw for JWT and unauthenticated requests", async () => {
    const requests = [{}, { user: { sub: "user-1" } }];

    for (const request of requests) {
      await expect(
        guard.canActivate(createContext(request as Record<string, unknown>)),
      ).resolves.toBe(true);
    }
  });

  it("should not modify request.user when setting resolvedIdentity", async () => {
    const originalUser = {
      sub: "user-id",
      email: "user@example.com",
      roles: ["user"],
    };
    const request: Record<string, unknown> = { user: { ...originalUser } };

    await guard.canActivate(createContext(request));

    expect(request.user).toEqual(originalUser);
  });

  // ---------------------------------------------------------------------------
  // US-004: JWT path enrichment when @Identity is present
  // ---------------------------------------------------------------------------

  it("should set isSystemAdmin from the database when @Identity is present and user is a system admin", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: true,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "admin-user-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(true);
  });

  it("should set isSystemAdmin to false from the database when @Identity is present and user is not a system admin", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "regular-user-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(false);
  });

  it("should set groupRoles from the database when @Identity is present and user belongs to groups", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "g1",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
        {
          user_id: "user-1",
          group_id: "g2",
          role: GroupRole.ADMIN,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: Record<string, GroupRole> })
        .groupRoles,
    ).toEqual({ g1: GroupRole.MEMBER, g2: GroupRole.ADMIN });
  });

  it("should set groupRoles to an empty record when @Identity is present and user has no groups", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-no-groups" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: Record<string, GroupRole> })
        .groupRoles,
    ).toEqual({});
  });

  it("should also set userId on resolvedIdentity when @Identity is present and request is JWT", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect((request.resolvedIdentity as { userId?: string }).userId).toBe(
      "jwt-user-id",
    );
  });

  it("should call findUserWithGroups when @Identity is present and request is JWT", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity(),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-id" },
    };

    await identityGuard.canActivate(createContext(request));

    expect(userService.findUserWithGroups).toHaveBeenCalledWith("user-id");
  });

  it("should call findUserWithGroups even when @Identity is absent and request is JWT", async () => {
    // Guard always queries DB for JWT requests regardless of @Identity presence
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    await guard.canActivate(createContext(request));

    expect(userService.findUserWithGroups).toHaveBeenCalledWith("jwt-user-id");
  });

  // ---------------------------------------------------------------------------
  // US-005: requireSystemAdmin enforcement
  // ---------------------------------------------------------------------------

  it("should allow access when requireSystemAdmin is true and JWT user is a system admin", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: true,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ requireSystemAdmin: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "admin-user-id" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(true);
  });

  it("should throw ForbiddenException when requireSystemAdmin is true and JWT user is not a system admin", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ requireSystemAdmin: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "regular-user-id" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should throw ForbiddenException when requireSystemAdmin is true and request is authenticated via API key", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        requireSystemAdmin: true,
        allowApiKey: true,
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should allow a system admin through even when groupIdFrom is also specified", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: true,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        requireSystemAdmin: true,
        groupIdFrom: { param: "groupId" },
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "admin-user-id" },
      params: { groupId: "some-group" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // US-006: groupIdFrom membership enforcement
  // ---------------------------------------------------------------------------

  it("should pass when group ID is extracted from route param and caller is a member", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-abc",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { param: "groupId" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: { groupId: "group-abc" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should pass when group ID is extracted from query param and caller is a member", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-xyz",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { query: "group_id" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      query: { group_id: "group-xyz" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should pass when group ID is extracted from request body and caller is a member", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-def",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { body: "group_id" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      body: { group_id: "group-def" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should throw BadRequestException when groupIdFrom param is specified but absent from request", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { param: "groupId" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: {},
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(BadRequestException);
  });

  it("should throw ForbiddenException when caller is not a member of the extracted group", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "other-group",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { param: "groupId" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: { groupId: "target-group" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should pass for a system admin regardless of group membership when groupIdFrom is specified", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: true,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: { param: "groupId" } }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "admin-user" },
      params: { groupId: "any-group" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should skip the membership check when groupIdFrom has no param, query, or body set", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ groupIdFrom: {} }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // US-007: minimumRole enforcement within a group
  // ---------------------------------------------------------------------------

  it("should pass when the caller holds exactly the minimum required role (ADMIN with ADMIN requirement)", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-abc",
          role: GroupRole.ADMIN,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        groupIdFrom: { param: "groupId" },
        minimumRole: GroupRole.ADMIN,
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: { groupId: "group-abc" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should pass when the caller holds a higher role than the minimum (ADMIN satisfies MEMBER minimum)", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-abc",
          role: GroupRole.ADMIN,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        groupIdFrom: { param: "groupId" },
        minimumRole: GroupRole.MEMBER,
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: { groupId: "group-abc" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should throw ForbiddenException when caller's role is below the minimum required role (MEMBER with ADMIN requirement)", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-abc",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        groupIdFrom: { param: "groupId" },
        minimumRole: GroupRole.ADMIN,
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
      params: { groupId: "group-abc" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should skip the minimumRole check when groupIdFrom is absent", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ minimumRole: GroupRole.ADMIN }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "user-1" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should pass for a system admin regardless of minimumRole when groupIdFrom is specified", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: true,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        groupIdFrom: { param: "groupId" },
        minimumRole: GroupRole.ADMIN,
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "admin-user" },
      params: { groupId: "any-group" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // US-008: allowApiKey enforcement
  // ---------------------------------------------------------------------------

  it("should throw ForbiddenException when an API key request arrives and allowApiKey is false (default)", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({}),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should throw ForbiddenException when an API key request arrives and allowApiKey is explicitly false", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: false }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);
  });

  it("should allow an API key request when allowApiKey is true", async () => {
    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: true }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(request.resolvedIdentity).toEqual({
      isSystemAdmin: false,
      groupRoles: { "group-abc": GroupRole.MEMBER },
      actorId: "api-actor-id",
    });
  });

  it("should not reject a JWT request due to allowApiKey being false", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({ allowApiKey: false }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    const result = await identityGuard.canActivate(createContext(request));

    expect(result).toBe(true);
  });

  it("should throw ForbiddenException before enrichment when allowApiKey is false (group membership not evaluated)", async () => {
    userService.findUserWithGroups.mockResolvedValue({
      is_system_admin: false,
      actor_id: "actor-id",
      userGroups: [
        {
          user_id: "user-1",
          group_id: "group-abc",
          role: GroupRole.MEMBER,
          created_at: new Date(),
        },
      ],
    } as never);

    const identityGuard = new IdentityGuard(
      createReflectorWithIdentity({
        allowApiKey: false,
        groupIdFrom: { param: "groupId" },
      }),
      userService as unknown as UserService,
    );
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
      params: { groupId: "group-abc" },
    };

    // Should throw before reaching groupIdFrom check
    await expect(
      identityGuard.canActivate(createContext(request)),
    ).rejects.toThrow(ForbiddenException);

    // No DB queries should be made for API key path
    expect(userService.findUserWithGroups).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // US-010: IdentityGuard pass-through when @Identity is absent
  // ---------------------------------------------------------------------------

  it("should return true and make DB queries for a JWT request even when @Identity is absent", async () => {
    // Default guard has no @Identity in reflector mock
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(userService.findUserWithGroups).toHaveBeenCalled();
  });

  it("should set resolvedIdentity.isSystemAdmin to false for a JWT request when @Identity is absent", async () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    await guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { isSystemAdmin?: boolean }).isSystemAdmin,
    ).toBe(false);
  });

  it("should set resolvedIdentity.groupRoles to an empty record for a JWT request when @Identity is absent", async () => {
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    await guard.canActivate(createContext(request));

    expect(
      (request.resolvedIdentity as { groupRoles?: Record<string, GroupRole> })
        .groupRoles,
    ).toEqual({});
  });

  it("should throw ForbiddenException when @Identity is absent and request carries an API key", async () => {
    // Without @Identity, API key requests are always denied
    const request: Record<string, unknown> = {
      apiKey: { groupId: "group-abc", actorId: "api-actor-id" },
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("should make DB queries even when @Identity is absent and request is JWT", async () => {
    // The guard always queries DB for JWT-authenticated requests
    const request: Record<string, unknown> = {
      user: { sub: "jwt-user-id" },
    };

    const result = await guard.canActivate(createContext(request));

    expect(result).toBe(true);
    expect(userService.findUserWithGroups).toHaveBeenCalledWith("jwt-user-id");
  });
});
