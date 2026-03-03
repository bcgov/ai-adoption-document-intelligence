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
    await expect(service.deleteGroup("g1")).rejects.toThrow("Group not found");
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
    await expect(svc.denyMembershipRequest(adminId, requestId)).rejects.toThrow(
      "Membership request not found",
    );
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

describe("getGroupMembers", () => {
  const callerId = "caller-1";
  const groupId = "group-1";
  const joinedAt = new Date("2026-01-01T00:00:00.000Z");
  const mockGroup = { id: groupId, name: "Test Group", deleted_at: null };
  const mockMembers = [
    {
      user_id: "user-1",
      group_id: groupId,
      created_at: joinedAt,
      user: { id: "user-1", email: "user1@example.com" },
    },
    {
      user_id: "user-2",
      group_id: groupId,
      created_at: joinedAt,
      user: { id: "user-2", email: "user2@example.com" },
    },
  ];

  it("should return members when caller is a regular group member", async () => {
    const databaseService = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
        userGroup: { findMany: jest.fn().mockResolvedValue(mockMembers) },
      },
      isUserSystemAdmin: jest.fn().mockResolvedValue(false),
      isUserInGroup: jest.fn().mockResolvedValue(true),
    };
    const svc = new GroupService(databaseService as any);
    const result = await svc.getGroupMembers(callerId, groupId);
    expect(result).toEqual([
      { userId: "user-1", email: "user1@example.com", joinedAt },
      { userId: "user-2", email: "user2@example.com", joinedAt },
    ]);
  });

  it("should return members when caller is a system admin", async () => {
    const databaseService = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
        userGroup: { findMany: jest.fn().mockResolvedValue(mockMembers) },
      },
      isUserSystemAdmin: jest.fn().mockResolvedValue(true),
      isUserInGroup: jest.fn(),
    };
    const svc = new GroupService(databaseService as any);
    const result = await svc.getGroupMembers(callerId, groupId);
    expect(databaseService.isUserInGroup).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });

  it("should throw ForbiddenException when caller is not a member and not a system admin", async () => {
    const databaseService = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
        userGroup: { findMany: jest.fn() },
      },
      isUserSystemAdmin: jest.fn().mockResolvedValue(false),
      isUserInGroup: jest.fn().mockResolvedValue(false),
    };
    const svc = new GroupService(databaseService as any);
    await expect(svc.getGroupMembers(callerId, groupId)).rejects.toThrow(
      "You do not have permission to view members of this group",
    );
    expect(databaseService.prisma.userGroup.findMany).not.toHaveBeenCalled();
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const databaseService = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(null) },
        userGroup: { findMany: jest.fn() },
      },
      isUserSystemAdmin: jest.fn(),
      isUserInGroup: jest.fn(),
    };
    const svc = new GroupService(databaseService as any);
    await expect(svc.getGroupMembers(callerId, groupId)).rejects.toThrow(
      "Group not found",
    );
  });
});

