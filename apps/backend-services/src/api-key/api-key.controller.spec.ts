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
      roles: ["admin", "editor"],
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
        roles: ["admin"],
      };
      mockApiKeyService.getUserApiKey.mockResolvedValue(mockKeyInfo);
      const result = await controller.getApiKey(mockRequest as any);
      expect(result).toEqual({ apiKey: mockKeyInfo });
      expect(apiKeyService.getUserApiKey).toHaveBeenCalledWith("testuser");
    });

    it("should not throw when user has no email", async () => {
      // With new logic, email is not required for API key generation, so this should not throw
      mockApiKeyService.generateApiKey.mockResolvedValue({});
      await expect(
        controller.generateApiKey({ user: { sub: "testuser" } } as any, {
          groupId: "group123",
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("generateApiKey", () => {
    it("should generate and return new api key", async () => {
      const mockGeneratedKey = {
        id: "key123",
        key: "fullkeyvalue",
        keyPrefix: "fullkeyv",
        userEmail: "test@example.com",
        roles: ["admin", "editor"],
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.generateApiKey.mockResolvedValue(mockGeneratedKey);

      const result = await controller.generateApiKey(mockRequest as any, {
        groupId: "group123",
      });

      expect(result).toEqual({ apiKey: mockGeneratedKey });
      expect(apiKeyService.generateApiKey).toHaveBeenCalledWith(
        "testuser",
        "group123",
      );
    });

    it("should not throw when user has no email for regenerate", async () => {
      mockApiKeyService.regenerateApiKey.mockResolvedValue({});
      await expect(
        controller.regenerateApiKey({ user: { sub: "testuser" } } as any, {
          groupId: "group123",
        }),
      ).resolves.toBeDefined();
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
        roles: ["admin", "editor"],
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.regenerateApiKey.mockResolvedValue(mockRegeneratedKey);

      const result = await controller.regenerateApiKey(mockRequest as any, {
        groupId: "group123",
      });

      expect(result).toEqual({ apiKey: mockRegeneratedKey });
      expect(apiKeyService.regenerateApiKey).toHaveBeenCalledWith(
        "testuser",
        "group123",
      );
    });
  });
});
