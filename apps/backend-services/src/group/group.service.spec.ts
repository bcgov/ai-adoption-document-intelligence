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
    it("should return all non-deleted groups", async () => {
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
      expect(result).toEqual([
        { id: "g1", name: "Group 1" },
        { id: "g2", name: "Group 2" },
      ]);
      expect(mockPrisma.group.findMany).toHaveBeenCalledWith({
        where: { deleted_at: null },
        select: { id: true, name: true },
      });
    });

    it("should exclude soft-deleted groups", async () => {
      const activeGroup = { id: "g1", name: "Active Group" };
      const mockPrisma = {
        group: {
          findMany: jest.fn().mockResolvedValue([activeGroup]),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.getAllGroups();
      expect(result).toEqual([activeGroup]);
      expect(mockPrisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null } }),
      );
    });
  });

  describe("getUserGroups", () => {
    it("should return non-deleted user group memberships with role", async () => {
      const mockUserGroups = [
        { group: { id: "g1", name: "Group 1" }, role: "ADMIN" },
        { group: { id: "g2", name: "Group 2" }, role: "MEMBER" },
      ];
      const mockPrisma = {
        userGroup: {
          findMany: jest.fn().mockResolvedValue(mockUserGroups),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.getUserGroups("user1");
      expect(result).toEqual([
        { id: "g1", name: "Group 1", role: "ADMIN" },
        { id: "g2", name: "Group 2", role: "MEMBER" },
      ]);
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledWith({
        where: { user_id: "user1", group: { deleted_at: null } },
        include: { group: true },
      });
    });

    it("should exclude soft-deleted groups from user group memberships", async () => {
      const activeUserGroup = {
        group: { id: "g1", name: "Active Group" },
        role: "MEMBER",
      };
      const mockPrisma = {
        userGroup: {
          findMany: jest.fn().mockResolvedValue([activeUserGroup]),
        },
      };
      const service = new GroupService({ prisma: mockPrisma } as any);
      const result = await service.getUserGroups("user1");
      expect(result).toEqual([
        { id: "g1", name: "Active Group", role: "MEMBER" },
      ]);
      expect(mockPrisma.userGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: "user1", group: { deleted_at: null } },
        }),
      );
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

    it("should throw when user is already a member", async () => {
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
      await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
        "User is already a member of this group",
      );
      expect(createRequest).not.toHaveBeenCalled();
    });

    it("should throw when user already has a PENDING request", async () => {
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
      await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
        "A pending membership request already exists for this group",
      );
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

  describe("cancelMembershipRequest", () => {
    const userId = "user1";
    const requestId = "req1";
    const pendingRequest = {
      id: requestId,
      user_id: userId,
      status: "PENDING",
    };

    const buildDb = (findUniqueResult: unknown, updateFn = jest.fn()) => ({
      prisma: {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(findUniqueResult),
          update: updateFn,
        },
      },
    });

    it("should update the request to CANCELLED with actor, resolved_at, and updated_by", async () => {
      const updateFn = jest.fn().mockResolvedValue(undefined);
      const svc = new GroupService(buildDb(pendingRequest, updateFn) as any);
      await svc.cancelMembershipRequest(userId, requestId);
      expect(updateFn).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({
          status: "CANCELLED",
          actor_id: userId,
          updated_by: userId,
          resolved_at: expect.any(Date),
        }),
      });
    });

    it("should store reason when provided", async () => {
      const updateFn = jest.fn().mockResolvedValue(undefined);
      const svc = new GroupService(buildDb(pendingRequest, updateFn) as any);
      await svc.cancelMembershipRequest(userId, requestId, "No longer needed");
      expect(updateFn).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({ reason: "No longer needed" }),
      });
    });

    it("should not include reason key when not provided", async () => {
      const updateFn = jest.fn().mockResolvedValue(undefined);
      const svc = new GroupService(buildDb(pendingRequest, updateFn) as any);
      await svc.cancelMembershipRequest(userId, requestId);
      const callData = updateFn.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty("reason");
    });

    it("should throw NotFoundException when request does not exist", async () => {
      const svc = new GroupService(buildDb(null) as any);
      await expect(
        svc.cancelMembershipRequest(userId, requestId),
      ).rejects.toThrow("Membership request not found");
    });

    it("should throw ForbiddenException when request belongs to a different user", async () => {
      const otherUserRequest = { ...pendingRequest, user_id: "other-user" };
      const svc = new GroupService(buildDb(otherUserRequest) as any);
      await expect(
        svc.cancelMembershipRequest(userId, requestId),
      ).rejects.toThrow("Cannot cancel a request belonging to another user");
    });

    it("should throw BadRequestException when request is not PENDING", async () => {
      for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
        const resolvedRequest = { ...pendingRequest, status };
        const svc = new GroupService(buildDb(resolvedRequest) as any);
        await expect(
          svc.cancelMembershipRequest(userId, requestId),
        ).rejects.toThrow("Only PENDING requests can be cancelled");
      }
    });
  });

  describe("approveMembershipRequest", () => {
    const adminId = "admin1";
    const requestId = "req1";
    const pendingRequest = {
      id: requestId,
      user_id: "user1",
      group_id: "group1",
      status: "PENDING",
    };

    const buildDb = (
      findUniqueResult: unknown,
      transactionFn = jest.fn().mockResolvedValue([{}, {}]),
    ) => ({
      prisma: {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(findUniqueResult),
          update: jest.fn(),
        },
        userGroup: {
          upsert: jest.fn(),
        },
        $transaction: transactionFn,
      },
    });

    it("should execute a transaction adding the user to the group and updating the request to APPROVED", async () => {
      const transactionFn = jest.fn().mockResolvedValue([{}, {}]);
      const mockUpsert = { then: jest.fn() };
      const mockUpdate = { then: jest.fn() };
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: jest.fn().mockReturnValue(mockUpdate),
        },
        userGroup: {
          upsert: jest.fn().mockReturnValue(mockUpsert),
        },
        $transaction: transactionFn,
      };
      const svc = new GroupService({ prisma } as any);
      await svc.approveMembershipRequest(adminId, requestId);

      expect(prisma.userGroup.upsert).toHaveBeenCalledWith({
        where: {
          user_id_group_id: {
            user_id: pendingRequest.user_id,
            group_id: pendingRequest.group_id,
          },
        },
        update: {},
        create: {
          user_id: pendingRequest.user_id,
          group_id: pendingRequest.group_id,
        },
      });
      expect(prisma.groupMembershipRequest.update).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({
          status: "APPROVED",
          actor_id: adminId,
          updated_by: adminId,
          resolved_at: expect.any(Date),
        }),
      });
      expect(transactionFn).toHaveBeenCalledWith([mockUpsert, mockUpdate]);
    });

    it("should store reason when provided", async () => {
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: jest.fn().mockReturnValue({}),
        },
        userGroup: {
          upsert: jest.fn().mockReturnValue({}),
        },
        $transaction: jest.fn().mockResolvedValue([{}, {}]),
      };
      const svc = new GroupService({ prisma } as any);
      await svc.approveMembershipRequest(adminId, requestId, "Looks good");
      expect(prisma.groupMembershipRequest.update).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({ reason: "Looks good" }),
      });
    });

    it("should not include reason key when reason is not provided", async () => {
      const updateFn = jest.fn().mockReturnValue({});
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: updateFn,
        },
        userGroup: {
          upsert: jest.fn().mockReturnValue({}),
        },
        $transaction: jest.fn().mockResolvedValue([{}, {}]),
      };
      const svc = new GroupService({ prisma } as any);
      await svc.approveMembershipRequest(adminId, requestId);
      const callData = updateFn.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty("reason");
    });

    it("should throw NotFoundException when request does not exist", async () => {
      const svc = new GroupService(buildDb(null) as any);
      await expect(
        svc.approveMembershipRequest(adminId, requestId),
      ).rejects.toThrow("Membership request not found");
    });

    it("should throw BadRequestException when request is not PENDING", async () => {
      for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
        const resolvedRequest = { ...pendingRequest, status };
        const svc = new GroupService(buildDb(resolvedRequest) as any);
        await expect(
          svc.approveMembershipRequest(adminId, requestId),
        ).rejects.toThrow("Only PENDING requests can be approved");
      }
    });
  });

  describe("denyMembershipRequest", () => {
    const adminId = "admin1";
    const requestId = "req1";
    const pendingRequest = {
      id: requestId,
      user_id: "user1",
      group_id: "group1",
      status: "PENDING",
    };

    const buildDb = (findUniqueResult: unknown) => ({
      prisma: {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(findUniqueResult),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    });

    it("should update the request to DENIED with actor_id, resolved_at, and updated_by", async () => {
      const updateFn = jest.fn().mockResolvedValue({});
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: updateFn,
        },
      };
      const svc = new GroupService({ prisma } as any);
      await svc.denyMembershipRequest(adminId, requestId);

      expect(updateFn).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({
          status: "DENIED",
          actor_id: adminId,
          updated_by: adminId,
          resolved_at: expect.any(Date),
        }),
      });
    });

    it("should store reason when provided", async () => {
      const updateFn = jest.fn().mockResolvedValue({});
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: updateFn,
        },
      };
      const svc = new GroupService({ prisma } as any);
      await svc.denyMembershipRequest(adminId, requestId, "Not eligible");
      expect(updateFn).toHaveBeenCalledWith({
        where: { id: requestId },
        data: expect.objectContaining({ reason: "Not eligible" }),
      });
    });

    it("should not include reason key when reason is not provided", async () => {
      const updateFn = jest.fn().mockResolvedValue({});
      const prisma = {
        groupMembershipRequest: {
          findUnique: jest.fn().mockResolvedValue(pendingRequest),
          update: updateFn,
        },
      };
      const svc = new GroupService({ prisma } as any);
      await svc.denyMembershipRequest(adminId, requestId);
      const callData = updateFn.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty("reason");
    });

    it("should throw NotFoundException when request does not exist", async () => {
      const svc = new GroupService(buildDb(null) as any);
      await expect(
        svc.denyMembershipRequest(adminId, requestId),
      ).rejects.toThrow("Membership request not found");
    });

    it("should throw BadRequestException when request is not PENDING", async () => {
      for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
        const resolvedRequest = { ...pendingRequest, status };
        const svc = new GroupService(buildDb(resolvedRequest) as any);
        await expect(
          svc.denyMembershipRequest(adminId, requestId),
        ).rejects.toThrow("Only PENDING requests can be denied");
      }
    });
  });
});
