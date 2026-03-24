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
  actor_id: "actor-1",
  created_at: new Date("2024-01-01"),
  last_used: null,
  actor_id: "actor-1"
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
    findFirstOrThrow: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let mockActorPrisma: {
    create: jest.Mock;
    findFirstOrThrow: jest.Mock;
    delete: jest.Mock;
  };
  let mockPrisma: {
    apiKey: typeof mockApiKeyPrisma;
    actor: typeof mockActorPrisma;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockApiKeyPrisma = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirstOrThrow: jest.fn().mockResolvedValue(mockApiKey),
      create: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    mockActorPrisma = {
      create: jest.fn().mockResolvedValue({ id: "actor-1" }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: "actor-1" }),
      delete: jest.fn().mockResolvedValue({ id: "actor-1" }),
    };
    mockPrisma = {
      apiKey: mockApiKeyPrisma,
      actor: mockActorPrisma,
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({ apiKey: mockApiKeyPrisma, actor: mockActorPrisma }),
        ),
    };

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
      expect(mockActorPrisma.create).toHaveBeenCalled();
      expect(mockApiKeyPrisma.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key_hash: createData.key_hash,
            key_prefix: createData.key_prefix,
            generating_user_id: createData.generating_user_id,
            group_id: createData.group_id,
            actor_id: "actor-1",
          }),
        }),
      );
    });

    it("should use tx when provided", async () => {
      const txActorPrisma = {
        create: jest.fn().mockResolvedValue({ id: "actor-1" }),
      };
      const txApiKeyPrisma = {
        create: jest.fn().mockResolvedValue(mockApiKey),
      };
      const tx = {
        actor: txActorPrisma,
        apiKey: txApiKeyPrisma,
      } as unknown as Parameters<typeof service.createApiKey>[1];

      const result = await service.createApiKey(createData, tx);

      expect(result).toEqual(mockApiKey);
      expect(txActorPrisma.create).toHaveBeenCalled();
      expect(txApiKeyPrisma.create).toHaveBeenCalled();
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
    it("should delete the key (and its actor) using this.prisma when no tx", async () => {
      mockApiKeyPrisma.delete.mockResolvedValue(mockApiKey);

      const result = await service.deleteApiKeyById("key-1");

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
      expect(mockActorPrisma.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: mockApiKey.actor_id },
      });
      expect(mockActorPrisma.delete).toHaveBeenCalled();
      expect(mockApiKeyPrisma.delete).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
    });

    it("should use tx when provided", async () => {
      const txActorPrisma = {
        delete: jest.fn().mockResolvedValue({ id: "actor-1" }),
      };
      const txApiKeyPrisma = {
        delete: jest.fn().mockResolvedValue(mockApiKey),
      };
      const tx = {
        apiKey: txApiKeyPrisma,
        actor: txActorPrisma,
      } as unknown as Parameters<typeof service.deleteApiKeyById>[1];

      const result = await service.deleteApiKeyById("key-1", tx);

      expect(result).toEqual(mockApiKey);
      expect(txActorPrisma.delete).toHaveBeenCalled();
      expect(txApiKeyPrisma.delete).toHaveBeenCalled();
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
