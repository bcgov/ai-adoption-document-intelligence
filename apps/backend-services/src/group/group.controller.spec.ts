import { Test, TestingModule } from "@nestjs/testing";
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
});