describe("removeGroupMember", () => {
  const callerId = "caller-1";
  const groupId = "group-1";
  const userId = "user-1";
  const mockGroup = { id: groupId };
  const adminMembership = {
    user_id: callerId,
    group_id: groupId,
    role: "ADMIN",
  };
  const memberMembership = {
    user_id: callerId,
    group_id: groupId,
    role: "MEMBER",
  };
  const targetMembership = {
    user_id: userId,
    group_id: groupId,
    role: "MEMBER",
  };

  const buildDb = ({
    group = mockGroup,
    callerUserGroup = adminMembership,
    targetUserGroup = targetMembership,
    isSystemAdmin = false,
    deleteFn = jest.fn().mockResolvedValue(undefined),
  }: {
    group?: unknown;
    callerUserGroup?: unknown;
    targetUserGroup?: unknown;
    isSystemAdmin?: boolean;
    deleteFn?: jest.Mock;
  }) => ({
    prisma: {
      group: { findUnique: jest.fn().mockResolvedValue(group) },
      userGroup: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(callerUserGroup)
          .mockResolvedValueOnce(targetUserGroup),
        delete: deleteFn,
      },
    },
    isUserSystemAdmin: jest.fn().mockResolvedValue(isSystemAdmin),
  });

  it("should remove the target user when caller is a group admin", async () => {
    const deleteFn = jest.fn().mockResolvedValue(undefined);
    const db = buildDb({ deleteFn });
    const svc = new GroupService(db as any);
    await svc.removeGroupMember(callerId, groupId, userId);
    expect(deleteFn).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  });

  it("should remove the target user when caller is a system admin", async () => {
    const deleteFn = jest.fn().mockResolvedValue(undefined);
    const db = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
        userGroup: {
          findUnique: jest.fn().mockResolvedValue(targetMembership),
          delete: deleteFn,
        },
      },
      isUserSystemAdmin: jest.fn().mockResolvedValue(true),
    };
    const svc = new GroupService(db as any);
    await svc.removeGroupMember(callerId, groupId, userId);
    expect(deleteFn).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  });

  it("should throw ForbiddenException when caller is a regular member (not admin)", async () => {
    const db = buildDb({ callerUserGroup: memberMembership });
    const svc = new GroupService(db as any);
    await expect(
      svc.removeGroupMember(callerId, groupId, userId),
    ).rejects.toThrow("Only group admins or system admins can remove members");
  });

  it("should throw ForbiddenException when caller has no membership record", async () => {
    const db = buildDb({ callerUserGroup: null });
    const svc = new GroupService(db as any);
    await expect(
      svc.removeGroupMember(callerId, groupId, userId),
    ).rejects.toThrow("Only group admins or system admins can remove members");
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const db = buildDb({ group: null });
    const svc = new GroupService(db as any);
    await expect(
      svc.removeGroupMember(callerId, groupId, userId),
    ).rejects.toThrow("Group not found");
  });

  it("should throw NotFoundException when target user is not a member", async () => {
    const db = buildDb({ targetUserGroup: null });
    const svc = new GroupService(db as any);
    await expect(
      svc.removeGroupMember(callerId, groupId, userId),
    ).rejects.toThrow("User is not a member of this group");
  });

  it("should not check caller membership when caller is a system admin", async () => {
    const findUnique = jest.fn().mockResolvedValue(targetMembership);
    const db = {
      prisma: {
        group: { findUnique: jest.fn().mockResolvedValue(mockGroup) },
        userGroup: {
          findUnique,
          delete: jest.fn().mockResolvedValue(undefined),
        },
      },
      isUserSystemAdmin: jest.fn().mockResolvedValue(true),
    };
    const svc = new GroupService(db as any);
    await svc.removeGroupMember(callerId, groupId, userId);
    // findUnique should only be called once (for the target), not for the caller
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  });
});

describe("leaveGroup", () => {
  const userId = "user1";
  const groupId = "group1";
  const membership = { user_id: userId, group_id: groupId };

  it("should delete the user's UserGroup record when they are a member", async () => {
    const mockDelete = jest.fn().mockResolvedValue(undefined);
    const db = {
      prisma: {
        userGroup: {
          findUnique: jest.fn().mockResolvedValue(membership),
          delete: mockDelete,
        },
      },
    };
    const svc = new GroupService(db as any);
    await svc.leaveGroup(userId, groupId);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { user_id_group_id: { user_id: userId, group_id: groupId } },
    });
  });

  it("should throw BadRequestException when user is not a member", async () => {
    const db = {
      prisma: {
        userGroup: {
          findUnique: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
        },
      },
    };
    const svc = new GroupService(db as any);
    await expect(svc.leaveGroup(userId, groupId)).rejects.toThrow(
      "User is not a member of this group",
    );
  });
});

