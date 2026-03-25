import { GroupRole } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { ResolvedIdentity } from "@/auth/types";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { AuditService } from "../audit/audit.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { GroupService } from "./group.service";
import { GroupDbService } from "./group-db.service";

const mockAuditService = {
  recordEvent: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;

const stubGroupDbService: GroupDbService = {
  findGroup: jest.fn().mockResolvedValue(null),
  findActiveGroup: jest.fn().mockResolvedValue(null),
  findGroupByName: jest.fn().mockResolvedValue(null),
  findActiveGroupByNameExcluding: jest.fn().mockResolvedValue(null),
  findAllGroups: jest.fn().mockResolvedValue([]),
  createGroup: jest
    .fn()
    .mockResolvedValue({ id: "g1", name: "Group", description: null }),
  updateGroupData: jest
    .fn()
    .mockResolvedValue({ id: "g1", name: "Group", description: null }),
  softDeleteGroup: jest.fn().mockResolvedValue(undefined),
  findUsersGroups: jest.fn().mockResolvedValue([]),
  findUserAdminMemberships: jest.fn().mockResolvedValue([]),
  findUserGroupsWithGroup: jest.fn().mockResolvedValue([]),
  findUserGroupsInGroups: jest.fn().mockResolvedValue([]),
  isUserInGroup: jest.fn().mockResolvedValue(false),
  findUserGroupMembership: jest.fn().mockResolvedValue(null),
  upsertUserGroup: jest.fn().mockResolvedValue(undefined),
  deleteUserGroup: jest.fn().mockResolvedValue(undefined),
  findGroupMembersWithUser: jest.fn().mockResolvedValue([]),
  isUserSystemAdmin: jest.fn().mockResolvedValue(false),
  findMembershipRequest: jest.fn().mockResolvedValue(null),
  findPendingMembershipRequest: jest.fn().mockResolvedValue(null),
  createMembershipRequest: jest.fn().mockResolvedValue({ id: "req-1" }),
  updateMembershipRequest: jest.fn().mockResolvedValue(undefined),
  approveRequestTransaction: jest.fn().mockResolvedValue(undefined),
  findGroupMembershipRequests: jest.fn().mockResolvedValue([]),
  findUserMembershipRequests: jest.fn().mockResolvedValue([]),
} as unknown as GroupDbService;

function makeGroupDb(
  overrides: Partial<Record<keyof GroupDbService, jest.Mock>> = {},
): GroupDbService {
  return { ...stubGroupDbService, ...overrides } as unknown as GroupDbService;
}

// ---------------------------------------------------------------------------
// Module test
// ---------------------------------------------------------------------------

describe("GroupService", () => {
  let service: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: GroupDbService, useValue: stubGroupDbService },
        { provide: AppLoggerService, useValue: mockAppLogger },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deleteGroup
// ---------------------------------------------------------------------------

describe("deleteGroup", () => {
  it("should soft-delete a group by ID", async () => {
    const findGroup = jest
      .fn()
      .mockResolvedValue({ id: "g1", name: "Test Group" });
    const softDeleteGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({ findGroup, softDeleteGroup });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await service.deleteGroup("g1", "admin-user");
    expect(findGroup).toHaveBeenCalledWith("g1");
    expect(softDeleteGroup).toHaveBeenCalledWith("g1", "admin-user");
  });

  it("should set deleted_at on soft-delete", async () => {
    const softDeleteGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue({ id: "g1", name: "Test Group" }),
      softDeleteGroup,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await service.deleteGroup("g1", "admin-user");
    expect(softDeleteGroup).toHaveBeenCalledWith("g1", "admin-user");
  });

  it("should throw NotFoundException if group not found", async () => {
    const softDeleteGroup = jest.fn();
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(null),
      softDeleteGroup,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(service.deleteGroup("g1", "admin-user")).rejects.toThrow(
      "Group not found",
    );
    expect(softDeleteGroup).not.toHaveBeenCalled();
  });

  it("should not cascade-delete associated records", async () => {
    const softDeleteGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue({ id: "g1", name: "Test Group" }),
      softDeleteGroup,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await service.deleteGroup("g1", "admin-user");
    expect(softDeleteGroup).toHaveBeenCalledWith("g1", "admin-user");
  });
});

// ---------------------------------------------------------------------------
// getAllGroups
// ---------------------------------------------------------------------------

describe("getAllGroups", () => {
  it("should return all non-deleted groups", async () => {
    const mockGroups = [
      { id: "g1", name: "Group 1", description: null },
      { id: "g2", name: "Group 2", description: null },
    ];
    const findAllGroups = jest.fn().mockResolvedValue(mockGroups);
    const groupDb = makeGroupDb({ findAllGroups });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getAllGroups();
    expect(result).toEqual(mockGroups);
    expect(findAllGroups).toHaveBeenCalled();
  });

  it("should exclude soft-deleted groups", async () => {
    const activeGroup = { id: "g1", name: "Active Group", description: null };
    const findAllGroups = jest.fn().mockResolvedValue([activeGroup]);
    const groupDb = makeGroupDb({ findAllGroups });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getAllGroups();
    expect(result).toEqual([activeGroup]);
  });
});

// ---------------------------------------------------------------------------
// getUserGroups
// ---------------------------------------------------------------------------

describe("getUserGroups", () => {
  it("should return non-deleted user group memberships when caller is the same user", async () => {
    const mockUserGroups = [
      { group: { id: "g1", name: "Group 1" }, role: "ADMIN" },
      { group: { id: "g2", name: "Group 2" }, role: "MEMBER" },
    ];
    const findUserGroupsWithGroup = jest.fn().mockResolvedValue(mockUserGroups);
    const groupDb = makeGroupDb({ findUserGroupsWithGroup });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getUserGroups({ userId: "user1" }, "user1");
    expect(result).toEqual([
      { id: "g1", name: "Group 1", role: "ADMIN" },
      { id: "g2", name: "Group 2", role: "MEMBER" },
    ]);
    expect(findUserGroupsWithGroup).toHaveBeenCalledWith("user1");
  });

  it("should exclude soft-deleted groups from user group memberships", async () => {
    const activeUserGroup = {
      group: { id: "g1", name: "Active Group" },
      role: "MEMBER",
    };
    const findUserGroupsWithGroup = jest
      .fn()
      .mockResolvedValue([activeUserGroup]);
    const groupDb = makeGroupDb({ findUserGroupsWithGroup });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getUserGroups({ userId: "user1" }, "user1");
    expect(result).toEqual([
      { id: "g1", name: "Active Group", role: "MEMBER" },
    ]);
  });

  it("should return all groups for target user when caller is a system admin", async () => {
    const targetUserGroups = [
      { group: { id: "g1", name: "Group 1" }, role: "MEMBER" },
    ];
    const findUserGroupsWithGroup = jest
      .fn()
      .mockResolvedValue(targetUserGroups);
    const groupDb = makeGroupDb({ findUserGroupsWithGroup });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getUserGroups(
      { userId: "admin1", isSystemAdmin: true },
      "user1",
    );
    expect(result).toEqual([{ id: "g1", name: "Group 1", role: "MEMBER" }]);
    expect(findUserGroupsWithGroup).toHaveBeenCalledWith("user1");
  });

  it("should return only shared groups when caller is a group admin but not a system admin", async () => {
    const callerAdminMemberships = [{ group_id: "g1" }, { group_id: "g3" }];
    const sharedUserGroups = [
      { group: { id: "g1", name: "Group 1" }, role: "MEMBER" },
    ];
    const findUserAdminMemberships = jest
      .fn()
      .mockResolvedValue(callerAdminMemberships);
    const findUserGroupsInGroups = jest
      .fn()
      .mockResolvedValue(sharedUserGroups);
    const groupDb = makeGroupDb({
      findUserAdminMemberships,
      findUserGroupsInGroups,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.getUserGroups({ userId: "admin1" }, "user1");
    expect(result).toEqual([{ id: "g1", name: "Group 1", role: "MEMBER" }]);
    expect(findUserAdminMemberships).toHaveBeenCalledWith("admin1");
    expect(findUserGroupsInGroups).toHaveBeenCalledWith("user1", ["g1", "g3"]);
  });

  it("should throw ForbiddenException when caller is a regular member querying another user", async () => {
    const findUserAdminMemberships = jest.fn().mockResolvedValue([]);
    const groupDb = makeGroupDb({ findUserAdminMemberships });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      service.getUserGroups({ userId: "caller1" }, "user1"),
    ).rejects.toThrow(
      "You do not have permission to view another user's group memberships",
    );
  });
});

// ---------------------------------------------------------------------------
// requestMembership
// ---------------------------------------------------------------------------

describe("requestMembership", () => {
  const userId = "user1";
  const groupId = "group1";
  const mockGroup = { id: groupId };

  it("should create a PENDING request when user is not a member and has no pending request", async () => {
    const createMembershipRequest = jest
      .fn()
      .mockResolvedValue({ id: "req-1", user_id: userId, group_id: groupId });
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership: jest.fn().mockResolvedValue(null),
      findPendingMembershipRequest: jest.fn().mockResolvedValue(null),
      createMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.requestMembership(userId, groupId);
    expect(createMembershipRequest).toHaveBeenCalledWith(userId, groupId);
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
      "Group not found",
    );
  });

  it("should throw when user is already a member", async () => {
    const createMembershipRequest = jest.fn();
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership: jest
        .fn()
        .mockResolvedValue({ user_id: userId, group_id: groupId }),
      createMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
      "User is already a member of this group",
    );
    expect(createMembershipRequest).not.toHaveBeenCalled();
  });

  it("should throw when user already has a PENDING request", async () => {
    const createMembershipRequest = jest.fn();
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership: jest.fn().mockResolvedValue(null),
      findPendingMembershipRequest: jest
        .fn()
        .mockResolvedValue({ id: "req1", status: "PENDING" }),
      createMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(svc.requestMembership(userId, groupId)).rejects.toThrow(
      "A pending membership request already exists for this group",
    );
    expect(createMembershipRequest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createGroup
// ---------------------------------------------------------------------------

describe("createGroup", () => {
  const callerId = "admin-user";

  it("should create a new group", async () => {
    const mockGroup = { id: "g1", name: "Test Group", description: null };
    const findGroupByName = jest.fn().mockResolvedValue(null);
    const createGroup = jest.fn().mockResolvedValue(mockGroup);
    const groupDb = makeGroupDb({ findGroupByName, createGroup });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.createGroup(callerId, "Test Group");
    expect(result).toEqual(mockGroup);
    expect(findGroupByName).toHaveBeenCalledWith("Test Group");
    expect(createGroup).toHaveBeenCalledWith("Test Group", undefined);
  });

  it("should include description when provided", async () => {
    const mockGroup = {
      id: "g1",
      name: "Test Group",
      description: "A test group",
    };
    const createGroup = jest.fn().mockResolvedValue(mockGroup);
    const groupDb = makeGroupDb({
      findGroupByName: jest.fn().mockResolvedValue(null),
      createGroup,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.createGroup(
      callerId,
      "Test Group",
      "A test group",
    );
    expect(result).toEqual(mockGroup);
    expect(createGroup).toHaveBeenCalledWith("Test Group", "A test group");
  });

  it("should throw ConflictException if group name already exists", async () => {
    const createGroup = jest.fn();
    const groupDb = makeGroupDb({
      findGroupByName: jest
        .fn()
        .mockResolvedValue({ id: "g1", name: "Test Group" }),
      createGroup,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(service.createGroup(callerId, "Test Group")).rejects.toThrow(
      "Group with this name already exists",
    );
    expect(createGroup).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// assignUserToGroup
// ---------------------------------------------------------------------------

describe("assignUserToGroup", () => {
  const userId = "user-1";
  const groupId = "group-1";
  const mockGroup = { id: groupId };

  it("should upsert the user-group mapping", async () => {
    const upsertUserGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      upsertUserGroup,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.assignUserToGroup(userId, groupId, {
      userId: "caller-id",
    } as ResolvedIdentity);
    expect(upsertUserGroup).toHaveBeenCalledWith(userId, groupId);
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.assignUserToGroup(userId, groupId, {
        userId: "caller-id",
      } as ResolvedIdentity),
    ).rejects.toThrow("Group not found");
  });
});

// ---------------------------------------------------------------------------
// cancelMembershipRequest
// ---------------------------------------------------------------------------

describe("cancelMembershipRequest", () => {
  const userId = "user1";
  const requestId = "req1";
  const pendingRequest = {
    id: requestId,
    user_id: userId,
    group_id: "group1",
    status: "PENDING",
  };

  it("should update the request to CANCELLED with actor, resolved_at, and updated_by", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.cancelMembershipRequest(userId, requestId);
    expect(updateMembershipRequest).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({
        status: "CANCELLED",
        actor_id: userId,
        updated_by: userId,
        resolved_at: expect.any(Date),
      }),
    );
  });

  it("should store reason when provided", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.cancelMembershipRequest(userId, requestId, "No longer needed");
    expect(updateMembershipRequest).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({ reason: "No longer needed" }),
    );
  });

  it("should not include reason key when not provided", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.cancelMembershipRequest(userId, requestId);
    const callData = updateMembershipRequest.mock.calls[0][1];
    expect(callData).not.toHaveProperty("reason");
  });

  it("should throw NotFoundException when request does not exist", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.cancelMembershipRequest(userId, requestId),
    ).rejects.toThrow("Membership request not found");
  });

  it("should throw ForbiddenException when request belongs to a different user", async () => {
    const otherUserRequest = { ...pendingRequest, user_id: "other-user" };
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(otherUserRequest),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.cancelMembershipRequest(userId, requestId),
    ).rejects.toThrow("Cannot cancel a request belonging to another user");
  });

  it("should throw BadRequestException when request is not PENDING", async () => {
    for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
      const resolvedRequest = { ...pendingRequest, status };
      const groupDb = makeGroupDb({
        findMembershipRequest: jest.fn().mockResolvedValue(resolvedRequest),
      });
      const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
      await expect(
        svc.cancelMembershipRequest(userId, requestId),
      ).rejects.toThrow("Only PENDING requests can be cancelled");
    }
  });
});

// ---------------------------------------------------------------------------
// approveMembershipRequest
// ---------------------------------------------------------------------------

describe("approveMembershipRequest", () => {
  const adminId = "admin1";
  const requestId = "req1";
  const pendingRequest = {
    id: requestId,
    user_id: "user1",
    group_id: "group1",
    status: "PENDING",
  };

  const adminIdentity: ResolvedIdentity = {
    userId: adminId,
    isSystemAdmin: false,
    groupRoles: { [pendingRequest.group_id]: GroupRole.ADMIN },
  };

  const systemAdminIdentity: ResolvedIdentity = {
    userId: adminId,
    isSystemAdmin: true,
    groupRoles: {},
  };

  it("should call approveRequestTransaction with correct args", async () => {
    const approveRequestTransaction = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      approveRequestTransaction,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.approveMembershipRequest(adminIdentity, requestId);
    expect(approveRequestTransaction).toHaveBeenCalledWith(
      pendingRequest.user_id,
      pendingRequest.group_id,
      requestId,
      expect.objectContaining({
        status: "APPROVED",
        actor_id: adminId,
        updated_by: adminId,
        resolved_at: expect.any(Date),
      }),
    );
  });

  it("should store reason when provided", async () => {
    const approveRequestTransaction = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      approveRequestTransaction,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.approveMembershipRequest(adminIdentity, requestId, "Looks good");
    expect(approveRequestTransaction).toHaveBeenCalledWith(
      pendingRequest.user_id,
      pendingRequest.group_id,
      requestId,
      expect.objectContaining({ reason: "Looks good" }),
    );
  });

  it("should not include reason key when reason is not provided", async () => {
    const approveRequestTransaction = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      approveRequestTransaction,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.approveMembershipRequest(adminIdentity, requestId);
    const callData = approveRequestTransaction.mock.calls[0][3];
    expect(callData).not.toHaveProperty("reason");
  });

  it("should throw NotFoundException when request does not exist", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.approveMembershipRequest(adminIdentity, requestId),
    ).rejects.toThrow("Membership request not found");
  });

  it("should throw BadRequestException when request is not PENDING", async () => {
    for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
      const resolvedRequest = { ...pendingRequest, status };
      const groupDb = makeGroupDb({
        findMembershipRequest: jest.fn().mockResolvedValue(resolvedRequest),
      });
      const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
      await expect(
        svc.approveMembershipRequest(adminIdentity, requestId),
      ).rejects.toThrow("Only PENDING requests can be approved");
    }
  });

  it("should succeed when caller is a group admin", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      approveRequestTransaction: jest.fn().mockResolvedValue(undefined),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.approveMembershipRequest(adminIdentity, requestId),
    ).resolves.toBeUndefined();
  });

  it("should succeed when caller is a system admin", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      approveRequestTransaction: jest.fn().mockResolvedValue(undefined),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.approveMembershipRequest(systemAdminIdentity, requestId),
    ).resolves.toBeUndefined();
  });

  it("should throw ForbiddenException when caller is a regular group member", async () => {
    const memberIdentity: ResolvedIdentity = {
      userId: adminId,
      isSystemAdmin: false,
      groupRoles: { [pendingRequest.group_id]: GroupRole.MEMBER },
    };
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.approveMembershipRequest(memberIdentity, requestId),
    ).rejects.toThrow("Insufficient role within the group");
  });

  it("should throw ForbiddenException when caller has no role in the request group", async () => {
    const differentGroupIdentity: ResolvedIdentity = {
      userId: adminId,
      isSystemAdmin: false,
      groupRoles: {},
    };
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.approveMembershipRequest(differentGroupIdentity, requestId),
    ).rejects.toThrow("User does not belong to requested group.");
  });
});

