import { HttpException, HttpStatus } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { GroupMemberDto } from "./dto/group-member.dto";
import { GroupMembershipRequestDto } from "./dto/group-membership-request.dto";
import { MyMembershipRequestDto } from "./dto/my-membership-request.dto";
import { RequestMembershipDto } from "./dto/request-membership.dto";
import { UserGroupDto } from "./dto/user-group.dto";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";

describe("GroupController", () => {
  let controller: GroupController;
  let service: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        {
          provide: GroupService,
          useValue: {
            assignUserToGroup: jest.fn(),
            requestMembership: jest.fn(),
            cancelMembershipRequest: jest.fn(),
            approveMembershipRequest: jest.fn(),
            denyMembershipRequest: jest.fn(),
            createGroup: jest.fn(),
            updateGroup: jest.fn(),
            deleteGroup: jest.fn(),
            getUserGroups: jest.fn(),
            getGroupMembers: jest.fn(),
            getGroupRequests: jest.fn(),
            getMyRequests: jest.fn(),
            removeGroupMember: jest.fn(),
            leaveGroup: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
    service = module.get<GroupService>(GroupService);
  });

  describe("getUserGroups", () => {
    it("should call service with callerId from resolvedIdentity and userId from param", async () => {
      const callerId = "caller-id";
      const userId = "user1";
      const mockGroups: UserGroupDto[] = [
        { id: "g1", name: "Group 1", role: "MEMBER" },
      ];
      jest.spyOn(service, "getUserGroups").mockResolvedValueOnce(mockGroups);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      const result = await controller.getUserGroups(req, userId);
      expect(service.getUserGroups).toHaveBeenCalledWith(callerId, userId);
      expect(result).toEqual(mockGroups);
    });

    it("should propagate ForbiddenException from the service", async () => {
      jest
        .spyOn(service, "getUserGroups")
        .mockRejectedValueOnce(
          new Error(
            "You do not have permission to view another user's group memberships",
          ),
        );
      const req = { resolvedIdentity: { userId: "caller-id" } } as any;
      await expect(controller.getUserGroups(req, "other-user")).rejects.toThrow(
        "You do not have permission to view another user's group memberships",
      );
    });
  });

  describe("addGroupMember", () => {
    it("should call service with userId and groupId", async () => {
      const groupId = "group1";
      const userId = "user1";
      jest.spyOn(service, "assignUserToGroup").mockResolvedValueOnce();
      const result = await controller.addGroupMember(groupId, userId);
      expect(service.assignUserToGroup).toHaveBeenCalledWith(userId, groupId);
      expect(result).toEqual({ success: true });
    });
  });

  describe("requestMembership", () => {
    it("should call service with userId from JWT sub and groupId from body", async () => {
      const sub = "jwt-user-id";
      const body: RequestMembershipDto = { groupId: "group1" };
      jest.spyOn(service, "requestMembership").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      const result = await controller.requestMembership(req, body);
      expect(service.requestMembership).toHaveBeenCalledWith(sub, body.groupId);
      expect(result).toEqual({ success: true });
    });

  });

  describe("cancelMembershipRequest", () => {
    it("should call service with userId from JWT, requestId from param, and reason from body", async () => {
      const sub = "jwt-user-id";
      const requestId = "req1";
      jest.spyOn(service, "cancelMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      const result = await controller.cancelMembershipRequest(req, requestId, {
        reason: "No longer needed",
      });
      expect(service.cancelMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        "No longer needed",
      );
      expect(result).toEqual({ success: true });
    });

    it("should call service without reason when body has no reason", async () => {
      const sub = "jwt-user-id";
      const requestId = "req1";
      jest.spyOn(service, "cancelMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      await controller.cancelMembershipRequest(req, requestId, {});
      expect(service.cancelMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        undefined,
      );
    });

  });

  describe("approveMembershipRequest", () => {
    it("should call service with resolvedIdentity, requestId from param, and reason from body", async () => {
      const adminId = "admin-id";
      const requestId = "req1";
      jest.spyOn(service, "approveMembershipRequest").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId: adminId } } as any;
      const result = await controller.approveMembershipRequest(req, requestId, {
        reason: "Approved",
      });
      expect(service.approveMembershipRequest).toHaveBeenCalledWith(
        { userId: adminId },
        requestId,
        "Approved",
      );
      expect(result).toEqual({ success: true });
    });

    it("should call service without reason when body has no reason", async () => {
      const adminId = "admin-id";
      const requestId = "req1";
      jest.spyOn(service, "approveMembershipRequest").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId: adminId } } as any;
      await controller.approveMembershipRequest(req, requestId, {});
      expect(service.approveMembershipRequest).toHaveBeenCalledWith(
        { userId: adminId },
        requestId,
        undefined,
      );
    });
  });

  describe("getGroupMembers", () => {
    it("should call service with groupId from param and return members", async () => {
      const groupId = "group1";
      const members = [
        { userId: "user1", email: "user1@example.com", joinedAt: new Date() },
      ];
      jest.spyOn(service, "getGroupMembers").mockResolvedValueOnce(members);
      const result = await controller.getGroupMembers(groupId);
      expect(service.getGroupMembers).toHaveBeenCalledWith(groupId);
      expect(result).toEqual(members);
    });
  });

  describe("removeGroupMember", () => {
    it("should call service with groupId and userId from params", async () => {
      const groupId = "group1";
      const userId = "user1";
      jest.spyOn(service, "removeGroupMember").mockResolvedValueOnce();
      const result = await controller.removeGroupMember(groupId, userId);
      expect(service.removeGroupMember).toHaveBeenCalledWith(groupId, userId);
      expect(result).toEqual({ success: true });
    });

    it("should propagate errors thrown by the service", async () => {
      jest
        .spyOn(service, "removeGroupMember")
        .mockRejectedValueOnce(new Error("Forbidden"));
      await expect(
        controller.removeGroupMember("group1", "user1"),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("denyMembershipRequest", () => {
    it("should call service with resolvedIdentity, requestId from param, and reason from body", async () => {
      const adminId = "admin-id";
      const requestId = "req1";
      jest.spyOn(service, "denyMembershipRequest").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId: adminId } } as any;
      const result = await controller.denyMembershipRequest(req, requestId, {
        reason: "Not eligible",
      });
      expect(service.denyMembershipRequest).toHaveBeenCalledWith(
        { userId: adminId },
        requestId,
        "Not eligible",
      );
      expect(result).toEqual({ success: true });
    });

    it("should call service without reason when body has no reason", async () => {
      const adminId = "admin-id";
      const requestId = "req1";
      jest.spyOn(service, "denyMembershipRequest").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId: adminId } } as any;
      await controller.denyMembershipRequest(req, requestId, {});
      expect(service.denyMembershipRequest).toHaveBeenCalledWith(
        { userId: adminId },
        requestId,
        undefined,
      );
    });
  });

  describe("getGroupRequests", () => {
    it("should return requests when callerId from resolvedIdentity is provided", async () => {
      const callerId = "admin-id";
      const groupId = "group1";
      const mockRequests: GroupMembershipRequestDto[] = [
        {
          id: "req1",
          userId: "user1",
          email: "user1@example.com",
          groupId,
          status: "PENDING",
          createdAt: new Date(),
        },
      ];
      jest
        .spyOn(service, "getGroupRequests")
        .mockResolvedValueOnce(mockRequests);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      const result = await controller.getGroupRequests(req, groupId, undefined);
      expect(service.getGroupRequests).toHaveBeenCalledWith(
        callerId,
        groupId,
        undefined,
      );
      expect(result).toEqual(mockRequests);
    });

    it("should pass parsed status to service when valid status query param is provided", async () => {
      const callerId = "admin-id";
      const groupId = "group1";
      jest.spyOn(service, "getGroupRequests").mockResolvedValueOnce([]);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      await controller.getGroupRequests(req, groupId, "PENDING");
      expect(service.getGroupRequests).toHaveBeenCalledWith(
        callerId,
        groupId,
        "PENDING",
      );
    });

    it("should throw 400 when an invalid status value is provided", async () => {
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(
        controller.getGroupRequests(req, "group1", "INVALID"),
      ).rejects.toThrow("Invalid status value");
      expect(service.getGroupRequests).not.toHaveBeenCalled();
    });

    it("should propagate errors thrown by the service", async () => {
      jest
        .spyOn(service, "getGroupRequests")
        .mockRejectedValueOnce(new Error("Forbidden"));
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(
        controller.getGroupRequests(req, "group1", undefined),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("getMyRequests", () => {
    it("should return requests for the caller from resolvedIdentity", async () => {
      const userId = "caller-id";
      const mockRequests: MyMembershipRequestDto[] = [
        {
          id: "req1",
          groupId: "group1",
          groupName: "Group One",
          status: "PENDING",
          createdAt: new Date(),
        },
      ];
      jest.spyOn(service, "getMyRequests").mockResolvedValueOnce(mockRequests);
      const req = { resolvedIdentity: { userId } } as any;
      const result = await controller.getMyRequests(req, undefined);
      expect(service.getMyRequests).toHaveBeenCalledWith(userId, undefined);
      expect(result).toEqual(mockRequests);
    });

    it("should pass parsed status when a valid status query param is provided", async () => {
      const userId = "caller-id";
      jest.spyOn(service, "getMyRequests").mockResolvedValueOnce([]);
      const req = { resolvedIdentity: { userId } } as any;
      await controller.getMyRequests(req, "PENDING");
      expect(service.getMyRequests).toHaveBeenCalledWith(userId, "PENDING");
    });

    it("should return an empty array when user has no requests", async () => {
      const userId = "caller-id";
      jest.spyOn(service, "getMyRequests").mockResolvedValueOnce([]);
      const req = { resolvedIdentity: { userId } } as any;
      const result = await controller.getMyRequests(req, undefined);
      expect(result).toEqual([]);
    });

    it("should throw 400 when an invalid status value is provided", async () => {
      const req = { resolvedIdentity: { userId: "caller-id" } } as any;
      await expect(controller.getMyRequests(req, "INVALID")).rejects.toThrow(
        "Invalid status value",
      );
      expect(service.getMyRequests).not.toHaveBeenCalled();
    });

    it("should propagate errors thrown by the service", async () => {
      jest
        .spyOn(service, "getMyRequests")
        .mockRejectedValueOnce(new Error("Service error"));
      const req = { resolvedIdentity: { userId: "caller-id" } } as any;
      await expect(controller.getMyRequests(req, undefined)).rejects.toThrow(
        "Service error",
      );
    });
  });

  describe("leaveGroup", () => {
    it("should call service with userId from resolvedIdentity and return success", async () => {
      const userId = "caller-id";
      const groupId = "group1";
      jest.spyOn(service, "leaveGroup").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId } } as any;
      const result = await controller.leaveGroup(req, groupId);
      expect(service.leaveGroup).toHaveBeenCalledWith(userId, groupId);
      expect(result).toEqual({ success: true });
    });

    it("should propagate BadRequestException when user is not a member", async () => {
      const userId = "caller-id";
      jest
        .spyOn(service, "leaveGroup")
        .mockRejectedValueOnce(
          new HttpException(
            "User is not a member of this group",
            HttpStatus.BAD_REQUEST,
          ),
        );
      const req = { resolvedIdentity: { userId } } as any;
      await expect(controller.leaveGroup(req, "group1")).rejects.toThrow(
        "User is not a member of this group",
      );
    });
  });

  describe("createGroup", () => {
    it("should call service with callerId, name, and description and return the created group", async () => {
      const callerId = "admin-id";
      const mockGroup = { id: "g1", name: "New Group", description: "Desc" };
      jest.spyOn(service, "createGroup").mockResolvedValueOnce(mockGroup);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      const result = await controller.createGroup(req, {
        name: "New Group",
        description: "Desc",
      });
      expect(service.createGroup).toHaveBeenCalledWith(
        callerId,
        "New Group",
        "Desc",
      );
      expect(result).toEqual(mockGroup);
    });

    it("should call service without description when not provided", async () => {
      const callerId = "admin-id";
      const mockGroup = { id: "g1", name: "New Group", description: null };
      jest.spyOn(service, "createGroup").mockResolvedValueOnce(mockGroup);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      await controller.createGroup(req, { name: "New Group" });
      expect(service.createGroup).toHaveBeenCalledWith(
        callerId,
        "New Group",
        undefined,
      );
    });

    it("should propagate ConflictException when group name already exists", async () => {
      jest
        .spyOn(service, "createGroup")
        .mockRejectedValueOnce(
          new Error("Group with this name already exists"),
        );
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(
        controller.createGroup(req, { name: "Existing Group" }),
      ).rejects.toThrow("Group with this name already exists");
    });
  });

  describe("updateGroup", () => {
    const groupId = "group-1";

    it("should call service with callerId, groupId, name, and description and return updated group", async () => {
      const callerId = "admin-id";
      const mockGroup = {
        id: groupId,
        name: "Updated Name",
        description: "Desc",
      };
      jest.spyOn(service, "updateGroup").mockResolvedValueOnce(mockGroup);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      const result = await controller.updateGroup(req, groupId, {
        name: "Updated Name",
        description: "Desc",
      });
      expect(service.updateGroup).toHaveBeenCalledWith(
        callerId,
        groupId,
        "Updated Name",
        "Desc",
      );
      expect(result).toEqual(mockGroup);
    });

    it("should call service without description when not provided", async () => {
      const callerId = "admin-id";
      const mockGroup = {
        id: groupId,
        name: "Updated Name",
        description: null,
      };
      jest.spyOn(service, "updateGroup").mockResolvedValueOnce(mockGroup);
      const req = { resolvedIdentity: { userId: callerId } } as any;
      await controller.updateGroup(req, groupId, { name: "Updated Name" });
      expect(service.updateGroup).toHaveBeenCalledWith(
        callerId,
        groupId,
        "Updated Name",
        undefined,
      );
    });

    it("should propagate ForbiddenException when caller is not a system admin", async () => {
      jest
        .spyOn(service, "updateGroup")
        .mockRejectedValueOnce(
          new Error("Only system admins can update groups"),
        );
      const req = { resolvedIdentity: { userId: "non-admin" } } as any;
      await expect(
        controller.updateGroup(req, groupId, { name: "Updated Name" }),
      ).rejects.toThrow("Only system admins can update groups");
    });

    it("should propagate NotFoundException when group does not exist", async () => {
      jest
        .spyOn(service, "updateGroup")
        .mockRejectedValueOnce(new Error("Group not found"));
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(
        controller.updateGroup(req, "nonexistent", { name: "Updated Name" }),
      ).rejects.toThrow("Group not found");
    });

    it("should propagate ConflictException when group name already exists", async () => {
      jest
        .spyOn(service, "updateGroup")
        .mockRejectedValueOnce(
          new Error("Group with this name already exists"),
        );
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(
        controller.updateGroup(req, groupId, { name: "Existing Name" }),
      ).rejects.toThrow("Group with this name already exists");
    });
  });
  describe("deleteGroup", () => {
    const groupId = "group-to-delete";

    it("should soft-delete a group and return success when caller is a system admin", async () => {
      jest.spyOn(service, "deleteGroup").mockResolvedValueOnce(undefined);
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      const result = await controller.deleteGroup(req, groupId);
      expect(service.deleteGroup).toHaveBeenCalledWith(groupId, "admin-id");
      expect(result).toEqual({ success: true });
    });

    it("should propagate NotFoundException when group does not exist", async () => {
      jest
        .spyOn(service, "deleteGroup")
        .mockRejectedValueOnce(new Error("Group not found"));
      const req = { resolvedIdentity: { userId: "admin-id" } } as any;
      await expect(controller.deleteGroup(req, "nonexistent")).rejects.toThrow(
        "Group not found",
      );
    });
  });
});
