import { DatabaseService } from "@/database/database.service";
import { identityCanAccessGroup } from "./identity.helpers";

describe("identityCanAccessGroup", () => {
  let mockDb: DatabaseService;

  beforeEach(() => {
    mockDb = {
      isUserInGroup: jest.fn(),
    } as unknown as DatabaseService;
  });

  describe("when identity is undefined", () => {
    it("should return false", async () => {
      const result = await identityCanAccessGroup(undefined, "group-1", mockDb);
      expect(result).toBe(false);
    });

    it("should not call isUserInGroup", async () => {
      await identityCanAccessGroup(undefined, "group-1", mockDb);
      expect(mockDb.isUserInGroup).not.toHaveBeenCalled();
    });
  });

  describe("when identity is an empty object", () => {
    it("should return false", async () => {
      const result = await identityCanAccessGroup({}, "group-1", mockDb);
      expect(result).toBe(false);
    });
  });

  describe("API key path (groupId on identity)", () => {
    it("should return true when the identity groupId matches the requested groupId", async () => {
      const result = await identityCanAccessGroup(
        { groupId: "group-1" },
        "group-1",
        mockDb,
      );
      expect(result).toBe(true);
    });

    it("should return false when the identity groupId does not match the requested groupId", async () => {
      const result = await identityCanAccessGroup(
        { groupId: "group-2" },
        "group-1",
        mockDb,
      );
      expect(result).toBe(false);
    });

    it("should not call isUserInGroup", async () => {
      await identityCanAccessGroup({ groupId: "group-1" }, "group-1", mockDb);
      expect(mockDb.isUserInGroup).not.toHaveBeenCalled();
    });
  });

  describe("JWT path (userId on identity)", () => {
    it("should return true when the user is a member of the group", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(true);
      const result = await identityCanAccessGroup(
        { userId: "user-abc" },
        "group-1",
        mockDb,
      );
      expect(result).toBe(true);
    });

    it("should return false when the user is not a member of the group", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(false);
      const result = await identityCanAccessGroup(
        { userId: "user-abc" },
        "group-1",
        mockDb,
      );
      expect(result).toBe(false);
    });

    it("should call isUserInGroup with the correct userId and groupId", async () => {
      (mockDb.isUserInGroup as jest.Mock).mockResolvedValue(true);
      await identityCanAccessGroup({ userId: "user-abc" }, "group-1", mockDb);
      expect(mockDb.isUserInGroup).toHaveBeenCalledWith("user-abc", "group-1");
    });
  });
});