// ---------------------------------------------------------------------------
// denyMembershipRequest
// ---------------------------------------------------------------------------

describe("denyMembershipRequest", () => {
  const adminId = "admin1";
  const requestId = "req1";
  const pendingRequest = {
    id: requestId,
    user_id: "user1",
    group_id: "group1",
    status: "PENDING",
  };

  const adminIdentity: ResolvedIdentity = {
    userId: adminId,
    isSystemAdmin: false,
    groupRoles: { [pendingRequest.group_id]: GroupRole.ADMIN },
  };

  const systemAdminIdentity: ResolvedIdentity = {
    userId: adminId,
    isSystemAdmin: true,
    groupRoles: {},
  };

  it("should update the request to DENIED with actor_id, resolved_at, and updated_by", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.denyMembershipRequest(adminIdentity, requestId);
    expect(updateMembershipRequest).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({
        status: "DENIED",
        actor_id: adminId,
        updated_by: adminId,
        resolved_at: expect.any(Date),
      }),
    );
  });

  it("should store reason when provided", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.denyMembershipRequest(adminIdentity, requestId, "Not eligible");
    expect(updateMembershipRequest).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({ reason: "Not eligible" }),
    );
  });

  it("should not include reason key when reason is not provided", async () => {
    const updateMembershipRequest = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.denyMembershipRequest(adminIdentity, requestId);
    const callData = updateMembershipRequest.mock.calls[0][1];
    expect(callData).not.toHaveProperty("reason");
  });

  it("should throw NotFoundException when request does not exist", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.denyMembershipRequest(adminIdentity, requestId),
    ).rejects.toThrow("Membership request not found");
  });

  it("should throw BadRequestException when request is not PENDING", async () => {
    for (const status of ["APPROVED", "DENIED", "CANCELLED"] as const) {
      const resolvedRequest = { ...pendingRequest, status };
      const groupDb = makeGroupDb({
        findMembershipRequest: jest.fn().mockResolvedValue(resolvedRequest),
      });
      const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
      await expect(
        svc.denyMembershipRequest(adminIdentity, requestId),
      ).rejects.toThrow("Only PENDING requests can be denied");
    }
  });

  it("should succeed when caller is a group admin", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest: jest.fn().mockResolvedValue(undefined),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.denyMembershipRequest(adminIdentity, requestId),
    ).resolves.toBeUndefined();
  });

  it("should succeed when caller is a system admin", async () => {
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
      updateMembershipRequest: jest.fn().mockResolvedValue(undefined),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.denyMembershipRequest(systemAdminIdentity, requestId),
    ).resolves.toBeUndefined();
  });

  it("should throw ForbiddenException when caller is a regular group member", async () => {
    const memberIdentity: ResolvedIdentity = {
      userId: adminId,
      isSystemAdmin: false,
      groupRoles: { [pendingRequest.group_id]: GroupRole.MEMBER },
    };
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.denyMembershipRequest(memberIdentity, requestId),
    ).rejects.toThrow("Insufficient role within the group");
  });

  it("should throw ForbiddenException when caller has no role in the request group", async () => {
    const differentGroupIdentity: ResolvedIdentity = {
      userId: adminId,
      isSystemAdmin: false,
      groupRoles: {},
    };
    const groupDb = makeGroupDb({
      findMembershipRequest: jest.fn().mockResolvedValue(pendingRequest),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.denyMembershipRequest(differentGroupIdentity, requestId),
    ).rejects.toThrow("User does not belong to requested group.");
  });
});

