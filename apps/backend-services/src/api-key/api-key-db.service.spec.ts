import type { ApiKey } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ApiKeyDbService, type CreateApiKeyData } from "./api-key-db.service";

const mockApiKey: ApiKey = {
  id: "key-1",
  key_hash: "hash",
  key_prefix: "abcd1234",
  group_id: "grp-1",
  generating_user_id: "user-1",
  created_at: new Date("2024-01-01"),
  last_used: null,
};

const createData: CreateApiKeyData = {
  key_hash: "hash",
  key_prefix: "abcd1234",
  generating_user_id: "user-1",
  group_id: "grp-1",
};

describe("ApiKeyDbService", () => {
  let service: ApiKeyDbService;
  let mockApiKeyPrisma: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let mockPrisma: { apiKey: typeof mockApiKeyPrisma };

  beforeEach(async () => {
    mockApiKeyPrisma = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    mockPrisma = { apiKey: mockApiKeyPrisma };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<ApiKeyDbService>(ApiKeyDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // findApiKeyByGroupId
  // ---------------------------------------------------------------------------

  describe("findApiKeyByGroupId", () => {
    it("should return the api key from this.prisma when no tx", async () => {
      mockApiKeyPrisma.findFirst.mockResolvedValue(mockApiKey);

      const result = await service.findApiKeyByGroupId("grp-1");

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.findFirst).toHaveBeenCalledWith({
        where: { group_id: "grp-1" },
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = { findFirst: jest.fn().mockResolvedValue(mockApiKey) };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.findApiKeyByGroupId
      >[1];

      const result = await service.findApiKeyByGroupId("grp-1", tx);

      expect(result).toEqual(mockApiKey);
      expect(txApiKey.findFirst).toHaveBeenCalled();
      expect(mockApiKeyPrisma.findFirst).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findApiKeyById
  // ---------------------------------------------------------------------------

  describe("findApiKeyById", () => {
    it("should return the api key from this.prisma when no tx", async () => {
      mockApiKeyPrisma.findUnique.mockResolvedValue(mockApiKey);

      const result = await service.findApiKeyById("key-1");

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.findUnique).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = {
        findUnique: jest.fn().mockResolvedValue(mockApiKey),
      };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.findApiKeyById
      >[1];

      const result = await service.findApiKeyById("key-1", tx);

      expect(result).toEqual(mockApiKey);
      expect(txApiKey.findUnique).toHaveBeenCalled();
      expect(mockApiKeyPrisma.findUnique).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findApiKeysByPrefix
  // ---------------------------------------------------------------------------

  describe("findApiKeysByPrefix", () => {
    it("should return matching keys from this.prisma when no tx", async () => {
      mockApiKeyPrisma.findMany.mockResolvedValue([mockApiKey]);

      const result = await service.findApiKeysByPrefix("abcd1234");

      expect(result).toEqual([mockApiKey]);
      expect(mockApiKeyPrisma.findMany).toHaveBeenCalledWith({
        where: { key_prefix: "abcd1234" },
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = {
        findMany: jest.fn().mockResolvedValue([mockApiKey]),
      };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.findApiKeysByPrefix
      >[1];

      const result = await service.findApiKeysByPrefix("abcd1234", tx);

      expect(result).toEqual([mockApiKey]);
      expect(txApiKey.findMany).toHaveBeenCalled();
      expect(mockApiKeyPrisma.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // createApiKey
  // ---------------------------------------------------------------------------

  describe("createApiKey", () => {
    it("should create an api key using this.prisma when no tx", async () => {
      mockApiKeyPrisma.create.mockResolvedValue(mockApiKey);

      const result = await service.createApiKey(createData);

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.create).toHaveBeenCalledWith({
        data: createData,
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = { create: jest.fn().mockResolvedValue(mockApiKey) };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.createApiKey
      >[1];

      const result = await service.createApiKey(createData, tx);

      expect(result).toEqual(mockApiKey);
      expect(txApiKey.create).toHaveBeenCalled();
      expect(mockApiKeyPrisma.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteApiKeysByGroupId
  // ---------------------------------------------------------------------------

  describe("deleteApiKeysByGroupId", () => {
    it("should delete keys using this.prisma when no tx", async () => {
      mockApiKeyPrisma.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteApiKeysByGroupId("grp-1");

      expect(mockApiKeyPrisma.deleteMany).toHaveBeenCalledWith({
        where: { group_id: "grp-1" },
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.deleteApiKeysByGroupId
      >[1];

      await service.deleteApiKeysByGroupId("grp-1", tx);

      expect(txApiKey.deleteMany).toHaveBeenCalled();
      expect(mockApiKeyPrisma.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // deleteApiKeyById
  // ---------------------------------------------------------------------------

  describe("deleteApiKeyById", () => {
    it("should delete the key using this.prisma when no tx", async () => {
      mockApiKeyPrisma.delete.mockResolvedValue(mockApiKey);

      const result = await service.deleteApiKeyById("key-1");

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.delete).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
    });

    it("should use tx when provided", async () => {
      const txApiKey = { delete: jest.fn().mockResolvedValue(mockApiKey) };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.deleteApiKeyById
      >[1];

      const result = await service.deleteApiKeyById("key-1", tx);

      expect(result).toEqual(mockApiKey);
      expect(txApiKey.delete).toHaveBeenCalled();
      expect(mockApiKeyPrisma.delete).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // updateApiKeyLastUsed
  // ---------------------------------------------------------------------------

  describe("updateApiKeyLastUsed", () => {
    it("should update the last_used timestamp using this.prisma when no tx", async () => {
      const updated = { ...mockApiKey, last_used: new Date() };
      mockApiKeyPrisma.update.mockResolvedValue(updated);

      const result = await service.updateApiKeyLastUsed("key-1");

      expect(result).toEqual(updated);
      expect(mockApiKeyPrisma.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "key-1" } }),
      );
    });

    it("should use tx when provided", async () => {
      const updated = { ...mockApiKey, last_used: new Date() };
      const txApiKey = { update: jest.fn().mockResolvedValue(updated) };
      const tx = { apiKey: txApiKey } as unknown as Parameters<
        typeof service.updateApiKeyLastUsed
      >[1];

      const result = await service.updateApiKeyLastUsed("key-1", tx);

      expect(result).toEqual(updated);
      expect(txApiKey.update).toHaveBeenCalled();
      expect(mockApiKeyPrisma.update).not.toHaveBeenCalled();
    });
  });
});