describe("getGroupRequests", () => {
  const callerId = "admin-1";
  const groupId = "group-1";
  const mockGroup = { id: groupId, deleted_at: null };
  const mockRequests = [
    {
      id: "req1",
      user_id: "user-1",
      group_id: groupId,
      status: "PENDING",
      actor_id: null,
      reason: null,
      resolved_at: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "req2",
      user_id: "user-2",
      group_id: groupId,
      status: "APPROVED",
      actor_id: "admin-1",
      reason: "Looks good",
      resolved_at: new Date("2026-01-02T00:00:00.000Z"),
      created_at: new Date("2026-01-01T12:00:00.000Z"),
    },
  ];

  const buildDb = ({
    group = mockGroup,
    requests = mockRequests,
    callerUserGroup = { user_id: callerId, group_id: groupId, role: "ADMIN" },
    isSystemAdmin = false,
  }: {
    group?: unknown;
    requests?: unknown[];
    callerUserGroup?: unknown;
    isSystemAdmin?: boolean;
  }) => ({
    prisma: {
      group: { findUnique: jest.fn().mockResolvedValue(group) },
      userGroup: { findUnique: jest.fn().mockResolvedValue(callerUserGroup) },
      groupMembershipRequest: {
        findMany: jest.fn().mockResolvedValue(requests),
      },
    },
    isUserSystemAdmin: jest.fn().mockResolvedValue(isSystemAdmin),
  });

  it("should return all requests for a group admin", async () => {
    const db = buildDb({});
    const svc = new GroupService(db as any);
    const result = await svc.getGroupRequests(callerId, groupId);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "req1",
      userId: "user-1",
      groupId,
      status: "PENDING",
      createdAt: mockRequests[0].created_at,
    });
    expect(result[0].actorId).toBeUndefined();
    expect(result[0].reason).toBeUndefined();
    expect(result[0].resolvedAt).toBeUndefined();
    expect(result[1]).toMatchObject({
      id: "req2",
      actorId: "admin-1",
      reason: "Looks good",
    });
  });

  it("should return all requests for a system admin without checking group membership", async () => {
    const db = buildDb({ isSystemAdmin: true });
    const svc = new GroupService(db as any);
    await svc.getGroupRequests(callerId, groupId);
    expect(db.isUserSystemAdmin).toHaveBeenCalledWith(callerId);
    expect(db.prisma.userGroup.findUnique).not.toHaveBeenCalled();
  });

  it("should pass status filter to the database query when provided", async () => {
    const db = buildDb({ requests: [mockRequests[0]] });
    const svc = new GroupService(db as any);
    await svc.getGroupRequests(callerId, groupId, "PENDING" as any);
    expect(db.prisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
      where: { group_id: groupId, status: "PENDING" },
    });
  });

  it("should not include status in the query when status is undefined", async () => {
    const db = buildDb({});
    const svc = new GroupService(db as any);
    await svc.getGroupRequests(callerId, groupId);
    expect(db.prisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
      where: { group_id: groupId },
    });
  });

  it("should throw ForbiddenException when caller is a non-admin group member", async () => {
    const db = buildDb({
      callerUserGroup: {
        user_id: callerId,
        group_id: groupId,
        role: "MEMBER",
      },
    });
    const svc = new GroupService(db as any);
    await expect(svc.getGroupRequests(callerId, groupId)).rejects.toThrow(
      "Only group admins or system admins can view membership requests",
    );
    expect(db.prisma.groupMembershipRequest.findMany).not.toHaveBeenCalled();
  });

  it("should throw ForbiddenException when caller is not a group member", async () => {
    const db = buildDb({ callerUserGroup: null });
    const svc = new GroupService(db as any);
    await expect(svc.getGroupRequests(callerId, groupId)).rejects.toThrow(
      "Only group admins or system admins can view membership requests",
    );
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const db = buildDb({ group: null });
    const svc = new GroupService(db as any);
    await expect(svc.getGroupRequests(callerId, groupId)).rejects.toThrow(
      "Group not found",
    );
  });
});
