import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockExecutionContext = (user?: object): ExecutionContext => {
    const mockRequest = { user };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  describe("when no @Roles() decorator is present", () => {
    it("should allow access when no roles are required", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access even without a user when no roles required", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const context = createMockExecutionContext(undefined);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("when @Roles() decorator is present", () => {
    it("should throw ForbiddenException when user is undefined", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext(undefined);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow("User has no roles");
    });

    it("should throw ForbiddenException when user has no roles property", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext({ sub: "user1" });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow("User has no roles");
    });

    it("should throw ForbiddenException when user.roles is undefined", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: undefined,
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when user has empty roles array", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: [],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        "Insufficient permissions",
      );
    });

    it("should throw ForbiddenException when user lacks the required role", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["viewer", "editor"],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        "Insufficient permissions",
      );
    });

    it("should allow access when user has the exact required role", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["admin"],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access when user has one of multiple required roles", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        "admin",
        "superadmin",
      ]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["admin"],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow access when user has all required roles", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        "admin",
        "editor",
      ]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["admin", "editor", "viewer"],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should deny access when user has no overlap with required roles", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        "admin",
        "superadmin",
      ]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["viewer", "editor"],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe("role matching semantics", () => {
    it("should perform case-sensitive role matching", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["Admin"]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["admin"],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should use OR logic — any one matching role is sufficient", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        "role-a",
        "role-b",
        "role-c",
      ]);

      const context = createMockExecutionContext({
        sub: "user1",
        roles: ["role-b"],
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("interaction with API key-authenticated users", () => {
    it("should allow API key user with matching roles", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["editor"]);

      // Simulates request.user set by ApiKeyAuthGuard
      const context = createMockExecutionContext({
        sub: "api-key-user",
        email: "api@example.com",
        roles: ["editor", "viewer"],
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should deny API key user with empty roles", () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["admin"]);

      // Simulates API key user whose key was created with no roles
      const context = createMockExecutionContext({
        sub: "api-key-user",
        email: "api@example.com",
        roles: [],
      });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
