import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ApiKeyService } from "../api-key/api-key.service";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";
import { IdentityOptions } from "./identity.decorator";

describe("ApiKeyAuthGuard", () => {
  let guard: ApiKeyAuthGuard;
  let reflector: Reflector;
  let apiKeyService: ApiKeyService;

  const mockApiKeyService = {
    validateApiKey: jest.fn(),
  };

  const createMockExecutionContext = (
    headers: Record<string, string> = {},
    user?: object,
    ip = "127.0.0.1",
  ): ExecutionContext => {
    const mockRequest = {
      headers,
      user,
      ip,
    };

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
        ApiKeyAuthGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyAuthGuard>(ApiKeyAuthGuard);
    reflector = module.get<Reflector>(Reflector);
    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
  });

  afterEach(() => {
    guard.onModuleDestroy();
  });

  it("should return true if endpoint does not allow API key auth", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should return true if user is already authenticated", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);

    const context = createMockExecutionContext({}, { sub: "testuser" });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should throw UnauthorizedException if no API key header and no authenticated user", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);

    const context = createMockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should return true if no API key header but user is already authenticated", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);

    const context = createMockExecutionContext({}, { sub: "testuser" });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should throw UnauthorizedException for invalid API key", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);
    mockApiKeyService.validateApiKey.mockResolvedValue(null);

    const context = createMockExecutionContext({ "x-api-key": "invalidkey" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("invalidkey");
  });

  it("should set apiKeyGroupId for valid API key", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);
    mockApiKeyService.validateApiKey.mockResolvedValue({
      groupId: "group-abc",
    });

    const mockRequest: Record<string, unknown> = {
      headers: { "x-api-key": "validkey" },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockRequest.user).toBeUndefined();
    expect(mockRequest.apiKeyGroupId).toBe("group-abc");
  });

  describe("failed-attempt throttling", () => {
    beforeEach(() => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue({ allowApiKey: true } as IdentityOptions);
      mockApiKeyService.validateApiKey.mockResolvedValue(null);
    });

    it("should allow up to 20 failed attempts from the same IP", async () => {
      for (let i = 0; i < 20; i++) {
        const context = createMockExecutionContext(
          { "x-api-key": `bad-key-${i}` },
          undefined,
          "10.0.0.1",
        );
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      expect(apiKeyService.validateApiKey).toHaveBeenCalledTimes(20);
    });

    it("should block the 21st failed attempt with 429", async () => {
      // Exhaust the 20-attempt limit
      for (let i = 0; i < 20; i++) {
        const context = createMockExecutionContext(
          { "x-api-key": `bad-key-${i}` },
          undefined,
          "10.0.0.2",
        );
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // 21st attempt should be blocked before reaching validateApiKey
      const context = createMockExecutionContext(
        { "x-api-key": "bad-key-21" },
        undefined,
        "10.0.0.2",
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        new HttpException(
          "Too many failed API key attempts",
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      // validateApiKey should NOT have been called for the 21st attempt
      expect(apiKeyService.validateApiKey).toHaveBeenCalledTimes(20);
    });

    it("should track different IPs independently", async () => {
      // Exhaust limit for IP A
      for (let i = 0; i < 20; i++) {
        const context = createMockExecutionContext(
          { "x-api-key": `bad-key-${i}` },
          undefined,
          "10.0.0.3",
        );
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // IP B should still be allowed
      const contextB = createMockExecutionContext(
        { "x-api-key": "bad-key-b" },
        undefined,
        "10.0.0.4",
      );
      await expect(guard.canActivate(contextB)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(apiKeyService.validateApiKey).toHaveBeenCalledTimes(21);
    });

    it("should reset failure counter on successful validation", async () => {
      // Record some failures
      for (let i = 0; i < 10; i++) {
        const context = createMockExecutionContext(
          { "x-api-key": `bad-key-${i}` },
          undefined,
          "10.0.0.5",
        );
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // Successful validation should reset the counter
      mockApiKeyService.validateApiKey.mockResolvedValueOnce({
        groupId: "group-reset",
      });

      const mockRequest = {
        headers: { "x-api-key": "valid-key" },
        user: undefined,
        ip: "10.0.0.5",
      };
      const successContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(successContext);
      expect(result).toBe(true);

      // After reset, should be able to fail 20 more times
      mockApiKeyService.validateApiKey.mockResolvedValue(null);
      for (let i = 0; i < 20; i++) {
        const context = createMockExecutionContext(
          { "x-api-key": `bad-key-again-${i}` },
          undefined,
          "10.0.0.5",
        );
        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      }

      // 21st after reset should be blocked
      const blockedContext = createMockExecutionContext(
        { "x-api-key": "bad-key-blocked" },
        undefined,
        "10.0.0.5",
      );
      await expect(guard.canActivate(blockedContext)).rejects.toThrow(
        HttpException,
      );
    });

    it("should not affect non-API-key-auth routes", async () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const context = createMockExecutionContext(
        { "x-api-key": "some-key" },
        undefined,
        "10.0.0.6",
      );
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
    });
  });
});
