import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { TokenIntrospectionService } from "./token-introspection.service";

// Mock openid-client's tokenIntrospection
const mockTokenIntrospection = jest.fn();

jest.mock("openid-client", () => ({
  tokenIntrospection: (...args: unknown[]) => mockTokenIntrospection(...args),
}));

describe("TokenIntrospectionService", () => {
  let service: TokenIntrospectionService;
  const mockOidcConfig = { issuer: "https://keycloak.example.com/realms/test" };
  const mockAuthService = {
    getOidcConfig: jest.fn().mockReturnValue(mockOidcConfig),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenIntrospectionService,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    service = module.get<TokenIntrospectionService>(
      TokenIntrospectionService,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe("isTokenActive", () => {
    it("should return true when Keycloak reports token as active", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: true });

      const result = await service.isTokenActive("valid-token");

      expect(result).toBe(true);
      expect(mockTokenIntrospection).toHaveBeenCalledWith(
        mockOidcConfig,
        "valid-token",
      );
    });

    it("should return false when Keycloak reports token as revoked", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: false });

      const result = await service.isTokenActive("revoked-token");

      expect(result).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);
    });

    it("should cache active result and not call Keycloak on second request within TTL", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: true });

      const result1 = await service.isTokenActive("cached-token");
      const result2 = await service.isTokenActive("cached-token");

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);
    });

    it("should cache revoked result and not call Keycloak on second request within TTL", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: false });

      const result1 = await service.isTokenActive("revoked-cached-token");
      const result2 = await service.isTokenActive("revoked-cached-token");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);
    });

    it("should re-introspect after cache TTL expires (5 minutes)", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: true });

      await service.isTokenActive("expiring-cache-token");
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);

      // Advance time past the 5-minute cache TTL
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      mockTokenIntrospection.mockResolvedValue({ active: false });
      const result = await service.isTokenActive("expiring-cache-token");

      expect(result).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(2);
    });

    it("should fail open (return true) when introspection throws a network error", async () => {
      mockTokenIntrospection.mockRejectedValue(
        new Error("ECONNREFUSED: Keycloak unavailable"),
      );

      const result = await service.isTokenActive("error-token");

      expect(result).toBe(true);
    });

    it("should fail open (return true) when introspection throws a non-Error", async () => {
      mockTokenIntrospection.mockRejectedValue("unexpected failure");

      const result = await service.isTokenActive("error-token-2");

      expect(result).toBe(true);
    });

    it("should use different cache entries for different tokens", async () => {
      mockTokenIntrospection
        .mockResolvedValueOnce({ active: true })
        .mockResolvedValueOnce({ active: false });

      const result1 = await service.isTokenActive("token-a");
      const result2 = await service.isTokenActive("token-b");

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(2);
    });
  });

  describe("cache sweep", () => {
    it("should remove expired entries during periodic sweep", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: true });

      await service.isTokenActive("sweep-token");
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(1);

      // Advance past cache TTL to expire the entry
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Trigger the sweep interval (also 5 minutes)
      jest.advanceTimersByTime(1);

      // The entry should have been swept; next call should go to Keycloak
      mockTokenIntrospection.mockResolvedValue({ active: false });
      const result = await service.isTokenActive("sweep-token");

      expect(result).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(2);
    });
  });

  describe("onModuleDestroy", () => {
    it("should clear the cache and sweep interval on destroy", async () => {
      mockTokenIntrospection.mockResolvedValue({ active: true });

      await service.isTokenActive("destroy-token");
      service.onModuleDestroy();

      // After destroy, a new call should go to Keycloak (cache was cleared)
      // Re-init to get a new interval
      service.onModuleInit();
      mockTokenIntrospection.mockResolvedValue({ active: false });
      const result = await service.isTokenActive("destroy-token");

      expect(result).toBe(false);
      expect(mockTokenIntrospection).toHaveBeenCalledTimes(2);
    });
  });
});