// ---------------------------------------------------------------------------
// getGroupMembers
// ---------------------------------------------------------------------------

describe("getGroupMembers", () => {
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

  it("should return members for a group", async () => {
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(mockGroup),
      findGroupMembersWithUser: jest.fn().mockResolvedValue(mockMembers),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await svc.getGroupMembers(groupId);
    expect(result).toEqual([
      { userId: "user-1", email: "user1@example.com", joinedAt },
      { userId: "user-2", email: "user2@example.com", joinedAt },
    ]);
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(svc.getGroupMembers(groupId)).rejects.toThrow(
      "Group not found",
    );
  });
});

// ---------------------------------------------------------------------------
// removeGroupMember
// ---------------------------------------------------------------------------

describe("removeGroupMember", () => {
  const groupId = "group-1";
  const userId = "user-1";
  const mockGroup = { id: groupId };
  const targetMembership = {
    user_id: userId,
    group_id: groupId,
    role: "MEMBER",
  };

  it("should remove the target user from the group", async () => {
    const deleteUserGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership: jest.fn().mockResolvedValue(targetMembership),
      deleteUserGroup,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.removeGroupMember(groupId, userId, {
      userId: "caller-id",
    } as ResolvedIdentity);
    expect(deleteUserGroup).toHaveBeenCalledWith(userId, groupId);
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.removeGroupMember(groupId, userId, {
        userId: "caller-id",
      } as ResolvedIdentity),
    ).rejects.toThrow("Group not found");
  });

  it("should throw NotFoundException when target user is not a member", async () => {
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      svc.removeGroupMember(groupId, userId, {
        userId: "caller-id",
      } as ResolvedIdentity),
    ).rejects.toThrow("User is not a member of this group");
  });

  it("should only look up the target user membership", async () => {
    const findUserGroupMembership = jest
      .fn()
      .mockResolvedValue(targetMembership);
    const groupDb = makeGroupDb({
      findGroup: jest.fn().mockResolvedValue(mockGroup),
      findUserGroupMembership,
      deleteUserGroup: jest.fn().mockResolvedValue(undefined),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.removeGroupMember(groupId, userId, {
      userId: "caller-id",
    } as ResolvedIdentity);
    expect(findUserGroupMembership).toHaveBeenCalledTimes(1);
    expect(findUserGroupMembership).toHaveBeenCalledWith(userId, groupId);
  });
});

