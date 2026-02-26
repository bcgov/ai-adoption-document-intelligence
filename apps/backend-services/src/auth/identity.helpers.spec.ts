import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "@/database/database.service";
import { identityCanAccessGroup } from "./identity.helpers";

describe("identityCanAccessGroup", () => {
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockDb = {
      isUserInGroup: jest.fn(),
    } as unknown as DatabaseService;
  });

  describe("when groupId is null (orphaned record)", () => {
    it("should throw NotFoundException regardless of identity", async () => {
      await expect(
        identityCanAccessGroup({ userId: "user-abc" }, null, mockDb),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when identity is an API key identity", async () => {
      await expect(
        identityCanAccessGroup({ groupId: "group-1" }, null, mockDb),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when identity is undefined", async () => {
      await expect(
        identityCanAccessGroup(undefined, null, mockDb),
      ).rejects.toThrow(NotFoundException);
    });

    it("should not call isUserInGroup", async () => {
      await expect(
        identityCanAccessGroup({ userId: "user-abc" }, null, mockDb),
      ).rejects.toThrow();
      expect(mockDb.isUserInGroup).not.toHaveBeenCalled();
    });
  });

  describe("when identity is undefined", () => {
    it("should throw ForbiddenException", async () => {
      await expect(
        identityCanAccessGroup(undefined, "group-1", mockDb),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should not call isUserInGroup", async () => {
      await expect(
        identityCanAccessGroup(undefined, "group-1", mockDb),
      ).rejects.toThrow();
      expect(mockDb.isUserInGroup).not.toHaveBeenCalled();
    });
  });

  describe("when identity is an empty object", () => {
    it("should throw ForbiddenException", async () => {
      await expect(
        identityCanAccessGroup({}, "group-1", mockDb),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("API key path (groupId on identity)", () => {
    it("should resolve without throwing when the identity groupId matches the requested groupId", async () => {
      await expect(
        identityCanAccessGroup({ groupId: "group-1" }, "group-1", mockDb),
      ).resolves.not.toThrow();
    });

    it("should throw ForbiddenException when the identity groupId does not match the requested groupId", async () => {
      await expect(
        identityCanAccessGroup({ groupId: "group-2" }, "group-1", mockDb),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should not call isUserInGroup", async () => {
      await identityCanAccessGroup({ groupId: "group-1" }, "group-1", mockDb);
      expect(mockDb.isUserInGroup).not.toHaveBeenCalled();
    });
  });

  describe("JWT path (userId on identity)", () => {
    it("should resolve without throwing when the user is a member of the group", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(true);
      await expect(
        identityCanAccessGroup({ userId: "user-abc" }, "group-1", mockDb),
      ).resolves.not.toThrow();
    });

    it("should throw ForbiddenException when the user is not a member of the group", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(false);
      await expect(
        identityCanAccessGroup({ userId: "user-abc" }, "group-1", mockDb),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should call isUserInGroup with the correct userId and groupId", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(true);
      await identityCanAccessGroup({ userId: "user-abc" }, "group-1", mockDb);
      expect(mockDb.isUserInGroup).toHaveBeenCalledWith("user-abc", "group-1");
    });
  });
});
