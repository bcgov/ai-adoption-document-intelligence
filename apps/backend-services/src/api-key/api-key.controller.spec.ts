import { Test, TestingModule } from "@nestjs/testing";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";

describe("ApiKeyController", () => {
  let controller: ApiKeyController;
  let apiKeyService: ApiKeyService;

  const mockApiKeyService = {
    getUserApiKey: jest.fn(),
    generateApiKey: jest.fn(),
    deleteApiKey: jest.fn(),
    regenerateApiKey: jest.fn(),
  };

  const mockRequest = {
    user: {
      sub: "testuser",
      email: "test@example.com",
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    controller = module.get<ApiKeyController>(ApiKeyController);
    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
  });

  describe("getApiKey", () => {
    it("should return null when user has no key", async () => {
      mockApiKeyService.getUserApiKey.mockResolvedValue(null);

      const result = await controller.getApiKey(mockRequest as any);

      expect(result).toEqual({ apiKey: null });
      expect(apiKeyService.getUserApiKey).toHaveBeenCalledWith("testuser");
    });

    it("should return api key info when user has a key", async () => {
      const mockKeyInfo = {
        id: "key123",
        keyPrefix: "abcd1234",
        userEmail: "test@example.com",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.getUserApiKey.mockResolvedValue(mockKeyInfo);

      const result = await controller.getApiKey(mockRequest as any);

      expect(result).toEqual({ apiKey: mockKeyInfo });
    });

    it("should return null when no user on request", async () => {
      const result = await controller.getApiKey({ user: undefined } as any);

      expect(result).toEqual({ apiKey: null });
    });
  });

  describe("generateApiKey", () => {
    it("should generate and return new api key", async () => {
      const mockGeneratedKey = {
        id: "key123",
        key: "fullkeyvalue",
        keyPrefix: "fullkeyv",
        userEmail: "test@example.com",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.generateApiKey.mockResolvedValue(mockGeneratedKey);

      const result = await controller.generateApiKey(mockRequest as any);

      expect(result).toEqual({ apiKey: mockGeneratedKey });
      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        "testuser",
        "test@example.com",
      );
    });

    it("should use unknown@example.com when user has no email", async () => {
      const mockGeneratedKey = {
        id: "key123",
        key: "fullkeyvalue",
        keyPrefix: "fullkeyv",
        userEmail: "unknown@example.com",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.generateApiKey.mockResolvedValue(mockGeneratedKey);

      const result = await controller.generateApiKey({
        user: { sub: "testuser" },
      } as any);

      expect(result).toEqual({ apiKey: mockGeneratedKey });
      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        "testuser",
        "unknown@example.com",
      );
    });
  });

  describe("deleteApiKey", () => {
    it("should delete user api key", async () => {
      mockApiKeyService.deleteApiKey.mockResolvedValue(undefined);

      await controller.deleteApiKey(mockRequest as any);

      expect(apiKeyService.deleteApiKey).toHaveBeenCalledWith("testuser");
    });
  });

  describe("regenerateApiKey", () => {
    it("should regenerate and return new api key", async () => {
      const mockRegeneratedKey = {
        id: "newkey123",
        key: "newfullkeyvalue",
        keyPrefix: "newfullk",
        userEmail: "test@example.com",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.regenerateApiKey.mockResolvedValue(mockRegeneratedKey);

      const result = await controller.regenerateApiKey(mockRequest as any);

      expect(result).toEqual({ apiKey: mockRegeneratedKey });
      expect(apiKeyService.regenerateApiKey).toHaveBeenCalledWith(
        "testuser",
        "test@example.com",
      );
    });

    it("should use unknown@example.com when user has no email", async () => {
      const mockRegeneratedKey = {
        id: "newkey123",
        key: "newfullkeyvalue",
        keyPrefix: "newfullk",
        userEmail: "unknown@example.com",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.regenerateApiKey.mockResolvedValue(mockRegeneratedKey);

      const result = await controller.regenerateApiKey({
        user: { sub: "testuser" },
      } as any);

      expect(apiKeyService.regenerateApiKey).toHaveBeenCalledWith(
        "testuser",
        "unknown@example.com",
      );
    });
  });
});