// ---------------------------------------------------------------------------
// leaveGroup
// ---------------------------------------------------------------------------

describe("leaveGroup", () => {
  it("should delete the user's UserGroup record", async () => {
    const deleteUserGroup = jest.fn().mockResolvedValue(undefined);
    const groupDb = makeGroupDb({ deleteUserGroup });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.leaveGroup("user1", "group1");
    expect(deleteUserGroup).toHaveBeenCalledWith("user1", "group1");
  });
});

// ---------------------------------------------------------------------------
// getGroupRequests
// ---------------------------------------------------------------------------

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
      user: { email: "user1@example.com" },
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
      user: { email: "user2@example.com" },
    },
  ];

  it("should return all requests for a group", async () => {
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(mockGroup),
      findGroupMembershipRequests: jest.fn().mockResolvedValue(mockRequests),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await svc.getGroupRequests(callerId, groupId);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "req1",
      userId: "user-1",
      email: "user1@example.com",
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

  it("should pass status filter to the query when provided", async () => {
    const findGroupMembershipRequests = jest
      .fn()
      .mockResolvedValue([mockRequests[0]]);
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(mockGroup),
      findGroupMembershipRequests,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.getGroupRequests(callerId, groupId, "PENDING" as any);
    expect(findGroupMembershipRequests).toHaveBeenCalledWith(
      groupId,
      "PENDING",
    );
  });

  it("should pass undefined status when not provided", async () => {
    const findGroupMembershipRequests = jest
      .fn()
      .mockResolvedValue(mockRequests);
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(mockGroup),
      findGroupMembershipRequests,
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.getGroupRequests(callerId, groupId);
    expect(findGroupMembershipRequests).toHaveBeenCalledWith(
      groupId,
      undefined,
    );
  });

  it("should throw NotFoundException when group does not exist", async () => {
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(null),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(svc.getGroupRequests(callerId, groupId)).rejects.toThrow(
      "Group not found",
    );
  });
});

