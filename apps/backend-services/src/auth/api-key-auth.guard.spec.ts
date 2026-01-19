import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ApiKeyService } from "../api-key/api-key.service";
import { ApiKeyAuthGuard } from "./api-key-auth.guard";

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
  ): ExecutionContext => {
    const mockRequest = {
      headers,
      user,
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

  it("should return true if endpoint does not allow API key auth", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    const context = createMockExecutionContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should return true if user is already authenticated", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    const context = createMockExecutionContext({}, { sub: "testuser" });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should return true if no API key header is provided", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    const context = createMockExecutionContext({});
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
  });

  it("should throw UnauthorizedException for invalid API key", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    mockApiKeyService.validateApiKey.mockResolvedValue(null);

    const context = createMockExecutionContext({ "x-api-key": "invalidkey" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyService.validateApiKey).toHaveBeenCalledWith("invalidkey");
  });

  it("should set user on request for valid API key", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    mockApiKeyService.validateApiKey.mockResolvedValue({
      userId: "user123",
      userEmail: "test@example.com",
    });

    const mockRequest = {
      headers: { "x-api-key": "validkey" },
      user: undefined,
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
    expect(mockRequest.user).toEqual({
      sub: "user123",
      email: "test@example.com",
      roles: [],
    });
  });
});
