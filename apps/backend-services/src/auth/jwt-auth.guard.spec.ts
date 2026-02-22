import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { API_KEY_AUTH_KEY } from "@/decorators/custom-auth-decorators";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { TokenIntrospectionService } from "./token-introspection.service";

// We need to mock AuthGuard before importing JwtAuthGuard
const mockSuperCanActivate = jest.fn().mockResolvedValue(true);

jest.mock("@nestjs/passport", () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      canActivate(context: ExecutionContext) {
        return mockSuperCanActivate(context);
      }
    }
    return MockAuthGuard;
  },
}));

// Import after mock is set up
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockIntrospectionService: { isTokenActive: jest.Mock };

  const createMockExecutionContext = (
    headers: Record<string, string | undefined> = {},
    cookies: Record<string, string> = {},
  ): ExecutionContext => {
    const mockRequest = { headers, cookies };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReflector = { getAllAndOverride: jest.fn() };
    mockIntrospectionService = { isTokenActive: jest.fn().mockResolvedValue(true) };
    guard = new JwtAuthGuard(
      mockReflector as unknown as Reflector,
      mockIntrospectionService as unknown as TokenIntrospectionService,
    );
  });

  describe("@Public() routes", () => {
    it("should allow access to public routes without any authentication", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
      expect(mockIntrospectionService.isTokenActive).not.toHaveBeenCalled();
    });

    it("should not check API key metadata when route is public", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-key",
      });
      await guard.canActivate(context);

      // Only IS_PUBLIC_KEY should be checked, not API_KEY_AUTH_KEY
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledTimes(1);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        expect.any(Array),
      );
    });
  });

  describe("@ApiKeyAuth() routes", () => {
    it("should skip JWT validation when API key header is present on @ApiKeyAuth() route", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-api-key",
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
      expect(mockIntrospectionService.isTokenActive).not.toHaveBeenCalled();
    });

    it("should delegate to Passport JWT when @ApiKeyAuth() is set but no API key header present", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({});
      await guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });

    it("should delegate to Passport JWT when API key header present but @ApiKeyAuth() is not set", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return false;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-api-key",
      });
      await guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });
  });

  describe("standard JWT routes", () => {
    it("should delegate to Passport JWT strategy for authenticated routes", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext(
        { authorization: "Bearer some-jwt-token" },
      );
      await guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });

    it("should delegate to Passport JWT strategy when no headers present", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({});
      await guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });
  });

  describe("token introspection", () => {
    it("should allow request when token is active", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockIntrospectionService.isTokenActive.mockResolvedValue(true);

      const context = createMockExecutionContext(
        {},
        { access_token: "valid-jwt-token" },
      );
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIntrospectionService.isTokenActive).toHaveBeenCalledWith(
        "valid-jwt-token",
      );
    });

    it("should throw UnauthorizedException when token is revoked", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockIntrospectionService.isTokenActive.mockResolvedValue(false);

      const context = createMockExecutionContext(
        {},
        { access_token: "revoked-jwt-token" },
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "Token has been revoked",
      );
    });

    it("should introspect token from Bearer header when no cookie is present", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockIntrospectionService.isTokenActive.mockResolvedValue(true);

      const context = createMockExecutionContext(
        { authorization: "Bearer bearer-jwt-token" },
      );
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIntrospectionService.isTokenActive).toHaveBeenCalledWith(
        "bearer-jwt-token",
      );
    });

    it("should prefer cookie token over Bearer header for introspection", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);
      mockIntrospectionService.isTokenActive.mockResolvedValue(true);

      const context = createMockExecutionContext(
        { authorization: "Bearer header-token" },
        { access_token: "cookie-token" },
      );
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIntrospectionService.isTokenActive).toHaveBeenCalledWith(
        "cookie-token",
      );
    });

    it("should skip introspection for @Public() routes", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext(
        {},
        { access_token: "some-token" },
      );
      await guard.canActivate(context);

      expect(mockIntrospectionService.isTokenActive).not.toHaveBeenCalled();
    });

    it("should skip introspection for @ApiKeyAuth() routes with API key", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext(
        { "x-api-key": "some-api-key" },
        { access_token: "some-token" },
      );
      await guard.canActivate(context);

      expect(mockIntrospectionService.isTokenActive).not.toHaveBeenCalled();
    });
  });

  describe("reflector metadata lookup", () => {
    it("should check both handler and class for IS_PUBLIC_KEY", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const handler = jest.fn();
      const klass = jest.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {}, cookies: {} }),
        }),
        getHandler: () => handler,
        getClass: () => klass,
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        [handler, klass],
      );
    });

    it("should check both handler and class for API_KEY_AUTH_KEY", async () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        return false;
      });

      const handler = jest.fn();
      const klass = jest.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {}, cookies: {} }),
        }),
        getHandler: () => handler,
        getClass: () => klass,
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        API_KEY_AUTH_KEY,
        [handler, klass],
      );
    });
  });
});
