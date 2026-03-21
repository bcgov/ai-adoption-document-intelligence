import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { ApiKeyService } from "./api-key.service";

// Mock Prisma
const mockPrismaApiKey = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
};
const mockPrismaService = {
  prisma: {
    apiKey: mockPrismaApiKey,
  },
};

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.values(mockPrismaApiKey).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe("getApiKey", () => {
    it("should return null when no key exists for the group", async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue(null);

      const result = await service.getApiKey("group123");

      expect(result).toBeNull();
      expect(mockPrismaApiKey.findFirst).toHaveBeenCalledWith({
        where: { group_id: "group123" },
      });
    });

    it("should return key info when a key exists for the group", async () => {
      const mockKey = {
        id: "key123",
        key_prefix: "abcd1234",
        group_id: "group123",
        created_at: new Date("2024-01-01"),
        last_used: new Date("2024-01-02"),
      };
      mockPrismaApiKey.findFirst.mockResolvedValue(mockKey);

      const result = await service.getApiKey("group123");

      expect(result).toEqual({
        id: "key123",
        keyPrefix: "abcd1234",
        groupId: "group123",
        createdAt: mockKey.created_at,
        lastUsed: mockKey.last_used,
      });
    });
  });

  describe("generateApiKey", () => {
    it("should create a new key when none exists for the group", async () => {
      mockPrismaApiKey.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaApiKey.create.mockImplementation(async ({ data }) => ({
        id: "newkey123",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        generating_user_id: data.generating_user_id,
        group_id: data.group_id,
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.generateApiKey("user123", "group123");

      expect(result.id).toBe("newkey123");
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.groupId).toBe("group123");
      expect(mockPrismaApiKey.deleteMany).toHaveBeenCalledWith({
        where: { group_id: "group123" },
      });
      expect(mockPrismaApiKey.create).toHaveBeenCalled();
    });

    it("should replace existing key and update generating_user_id when group already has a key", async () => {
      mockPrismaApiKey.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaApiKey.create.mockImplementation(async ({ data }) => ({
        id: "newkey456",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        generating_user_id: data.generating_user_id,
        group_id: data.group_id,
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.generateApiKey("newuser456", "group123");

      expect(result.id).toBe("newkey456");
      expect(result.key).toBeDefined();
      expect(result.groupId).toBe("group123");
      // generating_user_id must reflect the new requesting user
      expect(mockPrismaApiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ generating_user_id: "newuser456" }),
        }),
      );
      expect(mockPrismaApiKey.deleteMany).toHaveBeenCalledWith({
        where: { group_id: "group123" },
      });
    });
  });

  describe("getApiKeyGroupId", () => {
    it("should return the group ID for a valid key", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue({
        id: "key123",
        group_id: "group123",
      });

      const result = await service.getApiKeyGroupId("key123");

      expect(result).toBe("group123");
      expect(mockPrismaApiKey.findUnique).toHaveBeenCalledWith({
        where: { id: "key123" },
      });
    });

    it("should throw NotFoundException when key does not exist", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(null);

      await expect(service.getApiKeyGroupId("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("deleteApiKey", () => {
    it("should throw NotFoundException if no key exists", async () => {
      mockPrismaApiKey.delete.mockRejectedValue({ code: "P2025" });
      await expect(service.deleteApiKey("key123")).rejects.toBeDefined();
    });

    it("should delete a key by its ID", async () => {
      mockPrismaApiKey.delete.mockResolvedValue({ id: "key123" });
      await service.deleteApiKey("key123");
      expect(mockPrismaApiKey.delete).toHaveBeenCalledWith({
        where: { id: "key123" },
      });
    });
  });

  describe("validateApiKey", () => {
    it("should return null when no keys match the prefix", async () => {
      mockPrismaApiKey.findMany.mockResolvedValue([]);

      const result = await service.validateApiKey("invalidkey");

      expect(result).toBeNull();
      expect(mockPrismaApiKey.findMany).toHaveBeenCalledWith({
        where: { key_prefix: "invalidk" },
      });
    });

    it("should return groupId and update last_used for valid key", async () => {
      const validKey = "testkey123";
      const hashedKey = await bcrypt.hash(validKey, 10);

      mockPrismaApiKey.findMany.mockResolvedValue([
        {
          id: "key123",
          key_hash: hashedKey,
          key_prefix: "testkey1",
          generating_user_id: "user123",
          group_id: "group-test",
        },
      ]);
      mockPrismaApiKey.update.mockResolvedValue({});

      const result = await service.validateApiKey(validKey);

      expect(result).toEqual({ groupId: "group-test", keyPrefix: "testkey1" });
      expect(mockPrismaApiKey.findMany).toHaveBeenCalledWith({
        where: { key_prefix: "testkey1" },
      });
      expect(mockPrismaApiKey.update).toHaveBeenCalledWith({
        where: { id: "key123" },
        data: { last_used: expect.any(Date) },
      });
    });

    it("should return null when prefix matches but hash does not", async () => {
      const validKey = "testkey123";
      const differentKey = "testkey1differenthash";
      const hashedDifferentKey = await bcrypt.hash(differentKey, 10);

      mockPrismaApiKey.findMany.mockResolvedValue([
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
      expect(mockPrismaApiKey.update).not.toHaveBeenCalled();
    });
  });
});
