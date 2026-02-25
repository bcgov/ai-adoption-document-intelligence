import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { GroupService } from "./group.service";

describe("GroupService", () => {
  let service: GroupService;
  let _databaseService: DatabaseService;

  beforeEach(async () => {
    const mockPrisma = {
      group: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "group1" }, { id: "group2" }]),
      },
      userGroup: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        {
          provide: DatabaseService,
          useValue: { prisma: mockPrisma },
        },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
    _databaseService = module.get<DatabaseService>(DatabaseService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("assignUserToGroups should resolve", async () => {
    await expect(
      service.assignUserToGroups("user1", ["group1", "group2"]),
    ).resolves.toBeUndefined();
  });
});

describe("removeUserFromGroup", () => {
  it("should remove a user from a group", async () => {
    const groupId = "test-group";
    const userId = "test-user";
    const mockGroup = { id: groupId };
    const mockUserGroup = { user_id: userId, group_id: groupId };
    const findUniqueGroup = jest.fn().mockResolvedValue(mockGroup);
    const findUniqueUserGroup = jest.fn().mockResolvedValue(mockUserGroup);
    const deleteUserGroup = jest.fn().mockResolvedValue(undefined);
    const databaseService = {
      prisma: {
        group: {
          findUnique: findUniqueGroup,
        },
        userGroup: {
          findUnique: findUniqueUserGroup,
          delete: deleteUserGroup,
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await service.removeUserFromGroup(groupId, userId);
    expect(findUniqueGroup).toHaveBeenCalledWith({ where: { id: groupId } });
    expect(findUniqueUserGroup).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
    expect(deleteUserGroup).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  });

  it("should throw if group not found", async () => {
    const groupId = "missing-group";
    const userId = "user";
    const findUniqueGroup = jest.fn().mockResolvedValue(undefined);
    const databaseService = {
      prisma: {
        group: {
          findUnique: findUniqueGroup,
        },
        userGroup: {
          findUnique: jest.fn(),
          delete: jest.fn(),
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await expect(service.removeUserFromGroup(groupId, userId)).rejects.toThrow(
      "Group not found",
    );
  });

  it("should throw if user not a member", async () => {
    const groupId = "group";
    const userId = "not-member";
    const mockGroup = { id: groupId };
    const findUniqueGroup = jest.fn().mockResolvedValue(mockGroup);
    const findUniqueUserGroup = jest.fn().mockResolvedValue(undefined);
    const databaseService = {
      prisma: {
        group: {
          findUnique: findUniqueGroup,
        },
        userGroup: {
          findUnique: findUniqueUserGroup,
          delete: jest.fn(),
        },
      },
    };
    const service = new GroupService(databaseService as any);
    await expect(service.removeUserFromGroup(groupId, userId)).rejects.toThrow(
      "User not a member of this group",
    );
  });

  describe("deleteGroup", () => {
    it("should delete a group by ID", async () => {
      const mockPrisma = {
        group: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "g1", name: "Test Group" }),
          delete: jest.fn().mockResolvedValue(undefined),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      await service.deleteGroup("g1");
      expect(mockPrisma.group.findUnique).toHaveBeenCalledWith({
        where: { id: "g1" },
      });
      expect(mockPrisma.group.delete).toHaveBeenCalledWith({
        where: { id: "g1" },
      });
    });
    it("should throw if group not found", async () => {
      const mockPrisma = {
        group: {
          findUnique: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      await expect(service.deleteGroup("g1")).rejects.toThrow(
        "Group not found",
      );
    });
  });

  describe("getAllGroups", () => {
    it("should return all groups", async () => {
      const mockGroups = [
        { id: "g1", name: "Group 1" },
        { id: "g2", name: "Group 2" },
      ];
      const mockPrisma = {
        group: {
          findMany: jest.fn().mockResolvedValue(mockGroups),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.getAllGroups();
      expect(result).toEqual(mockGroups);
      expect(mockPrisma.group.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true },
      });
    });
  });

  describe("getUserGroups", () => {
    it("should return user group memberships", async () => {
      const mockUserGroups = [
        { group: { id: "g1", name: "Group 1" } },
        { group: { id: "g2", name: "Group 2" } },
      ];
      const mockPrisma = {
        userGroup: {
          findMany: jest.fn().mockResolvedValue(mockUserGroups),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.getUserGroups("user1");
      expect(result).toEqual([
        { id: "g1", name: "Group 1" },
        { id: "g2", name: "Group 2" },
      ]);
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledWith({
        where: { user_id: "user1" },
        include: { group: true },
      });
    });
  });

  describe("requestMembership", () => {
    const userId = "user1";
    const groupId = "group1";
    const mockGroup = { id: groupId };

    it("should create a PENDING request when user is not a member and has no pending request", async () => {
      const createRequest = jest.fn().mockResolvedValue({});
      const databaseService = {
        prisma: {
          group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
          userGroup: { findUnique: jest.fn().mockResolvedValue(null) },
          groupMembershipRequest: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: createRequest,
          },
        },
      };
      const svc = new GroupService(databaseService as any);
      await svc.requestMembership(userId, groupId);
      expect(createRequest).toHaveBeenCalledWith({
        data: {
          user_id: userId,
          group_id: groupId,
          status: "PENDING",
          created_by: userId,
          updated_by: userId,
        },
      });
    });

    it("should throw NotFoundException when group does not exist", async () => {
      const databaseService = {
        prisma: {
          group: { findUnique: jest.fn().mockResolvedValue(null) },
          userGroup: { findUnique: jest.fn() },
          groupMembershipRequest: { findFirst: jest.fn(), create: jest.fn() },
        },
      };
      const svc = new GroupService(databaseService as any);
      await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
        "Group not found",
      );
    });

    it("should return silently when user is already a member", async () => {
      const createRequest = jest.fn();
      const databaseService = {
        prisma: {
          group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
          userGroup: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ user_id: userId, group_id: groupId }),
          },
          groupMembershipRequest: {
            findFirst: jest.fn(),
            create: createRequest,
          },
        },
      };
      const svc = new GroupService(databaseService as any);
      await svc.requestMembership(userId, groupId);
      expect(createRequest).not.toHaveBeenCalled();
    });

    it("should return silently when user already has a PENDING request", async () => {
      const createRequest = jest.fn();
      const databaseService = {
        prisma: {
          group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
          userGroup: { findUnique: jest.fn().mockResolvedValue(null) },
          groupMembershipRequest: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ id: "req1", status: "PENDING" }),
            create: createRequest,
          },
        },
      };
      const svc = new GroupService(databaseService as any);
      await svc.requestMembership(userId, groupId);
      expect(createRequest).not.toHaveBeenCalled();
    });
  });
  describe("createGroup", () => {
    it("should create a new group", async () => {
      const mockGroup = { id: "g1", name: "Test Group" };
      const mockPrisma = {
        group: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockGroup),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.createGroup("Test Group");
      expect(result).toEqual(mockGroup);
      expect(mockPrisma.group.findUnique).toHaveBeenCalledWith({
        where: { name: "Test Group" },
      });
      expect(mockPrisma.group.create).toHaveBeenCalledWith({
        data: { name: "Test Group" },
      });
    });

    it("should throw if group name exists", async () => {
      const mockPrisma = {
        group: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "g1", name: "Test Group" }),
          create: jest.fn(),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      await expect(service.createGroup("Test Group")).rejects.toThrow(
        "Group with this name already exists",
      );
    });
  });
});
