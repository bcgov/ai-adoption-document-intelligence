import { ApiKey } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ApiKeyDbService, CreateApiKeyData } from "./api-key-db.service";

const mockApiKey: ApiKey = {
  id: "key-1",
  key_hash: "hash",
  key_prefix: "abcd1234",
  group_id: "grp-1",
  generating_user_id: "user-1",
  actor_id: "actor-1",
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
    findFirstOrThrow: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let mockActorPrisma: {
    create: jest.Mock;
  };
  let mockGroupPrisma: {
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  let mockPrisma: {
    apiKey: typeof mockApiKeyPrisma;
    actor: typeof mockActorPrisma;
    group: typeof mockGroupPrisma;
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
    };
    mockGroupPrisma = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ api_actor_id: null }),
      update: jest.fn().mockResolvedValue({ api_actor_id: "actor-1" }),
    };
    mockPrisma = {
      apiKey: mockApiKeyPrisma,
      actor: mockActorPrisma,
      group: mockGroupPrisma,
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              apiKey: mockApiKeyPrisma,
              actor: mockActorPrisma,
              group: mockGroupPrisma,
            }),
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
    it("should return matching keys of groups that are not deleted", async () => {
      mockApiKeyPrisma.findMany.mockResolvedValue([mockApiKey]);

      const result = await service.findApiKeysByPrefix("abcd1234");

      expect(result).toEqual([mockApiKey]);
      expect(mockApiKeyPrisma.findMany).toHaveBeenCalledWith({
        where: { key_prefix: "abcd1234", group: { deleted_at: null } },
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
    it("should create a group api actor when the group has none yet", async () => {
      mockGroupPrisma.findUniqueOrThrow.mockResolvedValue({
        api_actor_id: null,
      });
      mockApiKeyPrisma.create.mockResolvedValue(mockApiKey);

      const result = await service.createApiKey(createData);

      expect(result).toEqual(mockApiKey);
      expect(mockGroupPrisma.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: createData.group_id },
        select: { api_actor_id: true },
      });
      expect(mockActorPrisma.create).toHaveBeenCalled();
      expect(mockGroupPrisma.update).toHaveBeenCalledWith({
        where: { id: createData.group_id },
        data: { api_actor_id: "actor-1" },
      });
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

    it("should reuse the group's existing api actor without creating a new one", async () => {
      mockGroupPrisma.findUniqueOrThrow.mockResolvedValue({
        api_actor_id: "existing-actor",
      });
      mockApiKeyPrisma.create.mockResolvedValue(mockApiKey);

      await service.createApiKey(createData);

      expect(mockActorPrisma.create).not.toHaveBeenCalled();
      expect(mockGroupPrisma.update).not.toHaveBeenCalled();
      expect(mockApiKeyPrisma.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actor_id: "existing-actor" }),
        }),
      );
    });

    it("should use tx when provided", async () => {
      const txActorPrisma = {
        create: jest.fn().mockResolvedValue({ id: "actor-1" }),
      };
      const txGroupPrisma = {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ api_actor_id: null }),
        update: jest.fn().mockResolvedValue({ api_actor_id: "actor-1" }),
      };
      const txApiKeyPrisma = {
        create: jest.fn().mockResolvedValue(mockApiKey),
      };
      const tx = {
        actor: txActorPrisma,
        group: txGroupPrisma,
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
    it("should delete the key using this.prisma when no tx, leaving its actor intact", async () => {
      mockApiKeyPrisma.delete.mockResolvedValue(mockApiKey);

      const result = await service.deleteApiKeyById("key-1");

      expect(result).toEqual(mockApiKey);
      expect(mockApiKeyPrisma.delete).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
      expect(mockActorPrisma.create).not.toHaveBeenCalled();
    });

    it("should use tx when provided", async () => {
      const txApiKeyPrisma = {
        delete: jest.fn().mockResolvedValue(mockApiKey),
      };
      const tx = {
        apiKey: txApiKeyPrisma,
      } as unknown as Parameters<typeof service.deleteApiKeyById>[1];

      const result = await service.deleteApiKeyById("key-1", tx);

      expect(result).toEqual(mockApiKey);
      expect(txApiKeyPrisma.delete).toHaveBeenCalledWith({
        where: { id: "key-1" },
      });
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
