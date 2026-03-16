import { GroupRole } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../database/prisma.service";
import { GroupDbService } from "./group-db.service";

describe("GroupDbService", () => {
  let service: GroupDbService;
  let mockPrisma: {
    userGroup: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      userGroup: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<GroupDbService>(GroupDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // findUsersGroups
  // ---------------------------------------------------------------------------

  describe("findUsersGroups", () => {
    it("should return all UserGroup records for the given user", async () => {
      const userGroups = [
        { user_id: "user-1", group_id: "g1", role: GroupRole.MEMBER },
        { user_id: "user-1", group_id: "g2", role: GroupRole.ADMIN },
      ];
      mockPrisma.userGroup.findMany.mockResolvedValueOnce(userGroups);

      const result = await service.findUsersGroups("user-1");

      expect(result).toEqual(userGroups);
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledWith({
        where: { user_id: "user-1" },
      });
    });

    it("should return an empty array when the user belongs to no groups", async () => {
      mockPrisma.userGroup.findMany.mockResolvedValueOnce([]);

      const result = await service.findUsersGroups("user-no-groups");

      expect(result).toEqual([]);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.userGroup.findMany.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.findUsersGroups("user-1")).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // isUserInGroup
  // ---------------------------------------------------------------------------

  describe("isUserInGroup", () => {
    it("should return true when the user is a member of the group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValueOnce({
        user_id: "user-1",
        group_id: "group-1",
        role: GroupRole.MEMBER,
      });

      const result = await service.isUserInGroup("user-1", "group-1");

      expect(result).toBe(true);
      expect(mockPrisma.userGroup.findUnique).toHaveBeenCalledWith({
        where: {
          user_id_group_id: { user_id: "user-1", group_id: "group-1" },
        },
      });
    });

    it("should return false when the user is not a member of the group", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValueOnce(null);

      const result = await service.isUserInGroup("user-1", "group-1");

      expect(result).toBe(false);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.userGroup.findUnique.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.isUserInGroup("user-1", "group-1")).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // isUserSystemAdmin
  // ---------------------------------------------------------------------------

  describe("isUserSystemAdmin", () => {
    it("should return true when the user has is_system_admin set to true", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_system_admin: true,
      });

      const result = await service.isUserSystemAdmin("admin-user");

      expect(result).toBe(true);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "admin-user" },
        select: { is_system_admin: true },
      });
    });

    it("should return false when the user has is_system_admin set to false", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        is_system_admin: false,
      });

      const result = await service.isUserSystemAdmin("regular-user");

      expect(result).toBe(false);
    });

    it("should return false when the user is not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.isUserSystemAdmin("missing-user");

      expect(result).toBe(false);
    });

    it("should re-throw errors from Prisma", async () => {
      mockPrisma.user.findUnique.mockRejectedValueOnce(
        new Error("Prisma error"),
      );

      await expect(service.isUserSystemAdmin("user-1")).rejects.toThrow(
        "Prisma error",
      );
    });
  });

  describe("transaction support", () => {
    it("should use provided tx client instead of this.prisma for findUsersGroups", async () => {
      const userGroups = [{ user_id: "user-1", group_id: "g1" }];
      const mockTxUserGroup = {
        findMany: jest.fn().mockResolvedValueOnce(userGroups),
      };
      const mockTx = { userGroup: mockTxUserGroup } as any;

      const result = await service.findUsersGroups("user-1", mockTx);

      expect(result).toEqual(userGroups);
      expect(mockTxUserGroup.findMany).toHaveBeenCalledWith({
        where: { user_id: "user-1" },
      });
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for isUserInGroup", async () => {
      const mockTxUserGroup = {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ user_id: "user-1", group_id: "g1" }),
      };
      const mockTx = { userGroup: mockTxUserGroup } as any;

      const result = await service.isUserInGroup("user-1", "g1", mockTx);

      expect(result).toBe(true);
      expect(mockTxUserGroup.findUnique).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findUnique).not.toHaveBeenCalled();
    });

    it("should use provided tx client instead of this.prisma for isUserSystemAdmin", async () => {
      const mockTxUser = {
        findUnique: jest.fn().mockResolvedValueOnce({ is_system_admin: true }),
      };
      const mockTx = { user: mockTxUser } as any;

      const result = await service.isUserSystemAdmin("user-1", mockTx);

      expect(result).toBe(true);
      expect(mockTxUser.findUnique).toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
