import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyDbService } from "./api-key-db.service";

const mockApiKeyDbService = {
  findApiKeyByGroupId: jest.fn(),
  findApiKeyById: jest.fn(),
  findApiKeysByPrefix: jest.fn(),
  createApiKey: jest.fn(),
  deleteApiKeysByGroupId: jest.fn(),
  deleteApiKeyById: jest.fn(),
  updateApiKeyLastUsed: jest.fn(),
};

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(mockApiKeyDbService).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: ApiKeyDbService,
          useValue: mockApiKeyDbService,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe("getApiKey", () => {
    it("should return null when no key exists for the group", async () => {
      mockApiKeyDbService.findApiKeyByGroupId.mockResolvedValue(null);

      const result = await service.getApiKey("group123");

      expect(result).toBeNull();
      expect(mockApiKeyDbService.findApiKeyByGroupId).toHaveBeenCalledWith(
        "group123",
      );
    });

    it("should return key info when a key exists for the group", async () => {
      const mockKey = {
        id: "key123",
        key_prefix: "abcd1234",
        group_id: "group123",
        actor_id: "actor-1",
        created_at: new Date("2024-01-01"),
        last_used: new Date("2024-01-02"),
      };
      mockApiKeyDbService.findApiKeyByGroupId.mockResolvedValue(mockKey);

      const result = await service.getApiKey("group123");

      expect(result).toEqual({
        id: "key123",
        keyPrefix: "abcd1234",
        groupId: "group123",
        actorId: "actor-1",
        createdAt: mockKey.created_at,
        lastUsed: mockKey.last_used,
      });
    });
  });

  describe("generateApiKey", () => {
    it("should return a key hash, raw key, and prefix", async () => {
      const result = await service.generateApiKey();

      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.keyHash).toBeDefined();
    });
  });

  describe("createApiKey", () => {
    it("should create a new key for the given user and group", async () => {
      mockApiKeyDbService.createApiKey.mockImplementation(async (data) => ({
        id: "newkey123",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        generating_user_id: data.generating_user_id,
        group_id: data.group_id,
        actor_id: "actor-1",
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.createApiKey("user123", "group123");

      expect(result.id).toBe("newkey123");
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.groupId).toBe("group123");
      expect(result.actorId).toBe("actor-1");
      expect(mockApiKeyDbService.createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          generating_user_id: "user123",
          group_id: "group123",
        }),
      );
    });
  });

  describe("getApiKeyGroupId", () => {
    it("should return the group ID for a valid key", async () => {
      mockApiKeyDbService.findApiKeyById.mockResolvedValue({
        id: "key123",
        group_id: "group123",
      });

      const result = await service.getApiKeyGroupId("key123");

      expect(result).toBe("group123");
      expect(mockApiKeyDbService.findApiKeyById).toHaveBeenCalledWith("key123");
    });

    it("should throw NotFoundException when key does not exist", async () => {
      mockApiKeyDbService.findApiKeyById.mockResolvedValue(null);

      await expect(service.getApiKeyGroupId("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("deleteApiKey", () => {
    it("should throw NotFoundException if no key exists", async () => {
      mockApiKeyDbService.deleteApiKeyById.mockRejectedValue({ code: "P2025" });
      await expect(service.deleteApiKey("key123")).rejects.toBeDefined();
    });

    it("should delete a key by its ID", async () => {
      mockApiKeyDbService.deleteApiKeyById.mockResolvedValue({ id: "key123" });
      await service.deleteApiKey("key123");
      expect(mockApiKeyDbService.deleteApiKeyById).toHaveBeenCalledWith(
        "key123",
      );
    });
  });

  describe("validateApiKey", () => {
    it("should return null when no keys match the prefix", async () => {
      mockApiKeyDbService.findApiKeysByPrefix.mockResolvedValue([]);

      const result = await service.validateApiKey("invalidkey");

      expect(result).toBeNull();
      expect(mockApiKeyDbService.findApiKeysByPrefix).toHaveBeenCalledWith(
        "invalidk",
      );
    });

    it("should return groupId and update last_used for valid key", async () => {
      const validKey = "testkey123";
      const hashedKey = await bcrypt.hash(validKey, 10);

      mockApiKeyDbService.findApiKeysByPrefix.mockResolvedValue([
        {
          id: "key123",
          key_hash: hashedKey,
          key_prefix: "testkey1",
          generating_user_id: "user123",
          group_id: "group-test",
          actor_id: "actor-key-1",
        },
      ]);
      mockApiKeyDbService.updateApiKeyLastUsed.mockResolvedValue({});

      const result = await service.validateApiKey(validKey);

      expect(result).toEqual({
        groupId: "group-test",
        keyPrefix: "testkey1",
        actorId: "actor-key-1",
      });
      expect(mockApiKeyDbService.findApiKeysByPrefix).toHaveBeenCalledWith(
        "testkey1",
      );
      expect(mockApiKeyDbService.updateApiKeyLastUsed).toHaveBeenCalledWith(
        "key123",
      );
    });

    it("should return null when prefix matches but hash does not", async () => {
      const validKey = "testkey123";
      const differentKey = "testkey1differenthash";
      const hashedDifferentKey = await bcrypt.hash(differentKey, 10);

      mockApiKeyDbService.findApiKeysByPrefix.mockResolvedValue([
        {
          id: "key123",
          key_hash: hashedDifferentKey,
          key_prefix: "testkey1",
          generating_user_id: "user123",
          group_id: "group-test",
        },
      ]);

      const result = await service.validateApiKey(validKey);

      expect(result).toBeNull();
      expect(mockApiKeyDbService.updateApiKeyLastUsed).not.toHaveBeenCalled();
    });
  });
});
