import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "@/database/database.service";
import { getIdentityGroupIds, identityCanAccessGroup } from "./identity.helpers";

describe("getIdentityGroupIds", () => {
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockDb = {
      getUsersGroups: jest.fn(),
      isUserSystemAdmin: jest.fn(),
    } as unknown as DatabaseService;
  });

  it("should return an empty array when identity is undefined", async () => {
    const result = await getIdentityGroupIds(undefined, mockDb);
    expect(result).toEqual([]);
  });

  it("should return a single-element array for an API key identity", async () => {
    const result = await getIdentityGroupIds({ groupId: "group-abc" }, mockDb);
    expect(result).toEqual(["group-abc"]);
  });

  it("should return undefined for a system-admin JWT user", async () => {
    (mockDb.isUserSystemAdmin as jest.Mock).mockResolvedValue(true);
    const result = await getIdentityGroupIds({ userId: "admin-id" }, mockDb);
    expect(result).toBeUndefined();
    expect(mockDb.isUserSystemAdmin).toHaveBeenCalledWith("admin-id");
    expect(mockDb.getUsersGroups).not.toHaveBeenCalled();
  });

  it("should return mapped group IDs for a non-admin JWT user", async () => {
    (mockDb.isUserSystemAdmin as jest.Mock).mockResolvedValue(false);
    (mockDb.getUsersGroups as jest.Mock).mockResolvedValue([
      { group_id: "group-1" },
      { group_id: "group-2" },
    ]);
    const result = await getIdentityGroupIds({ userId: "user-abc" }, mockDb);
    expect(result).toEqual(["group-1", "group-2"]);
    expect(mockDb.getUsersGroups).toHaveBeenCalledWith("user-abc");
  });

  it("should return an empty array for a JWT user belonging to no groups", async () => {
    (mockDb.isUserSystemAdmin as jest.Mock).mockResolvedValue(false);
    (mockDb.getUsersGroups as jest.Mock).mockResolvedValue([]);
    const result = await getIdentityGroupIds({ userId: "user-abc" }, mockDb);
    expect(result).toEqual([]);
  });

  it("should return an empty array for an empty identity object", async () => {
    const result = await getIdentityGroupIds({}, mockDb);
    expect(result).toEqual([]);
  });
});

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
