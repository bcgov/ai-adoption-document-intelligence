import { type $Enums, GroupRole, Prisma } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import TestFactory from "@/testUtils/testFactory";
import { PrismaService } from "../database/prisma.service";
import { GroupDbService } from "./group-db.service";

const { makeIdentity } = TestFactory();

const makeGroup = (id = "g-1") => ({
  id,
  name: `Group ${id}`,
  description: "desc",
  deleted_at: null,
  deleted_by: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: "user-1",
  updated_by: "user-1",
});

const makeUserGroup = (userId = "user-1", groupId = "g-1") => ({
  user_id: userId,
  group_id: groupId,
  role: GroupRole.MEMBER,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeRequest = (id = "req-1", userId = "user-1", groupId = "g-1") => ({
  id,
  user_id: userId,
  group_id: groupId,
  status: "PENDING" as $Enums.GroupMembershipRequestStatus,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: userId,
  updated_by: userId,
  resolved_by: null,
  resolved_comment: null,
});

function makeMockPrisma() {
  return {
    group: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userGroup: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    groupMembershipRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe("GroupDbService", () => {
  let service: GroupDbService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupDbService,
        { provide: PrismaService, useValue: { prisma: mockPrisma } },
      ],
    }).compile();
    service = module.get<GroupDbService>(GroupDbService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findGroup", () => {
    it("returns a group (no tx)", async () => {
      const g = makeGroup();
      mockPrisma.group.findUnique.mockResolvedValue(g);
      expect(await service.findGroup("g-1")).toEqual(g);
    });
    it("uses tx client", async () => {
      const g = makeGroup();
      const txGroup = { findUnique: jest.fn().mockResolvedValue(g) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.findGroup
      >[1];
      expect(await service.findGroup("g-1", tx)).toEqual(g);
      expect(txGroup.findUnique).toHaveBeenCalled();
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findActiveGroup", () => {
    it("returns active group (no tx)", async () => {
      mockPrisma.group.findUnique.mockResolvedValue(makeGroup());
      await service.findActiveGroup("g-1");
      expect(mockPrisma.group.findUnique).toHaveBeenCalledWith({
        where: { id: "g-1", deleted_at: null },
      });
    });
    it("uses tx client", async () => {
      const txGroup = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.findActiveGroup
      >[1];
      await service.findActiveGroup("g-1", tx);
      expect(txGroup.findUnique).toHaveBeenCalled();
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findGroupByName", () => {
    it("returns group by name (no tx)", async () => {
      const g = makeGroup();
      mockPrisma.group.findUnique.mockResolvedValue(g);
      expect(await service.findGroupByName("G")).toEqual(g);
    });
    it("uses tx client", async () => {
      const txGroup = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.findGroupByName
      >[1];
      await service.findGroupByName("test", tx);
      expect(txGroup.findUnique).toHaveBeenCalled();
      expect(mockPrisma.group.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findActiveGroupByNameExcluding", () => {
    it("queries with exclusion (no tx)", async () => {
      const g = makeGroup();
      mockPrisma.group.findFirst.mockResolvedValue(g);
      expect(
        await service.findActiveGroupByNameExcluding("G", "other"),
      ).toEqual(g);
      expect(mockPrisma.group.findFirst).toHaveBeenCalledWith({
        where: { name: "G", id: { not: "other" }, deleted_at: null },
      });
    });
    it("uses tx client", async () => {
      const txGroup = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.findActiveGroupByNameExcluding
      >[2];
      await service.findActiveGroupByNameExcluding("G", "other", tx);
      expect(txGroup.findFirst).toHaveBeenCalled();
      expect(mockPrisma.group.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findAllGroups", () => {
    it("returns all non-deleted groups (no tx)", async () => {
      const groups = [{ id: "g-1", name: "G", description: null }];
      mockPrisma.group.findMany.mockResolvedValue(groups);
      expect(await service.findAllGroups()).toEqual(groups);
    });
    it("uses tx client", async () => {
      const txGroup = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.findAllGroups
      >[0];
      await service.findAllGroups(tx);
      expect(txGroup.findMany).toHaveBeenCalled();
      expect(mockPrisma.group.findMany).not.toHaveBeenCalled();
    });
  });

  describe("createGroup", () => {
    it("creates without description (no tx)", async () => {
      const g = { id: "g-1", name: "N", description: null };
      mockPrisma.group.create.mockResolvedValue(g);
      await service.createGroup("creator-id", "N");
      expect(mockPrisma.group.create).toHaveBeenCalledWith({
        data: { created_by: "creator-id", name: "N" },
        select: { id: true, name: true, description: true },
      });
    });
    it("creates with description", async () => {
      mockPrisma.group.create.mockResolvedValue({
        id: "g-1",
        name: "N",
        description: "d",
      });
      await service.createGroup("creator-id", "N", "d");
      expect(mockPrisma.group.create).toHaveBeenCalledWith({
        data: { created_by: "creator-id", name: "N", description: "d" },
        select: { id: true, name: true, description: true },
      });
    });
    it("uses tx client", async () => {
      const txGroup = {
        create: jest
          .fn()
          .mockResolvedValue({ id: "g-1", name: "X", description: null }),
      };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.createGroup
      >[3];
      await service.createGroup("creator-id", "X", undefined, tx);
      expect(txGroup.create).toHaveBeenCalled();
      expect(mockPrisma.group.create).not.toHaveBeenCalled();
    });
  });

  describe("updateGroupData", () => {
    it("updates group (no tx)", async () => {
      const g = { id: "g-1", name: "U", description: null };
      mockPrisma.group.update.mockResolvedValue(g);
      expect(
        await service.updateGroupData("g-1", {
          name: "U",
          description: null,
          updated_by: "u",
        }),
      ).toEqual(g);
    });
    it("uses tx client", async () => {
      const txGroup = {
        update: jest
          .fn()
          .mockResolvedValue({ id: "g-1", name: "U", description: null }),
      };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.updateGroupData
      >[2];
      await service.updateGroupData(
        "g-1",
        { name: "U", description: null, updated_by: "u" },
        tx,
      );
      expect(txGroup.update).toHaveBeenCalled();
      expect(mockPrisma.group.update).not.toHaveBeenCalled();
    });
  });

  describe("softDeleteGroup", () => {
    it("soft deletes group (no tx)", async () => {
      mockPrisma.group.update.mockResolvedValue({});
      await service.softDeleteGroup("g-1", "user-1");
      expect(mockPrisma.group.update).toHaveBeenCalledWith({
        where: { id: "g-1" },
        data: expect.objectContaining({ deleted_by: "user-1" }),
      });
    });
    it("uses tx client", async () => {
      const txGroup = { update: jest.fn().mockResolvedValue({}) };
      const tx = { group: txGroup } as unknown as Parameters<
        typeof service.softDeleteGroup
      >[2];
      await service.softDeleteGroup("g-1", "u", tx);
      expect(txGroup.update).toHaveBeenCalled();
      expect(mockPrisma.group.update).not.toHaveBeenCalled();
    });
  });

  describe("findUsersGroups", () => {
    it("returns user groups (no tx)", async () => {
      const ug = [makeUserGroup()];
      mockPrisma.userGroup.findMany.mockResolvedValue(ug);
      expect(await service.findUsersGroups("user-1")).toEqual(ug);
    });
    it("uses tx client", async () => {
      const txUG = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findUsersGroups
      >[1];
      await service.findUsersGroups("user-1", tx);
      expect(txUG.findMany).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findUserAdminMemberships", () => {
    it("returns ADMIN memberships (no tx)", async () => {
      const ug = [{ ...makeUserGroup(), role: GroupRole.ADMIN }];
      mockPrisma.userGroup.findMany.mockResolvedValue(ug);
      expect(await service.findUserAdminMemberships("user-1")).toEqual(ug);
    });
    it("uses tx client", async () => {
      const txUG = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findUserAdminMemberships
      >[1];
      await service.findUserAdminMemberships("user-1", tx);
      expect(txUG.findMany).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findUserGroupsWithGroup", () => {
    it("returns user groups with group data (no tx)", async () => {
      const records = [{ ...makeUserGroup(), group: makeGroup() }];
      mockPrisma.userGroup.findMany.mockResolvedValue(records);
      expect(await service.findUserGroupsWithGroup("user-1")).toEqual(records);
    });
    it("uses tx client", async () => {
      const txUG = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findUserGroupsWithGroup
      >[1];
      await service.findUserGroupsWithGroup("user-1", tx);
      expect(txUG.findMany).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findUserGroupsInGroups", () => {
    it("returns filtered groups (no tx)", async () => {
      const records = [{ ...makeUserGroup(), group: makeGroup() }];
      mockPrisma.userGroup.findMany.mockResolvedValue(records);
      expect(await service.findUserGroupsInGroups("user-1", ["g-1"])).toEqual(
        records,
      );
    });
    it("uses tx client", async () => {
      const txUG = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findUserGroupsInGroups
      >[2];
      await service.findUserGroupsInGroups("user-1", ["g-1"], tx);
      expect(txUG.findMany).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });
  });

  describe("isUserInGroup", () => {
    it("returns true when member (no tx)", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(makeUserGroup());
      expect(await service.isUserInGroup("user-1", "g-1")).toBe(true);
    });
    it("returns false when null", async () => {
      mockPrisma.userGroup.findUnique.mockResolvedValue(null);
      expect(await service.isUserInGroup("user-1", "g-1")).toBe(false);
    });
    it("uses tx client", async () => {
      const txUG = { findUnique: jest.fn().mockResolvedValue(makeUserGroup()) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.isUserInGroup
      >[2];
      expect(await service.isUserInGroup("user-1", "g-1", tx)).toBe(true);
      expect(txUG.findUnique).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findUserGroupMembership", () => {
    it("returns UserGroup record (no tx)", async () => {
      const ug = makeUserGroup();
      mockPrisma.userGroup.findUnique.mockResolvedValue(ug);
      expect(await service.findUserGroupMembership("user-1", "g-1")).toEqual(
        ug,
      );
    });
    it("uses tx client", async () => {
      const txUG = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findUserGroupMembership
      >[2];
      await service.findUserGroupMembership("user-1", "g-1", tx);
      expect(txUG.findUnique).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("upsertUserGroup", () => {
    it("upserts record (no tx)", async () => {
      mockPrisma.userGroup.upsert.mockResolvedValue(makeUserGroup());
      await service.upsertUserGroup("user-1", "g-1");
      expect(mockPrisma.userGroup.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id_group_id: { user_id: "user-1", group_id: "g-1" } },
        }),
      );
    });
    it("uses tx client", async () => {
      const txUG = { upsert: jest.fn().mockResolvedValue(makeUserGroup()) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.upsertUserGroup
      >[2];
      await service.upsertUserGroup("user-1", "g-1", tx);
      expect(txUG.upsert).toHaveBeenCalled();
      expect(mockPrisma.userGroup.upsert).not.toHaveBeenCalled();
    });
  });

  describe("deleteUserGroup", () => {
    it("deletes record (no tx)", async () => {
      mockPrisma.userGroup.delete.mockResolvedValue(makeUserGroup());
      await service.deleteUserGroup("user-1", "g-1");
      expect(mockPrisma.userGroup.delete).toHaveBeenCalledWith({
        where: { user_id_group_id: { user_id: "user-1", group_id: "g-1" } },
      });
    });
    it("uses tx client", async () => {
      const txUG = { delete: jest.fn().mockResolvedValue(makeUserGroup()) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.deleteUserGroup
      >[2];
      await service.deleteUserGroup("user-1", "g-1", tx);
      expect(txUG.delete).toHaveBeenCalled();
      expect(mockPrisma.userGroup.delete).not.toHaveBeenCalled();
    });
  });

  describe("findGroupMembersWithUser", () => {
    it("returns members with user data (no tx)", async () => {
      const records = [{ ...makeUserGroup(), user: { id: "user-1" } }];
      mockPrisma.userGroup.findMany.mockResolvedValue(records);
      expect(await service.findGroupMembersWithUser("g-1")).toEqual(records);
    });
    it("uses tx client", async () => {
      const txUG = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { userGroup: txUG } as unknown as Parameters<
        typeof service.findGroupMembersWithUser
      >[1];
      await service.findGroupMembersWithUser("g-1", tx);
      expect(txUG.findMany).toHaveBeenCalled();
      expect(mockPrisma.userGroup.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findMembershipRequest", () => {
    it("returns request (no tx)", async () => {
      const req = makeRequest();
      mockPrisma.groupMembershipRequest.findUnique.mockResolvedValue(req);
      expect(await service.findMembershipRequest("req-1")).toEqual(req);
    });
    it("uses tx client", async () => {
      const txReq = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { groupMembershipRequest: txReq } as unknown as Parameters<
        typeof service.findMembershipRequest
      >[1];
      await service.findMembershipRequest("req-1", tx);
      expect(txReq.findUnique).toHaveBeenCalled();
      expect(
        mockPrisma.groupMembershipRequest.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findPendingMembershipRequest", () => {
    it("returns pending request (no tx)", async () => {
      const req = makeRequest();
      mockPrisma.groupMembershipRequest.findFirst.mockResolvedValue(req);
      expect(
        await service.findPendingMembershipRequest("user-1", "g-1"),
      ).toEqual(req);
    });
    it("uses tx client", async () => {
      const txReq = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { groupMembershipRequest: txReq } as unknown as Parameters<
        typeof service.findPendingMembershipRequest
      >[2];
      await service.findPendingMembershipRequest("user-1", "g-1", tx);
      expect(txReq.findFirst).toHaveBeenCalled();
      expect(
        mockPrisma.groupMembershipRequest.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe("createMembershipRequest", () => {
    it("creates PENDING request (no tx)", async () => {
      const req = makeRequest();
      const identity = makeIdentity();
      mockPrisma.groupMembershipRequest.create.mockResolvedValue(req);
      expect(
        await service.createMembershipRequest("user-1", "g-1", identity),
      ).toEqual(req);
      expect(mockPrisma.groupMembershipRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: "PENDING" }),
      });
    });
    it("uses tx client", async () => {
      const txReq = { create: jest.fn().mockResolvedValue(makeRequest()) };
      const tx = {
        groupMembershipRequest: txReq,
      } as unknown as Prisma.TransactionClient;
      await service.createMembershipRequest(
        "user-1",
        "g-1",
        makeIdentity(),
        tx,
      );
      expect(txReq.create).toHaveBeenCalled();
      expect(mockPrisma.groupMembershipRequest.create).not.toHaveBeenCalled();
    });
  });

  describe("updateMembershipRequest", () => {
    it("updates request (no tx)", async () => {
      mockPrisma.groupMembershipRequest.update.mockResolvedValue(makeRequest());
      await service.updateMembershipRequest("req-1", {
        status: "APPROVED" as $Enums.GroupMembershipRequestStatus,
      });
      expect(mockPrisma.groupMembershipRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { status: "APPROVED" },
      });
    });
    it("uses tx client", async () => {
      const txReq = { update: jest.fn().mockResolvedValue(makeRequest()) };
      const tx = { groupMembershipRequest: txReq } as unknown as Parameters<
        typeof service.updateMembershipRequest
      >[2];
      await service.updateMembershipRequest("req-1", {}, tx);
      expect(txReq.update).toHaveBeenCalled();
      expect(mockPrisma.groupMembershipRequest.update).not.toHaveBeenCalled();
    });
  });

  describe("approveRequestTransaction", () => {
    it("uses $transaction when no tx", async () => {
      mockPrisma.$transaction.mockResolvedValue(undefined);
      mockPrisma.userGroup.upsert.mockReturnValue("upsert");
      mockPrisma.groupMembershipRequest.update.mockReturnValue("update");
      await service.approveRequestTransaction("user-1", "g-1", "req-1", {
        status: "APPROVED" as $Enums.GroupMembershipRequestStatus,
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
    it("uses tx client directly", async () => {
      const txUG = { upsert: jest.fn().mockResolvedValue(undefined) };
      const txReq = { update: jest.fn().mockResolvedValue(undefined) };
      const tx = {
        userGroup: txUG,
        groupMembershipRequest: txReq,
      } as unknown as Parameters<typeof service.approveRequestTransaction>[4];
      await service.approveRequestTransaction("user-1", "g-1", "req-1", {}, tx);
      expect(txUG.upsert).toHaveBeenCalled();
      expect(txReq.update).toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("findGroupMembershipRequests", () => {
    it("returns all requests without status filter (no tx)", async () => {
      const reqs = [makeRequest()];
      mockPrisma.groupMembershipRequest.findMany.mockResolvedValue(reqs);
      expect(await service.findGroupMembershipRequests("g-1")).toEqual(reqs);
      expect(mockPrisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
        where: { group_id: "g-1" },
        include: { user: true },
      });
    });
    it("applies status filter when provided", async () => {
      mockPrisma.groupMembershipRequest.findMany.mockResolvedValue([]);
      await service.findGroupMembershipRequests(
        "g-1",
        "PENDING" as $Enums.GroupMembershipRequestStatus,
      );
      expect(mockPrisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
        where: { group_id: "g-1", status: "PENDING" },
        include: { user: true },
      });
    });
    it("uses tx client", async () => {
      const txReq = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { groupMembershipRequest: txReq } as unknown as Parameters<
        typeof service.findGroupMembershipRequests
      >[2];
      await service.findGroupMembershipRequests("g-1", undefined, tx);
      expect(txReq.findMany).toHaveBeenCalled();
      expect(mockPrisma.groupMembershipRequest.findMany).not.toHaveBeenCalled();
    });
  });

  describe("findUserMembershipRequests", () => {
    it("returns all requests without status filter (no tx)", async () => {
      const reqs = [makeRequest()];
      mockPrisma.groupMembershipRequest.findMany.mockResolvedValue(reqs);
      expect(await service.findUserMembershipRequests("user-1")).toEqual(reqs);
      expect(mockPrisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
        where: { user_id: "user-1" },
        include: { group: { select: { name: true } } },
      });
    });
    it("applies status filter when provided", async () => {
      mockPrisma.groupMembershipRequest.findMany.mockResolvedValue([]);
      await service.findUserMembershipRequests(
        "user-1",
        "PENDING" as $Enums.GroupMembershipRequestStatus,
      );
      expect(mockPrisma.groupMembershipRequest.findMany).toHaveBeenCalledWith({
        where: { user_id: "user-1", status: "PENDING" },
        include: { group: { select: { name: true } } },
      });
    });
    it("uses tx client", async () => {
      const txReq = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { groupMembershipRequest: txReq } as unknown as Parameters<
        typeof service.findUserMembershipRequests
      >[2];
      await service.findUserMembershipRequests("user-1", undefined, tx);
      expect(txReq.findMany).toHaveBeenCalled();
      expect(mockPrisma.groupMembershipRequest.findMany).not.toHaveBeenCalled();
    });
  });
});
