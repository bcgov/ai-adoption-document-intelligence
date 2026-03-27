import type { ApiKey } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { ApiKeyDbService, type CreateApiKeyData } from "./api-key-db.service";
import { UserDbService } from "./user-db.service";

describe("UserDbService", () => {
  let service: UserDbService;
  let mockUserPrisma: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
  let mockPrisma: { user: typeof mockUserPrisma };

  beforeEach(async () => {
    mockUserPrisma = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    };
    mockPrisma = { user: mockUserPrisma };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<UserDbService>(UserDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("isUserSystemAdmin", () => {
    it("returns true when admin (no tx)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ is_system_admin: true });
      expect(await service.isUserSystemAdmin("user-1")).toBe(true);
    });
    it("returns false when not admin", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ is_system_admin: false });
      expect(await service.isUserSystemAdmin("user-1")).toBe(false);
    });
    it("returns false when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      expect(await service.isUserSystemAdmin("missing")).toBe(false);
    });
    it("uses tx client", async () => {
      const txUser = {
        findUnique: jest.fn().mockResolvedValue({ is_system_admin: true }),
      };
      const tx = { user: txUser } as unknown as Parameters<
        typeof service.isUserSystemAdmin
      >[1];
      expect(await service.isUserSystemAdmin("user-1", tx)).toBe(true);
      expect(txUser.findUnique).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