// ---------------------------------------------------------------------------
// getMyRequests
// ---------------------------------------------------------------------------

describe("getMyRequests", () => {
  const userId = "user-1";
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const mockRequests = [
    {
      id: "req1",
      user_id: userId,
      group_id: "group-1",
      status: "PENDING",
      reason: null,
      created_at: createdAt,
      group: { name: "Group One" },
    },
    {
      id: "req2",
      user_id: userId,
      group_id: "group-2",
      status: "APPROVED",
      reason: "Looks good",
      created_at: createdAt,
      group: { name: "Group Two" },
    },
  ];

  it("should return all requests for the user with groupName included", async () => {
    const groupDb = makeGroupDb({
      findUserMembershipRequests: jest.fn().mockResolvedValue(mockRequests),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await svc.getMyRequests(userId);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "req1",
      groupId: "group-1",
      groupName: "Group One",
      status: "PENDING",
      reason: undefined,
      createdAt,
    });
    expect(result[1]).toMatchObject({
      id: "req2",
      groupId: "group-2",
      groupName: "Group Two",
      status: "APPROVED",
      reason: "Looks good",
    });
  });

  it("should return an empty array when the user has no requests", async () => {
    const groupDb = makeGroupDb({
      findUserMembershipRequests: jest.fn().mockResolvedValue([]),
    });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await svc.getMyRequests(userId);
    expect(result).toEqual([]);
  });

  it("should pass status filter when provided", async () => {
    const findUserMembershipRequests = jest
      .fn()
      .mockResolvedValue([mockRequests[0]]);
    const groupDb = makeGroupDb({ findUserMembershipRequests });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.getMyRequests(userId, "PENDING" as any);
    expect(findUserMembershipRequests).toHaveBeenCalledWith(userId, "PENDING");
  });

  it("should pass undefined status when not provided", async () => {
    const findUserMembershipRequests = jest
      .fn()
      .mockResolvedValue(mockRequests);
    const groupDb = makeGroupDb({ findUserMembershipRequests });
    const svc = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await svc.getMyRequests(userId);
    expect(findUserMembershipRequests).toHaveBeenCalledWith(userId, undefined);
  });
});

