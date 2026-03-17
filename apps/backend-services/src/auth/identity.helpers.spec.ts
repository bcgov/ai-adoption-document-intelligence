import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "./identity.helpers";

describe("getIdentityGroupIds", () => {
  it("should return an empty array when identity is undefined", () => {
    const result = getIdentityGroupIds(undefined);
    expect(result).toEqual([]);
  });

  it("should return a single-element array for an API key identity", () => {
    const result = getIdentityGroupIds({
      groupRoles: { "group-abc": GroupRole.MEMBER },
    });
    expect(result).toEqual(["group-abc"]);
  });

  it("should return undefined for an identity with isSystemAdmin true", () => {
    const result = getIdentityGroupIds({
      userId: "admin-id",
      isSystemAdmin: true,
      groupRoles: {},
    });
    expect(result).toBeUndefined();
  });

  it("should return mapped group IDs from groupRoles for a non-admin JWT user", () => {
    const result = getIdentityGroupIds({
      userId: "user-abc",
      isSystemAdmin: false,
      groupRoles: {
        "group-1": GroupRole.MEMBER,
        "group-2": GroupRole.ADMIN,
      },
    });
    expect(result).toEqual(expect.arrayContaining(["group-1", "group-2"]));
    expect(result).toHaveLength(2);
  });

  it("should return an empty array for a JWT user belonging to no groups", () => {
    const result = getIdentityGroupIds({
      userId: "user-abc",
      isSystemAdmin: false,
      groupRoles: {},
    });
    expect(result).toEqual([]);
  });

  it("should return an empty array for an empty identity object", () => {
    const result = getIdentityGroupIds({});
    expect(result).toEqual([]);
  });
});

describe("identityCanAccessGroup", () => {
  describe("when groupId is null (orphaned record)", () => {
    it("should throw NotFoundException regardless of identity", () => {
      expect(() =>
        identityCanAccessGroup({ userId: "user-abc" }, null),
      ).toThrow(NotFoundException);
    });

    it("should throw NotFoundException when identity is an API key identity", () => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "group-1": GroupRole.MEMBER } },
          null,
        ),
      ).toThrow(NotFoundException);
    });

    it("should throw NotFoundException when identity is undefined", () => {
      expect(() => identityCanAccessGroup(undefined, null)).toThrow(
        NotFoundException,
      );
    });
  });

  describe("when identity is undefined", () => {
    it("should throw ForbiddenException", () => {
      expect(() => identityCanAccessGroup(undefined, "group-1")).toThrow(
        ForbiddenException,
      );
    });
  });

  describe("when identity is an empty object", () => {
    it("should throw ForbiddenException", () => {
      expect(() => identityCanAccessGroup({}, "group-1")).toThrow(
        ForbiddenException,
      );
    });
  });

  describe("when identity.isSystemAdmin is true", () => {
    it("should not throw for any groupId", () => {
      expect(() =>
        identityCanAccessGroup(
          { userId: "admin", isSystemAdmin: true },
          "group-1",
        ),
      ).not.toThrow();
    });
  });

  describe("API key path (groupRoles on identity)", () => {
    it("should not throw when the requested groupId is in groupRoles", () => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "group-1": GroupRole.MEMBER } },
          "group-1",
        ),
      ).not.toThrow();
    });
  });

    it("should throw ForbiddenException when the requested groupId is not in groupRoles", () => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "group-2": GroupRole.MEMBER } },
          "group-1",
        ),
      ).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when role is below minimumRole", () => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "group-1": GroupRole.MEMBER } },
          "group-1",
          GroupRole.ADMIN,
        ),
      ).toThrow(ForbiddenException);
    });

    it("should not throw when role meets minimumRole", () => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "group-1": GroupRole.ADMIN } },
          "group-1",
          GroupRole.ADMIN,
        ),
      ).not.toThrow();
    });
  });

  describe("prototype property bypass prevention", () => {
    it.each([
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
    ])("should throw ForbiddenException when groupId is '%s'", (groupId) => {
      expect(() =>
        identityCanAccessGroup(
          { groupRoles: { "real-group": GroupRole.MEMBER } },
          groupId,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe("userId-only path (no groupRoles on identity)", () => {
    it("should throw ForbiddenException when identity has userId but no groupRoles", () => {
      expect(() =>
        identityCanAccessGroup({ userId: "user-abc" }, "group-1"),
      ).toThrow(ForbiddenException);
    });
  });
});
