import { Test, TestingModule } from "@nestjs/testing";
import { HttpException, HttpStatus } from "@nestjs/common";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";
import { RequestMembershipDto } from "./dto/request-membership.dto";

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
});
