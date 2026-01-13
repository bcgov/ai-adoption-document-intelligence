import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as bcrypt from "bcrypt";
import { ApiKeyService } from "./api-key.service";

// Mock Prisma
const mockPrismaApiKey = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
};

jest.mock("../generated/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    apiKey: mockPrismaApiKey,
  })),
}));

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "DATABASE_URL") {
                return "postgresql://test:test@localhost:5432/test";
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  describe("getUserApiKey", () => {
    it("should return null when no key exists", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(null);

      const result = await service.getUserApiKey("user123");

      expect(result).toBeNull();
      expect(mockPrismaApiKey.findUnique).toHaveBeenCalledWith({
        where: { user_id: "user123" },
      });
    });

    it("should return key info when key exists", async () => {
      const mockKey = {
        id: "key123",
        key_prefix: "abcd1234",
        user_email: "test@example.com",
        created_at: new Date("2024-01-01"),
        last_used: new Date("2024-01-02"),
      };
      mockPrismaApiKey.findUnique.mockResolvedValue(mockKey);

      const result = await service.getUserApiKey("user123");

      expect(result).toEqual({
        id: "key123",
        keyPrefix: "abcd1234",
        userEmail: "test@example.com",
        createdAt: mockKey.created_at,
        lastUsed: mockKey.last_used,
      });
    });
  });

  describe("generateApiKey", () => {
    it("should throw ConflictException if user already has a key", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.generateApiKey("user123", "test@example.com"),
      ).rejects.toThrow(ConflictException);
    });

    it("should generate and return a new key", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(null);
      mockPrismaApiKey.create.mockImplementation(async ({ data }) => ({
        id: "newkey123",
        key_hash: data.key_hash,
        key_prefix: data.key_prefix,
        user_id: data.user_id,
        user_email: data.user_email,
        created_at: new Date(),
        last_used: null,
      }));

      const result = await service.generateApiKey(
        "user123",
        "test@example.com",
      );

      expect(result.id).toBe("newkey123");
      expect(result.key).toBeDefined();
      expect(result.key.length).toBeGreaterThan(20);
      expect(result.keyPrefix).toBe(result.key.substring(0, 8));
      expect(result.userEmail).toBe("test@example.com");
      expect(mockPrismaApiKey.create).toHaveBeenCalled();
    });
  });

  describe("deleteApiKey", () => {
    it("should throw NotFoundException if no key exists", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(null);

      await expect(service.deleteApiKey("user123")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should delete existing key", async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue({ id: "key123" });
      mockPrismaApiKey.delete.mockResolvedValue({});

      await service.deleteApiKey("user123");

      expect(mockPrismaApiKey.delete).toHaveBeenCalledWith({
        where: { user_id: "user123" },
      });
    });
  });

  describe("validateApiKey", () => {
    it("should return null for invalid key", async () => {
      mockPrismaApiKey.findMany.mockResolvedValue([]);

      const result = await service.validateApiKey("invalidkey");

      expect(result).toBeNull();
    });

    it("should return user info and update last_used for valid key", async () => {
      const validKey = "testkey123";
      const hashedKey = await bcrypt.hash(validKey, 10);

      mockPrismaApiKey.findMany.mockResolvedValue([
        {
          id: "key123",
          key_hash: hashedKey,
          user_id: "user123",
          user_email: "test@example.com",
        },
      ]);
      mockPrismaApiKey.update.mockResolvedValue({});

      const result = await service.validateApiKey(validKey);

      expect(result).toEqual({
        userId: "user123",
        userEmail: "test@example.com",
      });
      expect(mockPrismaApiKey.update).toHaveBeenCalledWith({
        where: { id: "key123" },
        data: { last_used: expect.any(Date) },
      });
    });
  });
});
