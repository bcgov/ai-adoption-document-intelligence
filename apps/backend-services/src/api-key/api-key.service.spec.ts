import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/database/prisma.service";
import { ApiKeyService } from "./api-key.service";

// Mock Prisma
const mockPrismaApiKey = {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  update: jest.fn(),
};
const mockPrismaUser = {
  findUnique: jest.fn(),
};
const mockPrismaService = {
  prisma: {
    apiKey: mockPrismaApiKey,
    user: mockPrismaUser,
  },
};

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset all user mocks
    Object.values(mockPrismaApiKey).forEach((fn) => fn.mockReset());
    Object.values(mockPrismaUser).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe("getUserApiKey", () => {
    it("should return null when no key exists", async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue(null);

      const result = await service.getUserApiKey("user123");

      expect(result).toBeNull();
      expect(mockPrismaApiKey.findFirst).toHaveBeenCalledWith({
        where: { user_id: "user123" },
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
            },
          },
        },
      });
    });

    it("should return key info when key exists", async () => {
      const mockKey = {
        id: "key123",
        key_prefix: "abcd1234",
        created_at: new Date("2024-01-01"),
        last_used: new Date("2024-01-02"),
        user: {
          email: "test@example.com",
          userRoles: [{ role: { name: "viewer" } }],
        },
      };
      mockPrismaApiKey.findFirst.mockResolvedValue(mockKey);

      const result = await service.getUserApiKey("user123");

      expect(result).toEqual({
        id: "key123",
        keyPrefix: "abcd1234",
        userEmail: "test@example.com",
        roles: ["viewer"],
        createdAt: mockKey.created_at,
        lastUsed: mockKey.last_used,
      });
    });
  });

  describe("generateApiKey", () => {
    it("should throw ConflictException if user already has a key", async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue({ id: "existing" });
      await expect(
        service.generateApiKey("user123", "group123"),
      ).rejects.toThrow(ConflictException);
    });

    it("should generate and return a new key with roles", async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue(null);
      mockPrismaUser.findUnique.mockResolvedValue({
        email: "test@example.com",
        userRoles: [{ role: { name: "admin" } }, { role: { name: "editor" } }],
      });
      mockPrismaApiKey.create.mockImplementation(async ({ data }) => ({
        id: "newkey123",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        user_id: data.user_id,
        group_id: data.group_id,
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.generateApiKey("user123", "group123");

      expect(result.id).toBe("newkey123");
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.userEmail).toBe("test@example.com");
      expect(result.roles).toEqual(["admin", "editor"]);
      expect(mockPrismaApiKey.create).toHaveBeenCalled();
    });

    it("should generate a key with empty roles when none provided", async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue(null);
      mockPrismaUser.findUnique.mockResolvedValue({
        email: "test@example.com",
        userRoles: [],
      });
      mockPrismaApiKey.create.mockImplementation(async ({ data }) => ({
        id: "newkey456",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        user_id: data.user_id,
        group_id: data.group_id,
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.generateApiKey("user123", "group123");
      expect(result.roles).toEqual([]);
    });
  });

  describe("deleteApiKey", () => {
    it("should throw NotFoundException if no key exists", async () => {
      mockPrismaApiKey.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteApiKey("user123")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should delete existing key", async () => {
      mockPrismaApiKey.deleteMany.mockResolvedValue({ count: 1 });
      await service.deleteApiKey("user123");
      expect(mockPrismaApiKey.deleteMany).toHaveBeenCalledWith({
        where: { user_id: "user123" },
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
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
            },
          },
        },
      });
    });

    it("should return user info with roles and update last_used for valid key", async () => {
      const validKey = "testkey123";
      const hashedKey = await bcrypt.hash(validKey, 10);

      mockPrismaApiKey.findMany.mockResolvedValue([
        {
          id: "key123",
          key_hash: hashedKey,
          key_prefix: "testkey1",
          user_id: "user123",
          user: {
            email: "test@example.com",
            userRoles: [{ role: { name: "admin" } }],
          },
        },
      ]);
      mockPrismaApiKey.update.mockResolvedValue({});

      const result = await service.validateApiKey(validKey);

      expect(result).toEqual({
        userId: "user123",
        userEmail: "test@example.com",
        roles: ["admin"],
      });
      expect(mockPrismaApiKey.findMany).toHaveBeenCalledWith({
        where: { key_prefix: "testkey1" },
        include: {
          user: {
            include: {
              userRoles: { include: { role: true } },
            },
          },
        },
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
          user_id: "user123",
          user: {
            email: "test@example.com",
            userRoles: [],
          },
        },
      ]);

      const result = await service.validateApiKey(validKey);

      expect(result).toBeNull();
      expect(mockPrismaApiKey.update).not.toHaveBeenCalled();
    });
  });
});