// ---------------------------------------------------------------------------
// updateGroup
// ---------------------------------------------------------------------------

describe("updateGroup", () => {
  const callerId = "admin-user";
  const groupId = "group-1";

  it("should update the group name", async () => {
    const mockUpdated = { id: groupId, name: "New Name", description: null };
    const findActiveGroup = jest
      .fn()
      .mockResolvedValue({ id: groupId, name: "Old Name", deleted_at: null });
    const findActiveGroupByNameExcluding = jest.fn().mockResolvedValue(null);
    const updateGroupData = jest.fn().mockResolvedValue(mockUpdated);
    const groupDb = makeGroupDb({
      findActiveGroup,
      findActiveGroupByNameExcluding,
      updateGroupData,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.updateGroup(callerId, groupId, "New Name");
    expect(result).toEqual(mockUpdated);
    expect(findActiveGroup).toHaveBeenCalledWith(groupId);
    expect(updateGroupData).toHaveBeenCalledWith(groupId, {
      name: "New Name",
      description: null,
      updated_by: callerId,
    });
  });

  it("should include description when provided", async () => {
    const mockUpdated = {
      id: groupId,
      name: "New Name",
      description: "A description",
    };
    const updateGroupData = jest.fn().mockResolvedValue(mockUpdated);
    const groupDb = makeGroupDb({
      findActiveGroup: jest
        .fn()
        .mockResolvedValue({ id: groupId, name: "Old Name", deleted_at: null }),
      findActiveGroupByNameExcluding: jest.fn().mockResolvedValue(null),
      updateGroupData,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    const result = await service.updateGroup(
      callerId,
      groupId,
      "New Name",
      "A description",
    );
    expect(result).toEqual(mockUpdated);
    expect(updateGroupData).toHaveBeenCalledWith(groupId, {
      name: "New Name",
      description: "A description",
      updated_by: callerId,
    });
  });

  it("should throw NotFoundException if group does not exist", async () => {
    const updateGroupData = jest.fn();
    const groupDb = makeGroupDb({
      findActiveGroup: jest.fn().mockResolvedValue(null),
      updateGroupData,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      service.updateGroup(callerId, groupId, "New Name"),
    ).rejects.toThrow("Group not found");
    expect(updateGroupData).not.toHaveBeenCalled();
  });

  it("should throw ConflictException if another group already uses the new name", async () => {
    const updateGroupData = jest.fn();
    const groupDb = makeGroupDb({
      findActiveGroup: jest
        .fn()
        .mockResolvedValue({ id: groupId, name: "Old Name", deleted_at: null }),
      findActiveGroupByNameExcluding: jest
        .fn()
        .mockResolvedValue({ id: "other-group", name: "New Name" }),
      updateGroupData,
    });
    const service = new GroupService(mockAppLogger, mockAuditService, groupDb);
    await expect(
      service.updateGroup(callerId, groupId, "New Name"),
    ).rejects.toThrow("Group with this name already exists");
    expect(updateGroupData).not.toHaveBeenCalled();
  });
});
