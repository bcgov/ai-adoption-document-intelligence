import { HttpException, HttpStatus } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { RequestMembershipDto } from "./dto/request-membership.dto";
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
            assignUserToGroups: jest.fn(),
            requestMembership: jest.fn(),
            cancelMembershipRequest: jest.fn(),
            approveMembershipRequest: jest.fn(),
            denyMembershipRequest: jest.fn(),
            getGroupMembers: jest.fn(),
            removeGroupMember: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
    service = module.get<GroupService>(GroupService);
  });

  it("should assign user to groups", async () => {
    const userId = "user1";
    const groupIds = ["group1", "group2"];
    jest.spyOn(service, "assignUserToGroups").mockResolvedValueOnce();
    const result = await controller.assignUserToGroups(userId, groupIds);
    expect(service.assignUserToGroups).toHaveBeenCalledWith(userId, groupIds);
    expect(result).toEqual({ success: true });
  });

  it("should throw if groupIds is empty", async () => {
    await expect(controller.assignUserToGroups("user1", [])).rejects.toThrow();
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

    it("should throw 401 if no user in request", async () => {
      const req = { user: undefined } as any;
      await expect(
        controller.requestMembership(req, { groupId: "group1" }),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if user has no sub claim", async () => {
      const req = { user: {} } as any;
      await expect(
        controller.requestMembership(req, { groupId: "group1" }),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
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

    it("should throw 401 if no user in request", async () => {
      const req = { user: undefined } as any;
      await expect(
        controller.cancelMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if user has no sub claim", async () => {
      const req = { user: {} } as any;
      await expect(
        controller.cancelMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });
  });

  describe("approveMembershipRequest", () => {
    it("should call service with adminId from JWT, requestId from param, and reason from body", async () => {
      const sub = "jwt-admin-id";
      const requestId = "req1";
      jest.spyOn(service, "approveMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      const result = await controller.approveMembershipRequest(req, requestId, {
        reason: "Approved",
      });
      expect(service.approveMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        "Approved",
      );
      expect(result).toEqual({ success: true });
    });

    it("should call service without reason when body has no reason", async () => {
      const sub = "jwt-admin-id";
      const requestId = "req1";
      jest.spyOn(service, "approveMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      await controller.approveMembershipRequest(req, requestId, {});
      expect(service.approveMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        undefined,
      );
    });

    it("should throw 401 if no user in request", async () => {
      const req = { user: undefined } as any;
      await expect(
        controller.approveMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if user has no sub claim", async () => {
      const req = { user: {} } as any;
      await expect(
        controller.approveMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });
  });

  describe("getGroupMembers", () => {
    it("should call service with userId from resolvedIdentity and groupId from param", async () => {
      const userId = "caller-user-id";
      const groupId = "group1";
      const members = [
        { userId: "user1", email: "user1@example.com", joinedAt: new Date() },
      ];
      jest.spyOn(service, "getGroupMembers").mockResolvedValueOnce(members);
      const req = { resolvedIdentity: { userId } } as any;
      const result = await controller.getGroupMembers(req, groupId);
      expect(service.getGroupMembers).toHaveBeenCalledWith(userId, groupId);
      expect(result).toEqual(members);
    });

    it("should throw 401 if resolvedIdentity has no userId", async () => {
      const req = { resolvedIdentity: undefined } as any;
      await expect(controller.getGroupMembers(req, "group1")).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if resolvedIdentity is defined but has no userId", async () => {
      const req = { resolvedIdentity: { groupId: "some-group" } } as any;
      await expect(controller.getGroupMembers(req, "group1")).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });
  });

  describe("removeGroupMember", () => {
    it("should call service with callerId from resolvedIdentity, groupId, and userId from params", async () => {
      const callerId = "caller-id";
      const groupId = "group1";
      const userId = "user1";
      jest.spyOn(service, "removeGroupMember").mockResolvedValueOnce();
      const req = { resolvedIdentity: { userId: callerId } } as any;
      const result = await controller.removeGroupMember(req, groupId, userId);
      expect(service.removeGroupMember).toHaveBeenCalledWith(
        callerId,
        groupId,
        userId,
      );
      expect(result).toEqual({ success: true });
    });

    it("should throw 401 if resolvedIdentity is undefined", async () => {
      const req = { resolvedIdentity: undefined } as any;
      await expect(
        controller.removeGroupMember(req, "group1", "user1"),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if resolvedIdentity has no userId", async () => {
      const req = { resolvedIdentity: {} } as any;
      await expect(
        controller.removeGroupMember(req, "group1", "user1"),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should propagate errors thrown by the service", async () => {
      jest
        .spyOn(service, "removeGroupMember")
        .mockRejectedValueOnce(new Error("Forbidden"));
      const req = { resolvedIdentity: { userId: "caller-id" } } as any;
      await expect(
        controller.removeGroupMember(req, "group1", "user1"),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("denyMembershipRequest", () => {
    it("should call service with adminId from JWT, requestId from param, and reason from body", async () => {
      const sub = "jwt-admin-id";
      const requestId = "req1";
      jest.spyOn(service, "denyMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      const result = await controller.denyMembershipRequest(req, requestId, {
        reason: "Not eligible",
      });
      expect(service.denyMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        "Not eligible",
      );
      expect(result).toEqual({ success: true });
    });

    it("should call service without reason when body has no reason", async () => {
      const sub = "jwt-admin-id";
      const requestId = "req1";
      jest.spyOn(service, "denyMembershipRequest").mockResolvedValueOnce();
      const req = { user: { sub } } as any;
      await controller.denyMembershipRequest(req, requestId, {});
      expect(service.denyMembershipRequest).toHaveBeenCalledWith(
        sub,
        requestId,
        undefined,
      );
    });

    it("should throw 401 if no user in request", async () => {
      const req = { user: undefined } as any;
      await expect(
        controller.denyMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });

    it("should throw 401 if user has no sub claim", async () => {
      const req = { user: {} } as any;
      await expect(
        controller.denyMembershipRequest(req, "req1", {}),
      ).rejects.toThrow(
        new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED),
      );
    });
  });
});
