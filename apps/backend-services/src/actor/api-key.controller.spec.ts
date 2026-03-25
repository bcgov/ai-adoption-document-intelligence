import { GroupRole } from "@generated/client";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";

describe("ApiKeyController", () => {
  let controller: ApiKeyController;
  let apiKeyService: ApiKeyService;

  const mockApiKeyService = {
    getApiKey: jest.fn(),
    createApiKey: jest.fn(),
    deleteApiKey: jest.fn(),
    regenerateApiKey: jest.fn(),
    getApiKeyGroupId: jest.fn(),
  };

  const mockRequest = {
    user: {
      sub: "testuser",
      email: "test@example.com",
      roles: ["admin", "editor"],
    },
    resolvedIdentity: {
      userId: "testuser",
      isSystemAdmin: false,
      groupRoles: { group123: GroupRole.ADMIN },
      actorId: "actor-1",
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
    it("should return null when the group has no key", async () => {
      mockApiKeyService.getApiKey.mockResolvedValue(null);

      const result = await controller.getApiKey(mockRequest as any, "group123");

      expect(result).toEqual({ apiKey: null });
      expect(apiKeyService.getApiKey).toHaveBeenCalledWith("group123");
    });

    it("should return api key info for a group the user belongs to", async () => {
      const mockKeyInfo = {
        id: "key123",
        keyPrefix: "abcd1234",
        groupId: "group123",
      };
      mockApiKeyService.getApiKey.mockResolvedValue(mockKeyInfo);

      const result = await controller.getApiKey(mockRequest as any, "group123");

      expect(result).toEqual({ apiKey: mockKeyInfo });
      expect(apiKeyService.getApiKey).toHaveBeenCalledWith("group123");
    });

    it("should throw ForbiddenException when user is not a group member", async () => {
      await expect(
        controller.getApiKey(
          {
            ...mockRequest,
            resolvedIdentity: {
              actorId: "testuser",
              isSystemAdmin: false,
              groupRoles: {},
            },
          } as any,
          "group123",
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(apiKeyService.getApiKey).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException when groupId is missing", async () => {
      await expect(
        controller.getApiKey(mockRequest as any, ""),
      ).rejects.toThrow(BadRequestException);
      expect(apiKeyService.getApiKey).not.toHaveBeenCalled();
    });

    it("should not throw when user has no email", async () => {
      // With new logic, email is not required for API key generation, so this should not throw
      mockApiKeyService.createApiKey.mockResolvedValue({});
      await expect(
        controller.generateApiKey(
          {
            user: { sub: "testuser" },
            resolvedIdentity: {
              userId: "testuser",
              isSystemAdmin: false,
              groupRoles: { group123: GroupRole.ADMIN },
            },
          } as any,
          { groupId: "group123" },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("generateApiKey", () => {
    it("should generate and return new api key for a group member", async () => {
      const mockGeneratedKey = {
        id: "key123",
        key: "fullkeyvalue",
        keyPrefix: "fullkeyv",
        groupId: "group123",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.createApiKey.mockResolvedValue(mockGeneratedKey);

      const result = await controller.generateApiKey(mockRequest as any, {
        groupId: "group123",
      });

      expect(result).toEqual({ apiKey: mockGeneratedKey });
      expect(apiKeyService.createApiKey).toHaveBeenCalledWith(
        "testuser",
        "group123",
      );
    });

    it("should throw ForbiddenException when user is not a group member", async () => {
      await expect(
        controller.generateApiKey(
          {
            ...mockRequest,
            resolvedIdentity: {
              userId: "testuser",
              isSystemAdmin: false,
              groupRoles: {},
            },
          } as any,
          { groupId: "group123" },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(apiKeyService.createApiKey).not.toHaveBeenCalled();
    });

    it("should not throw when user has no email for regenerate", async () => {
      mockApiKeyService.regenerateApiKey.mockResolvedValue({});
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");
      await expect(
        controller.regenerateApiKey(
          {
            user: { sub: "testuser" },
            resolvedIdentity: {
              userId: "testuser",
              isSystemAdmin: false,
              groupRoles: { group123: GroupRole.ADMIN },
            },
          } as any,
          { id: "key123" },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("deleteApiKey", () => {
    it("should delete api key by id when user is a member", async () => {
      mockApiKeyService.deleteApiKey.mockResolvedValue(undefined);
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");

      await controller.deleteApiKey(mockRequest as any, "key123");

      expect(apiKeyService.deleteApiKey).toHaveBeenCalledWith("key123");
    });

    it("should throw BadRequestException when id is missing", async () => {
      await expect(
        controller.deleteApiKey(mockRequest as any, ""),
      ).rejects.toThrow(BadRequestException);
      expect(apiKeyService.deleteApiKey).not.toHaveBeenCalled();
    });

    it("should throw ForbiddenException when user is not a group member", async () => {
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");

      await expect(
        controller.deleteApiKey(
          {
            ...mockRequest,
            resolvedIdentity: {
              actorId: "testuser",
              isSystemAdmin: false,
              groupRoles: {},
            },
          } as any,
          "key123",
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(apiKeyService.deleteApiKey).not.toHaveBeenCalled();
    });
  });

  describe("regenerateApiKey", () => {
    it("should regenerate and return new api key for a group member", async () => {
      const mockRegeneratedKey = {
        id: "newkey123",
        key: "newfullkeyvalue",
        keyPrefix: "newfullk",
        groupId: "group123",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.regenerateApiKey.mockResolvedValue(mockRegeneratedKey);
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");

      const result = await controller.regenerateApiKey(mockRequest as any, {
        id: "key123",
      });

      expect(result).toEqual({ apiKey: mockRegeneratedKey });
      expect(apiKeyService.regenerateApiKey).toHaveBeenCalledWith(
        "testuser",
        "key123",
      );
    });

    it("should throw ForbiddenException when user is not a group member", async () => {
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");

      await expect(
        controller.regenerateApiKey(
          {
            ...mockRequest,
            resolvedIdentity: {
              userId: "testuser",
              isSystemAdmin: false,
              groupRoles: {},
              actorId: "actor-1",
            },
          } as any,
          {
            id: "key123",
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(apiKeyService.regenerateApiKey).not.toHaveBeenCalled();
    });

    it("should update generating_user_id when regenerating an existing group key", async () => {
      const newUserId = "differentuser";
      const mockUpdatedKey = {
        id: "key123",
        key: "newkeyvalue",
        keyPrefix: "newkeyva",
        groupId: "group123",
        createdAt: new Date(),
        lastUsed: null,
      };
      mockApiKeyService.regenerateApiKey.mockResolvedValue(mockUpdatedKey);
      mockApiKeyService.getApiKeyGroupId.mockResolvedValue("group123");

      const reqWithDifferentUser = {
        user: { sub: newUserId },
        resolvedIdentity: {
          actorId: newUserId,
          isSystemAdmin: false,
          groupRoles: { group123: GroupRole.ADMIN },
          userId: newUserId,
        },
      };

      const result = await controller.regenerateApiKey(
        reqWithDifferentUser as any,
        { id: "key123" },
      );

      expect(result).toEqual({ apiKey: mockUpdatedKey });
      expect(apiKeyService.regenerateApiKey).toHaveBeenCalledWith(
        newUserId,
        "key123",
      );
    });
  });
});
