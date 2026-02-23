import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { API_KEY_AUTH_KEY } from "@/decorators/custom-auth-decorators";
import { IS_PUBLIC_KEY } from "./public.decorator";

// We need to mock AuthGuard before importing JwtAuthGuard
const mockSuperCanActivate = jest.fn().mockReturnValue(true);

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

  const createMockExecutionContext = (
    headers: Record<string, string | undefined> = {},
  ): ExecutionContext => {
    const mockRequest = { headers };

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
    guard = new JwtAuthGuard(mockReflector as unknown as Reflector);
  });

  describe("@Public() routes", () => {
    it("should allow access to public routes without any authentication", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext();
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
    });

    it("should not check API key metadata when route is public", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-key",
      });
      guard.canActivate(context);

      // Only IS_PUBLIC_KEY should be checked, not API_KEY_AUTH_KEY
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledTimes(1);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        expect.any(Array),
      );
    });
  });

  describe("@ApiKeyAuth() routes", () => {
    it("should skip JWT validation when API key header is present on @ApiKeyAuth() route", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-api-key",
      });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
    });

    it("should delegate to Passport JWT when @ApiKeyAuth() is set but no API key header present", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return true;
        return false;
      });

      const context = createMockExecutionContext({});
      guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });

    it("should delegate to Passport JWT when API key header present but @ApiKeyAuth() is not set", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === API_KEY_AUTH_KEY) return false;
        return false;
      });

      const context = createMockExecutionContext({
        "x-api-key": "some-api-key",
      });
      guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });
  });

  describe("standard JWT routes", () => {
    it("should delegate to Passport JWT strategy for authenticated routes", () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({
        authorization: "Bearer some-jwt-token",
      });
      guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });

    it("should delegate to Passport JWT strategy when no headers present", () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const context = createMockExecutionContext({});
      guard.canActivate(context);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(context);
    });
  });

  describe("reflector metadata lookup", () => {
    it("should check both handler and class for IS_PUBLIC_KEY", () => {
      mockReflector.getAllAndOverride.mockReturnValue(false);

      const handler = jest.fn();
      const klass = jest.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
        getHandler: () => handler,
        getClass: () => klass,
      } as unknown as ExecutionContext;

      guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        [handler, klass],
      );
    });

    it("should check both handler and class for API_KEY_AUTH_KEY", () => {
      mockReflector.getAllAndOverride.mockImplementation((key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        return false;
      });

      const handler = jest.fn();
      const klass = jest.fn();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
        getHandler: () => handler,
        getClass: () => klass,
      } as unknown as ExecutionContext;

      guard.canActivate(context);

      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        API_KEY_AUTH_KEY,
        [handler, klass],
      );
    });
  });
});
