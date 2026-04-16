import { GroupRole } from "@generated/client";

/**
 * Numeric ordering of {@link GroupRole} values used for minimum-role comparisons.
 * Higher numbers represent greater privilege.
 */
export const ROLE_ORDER: Record<GroupRole, number> = {
  [GroupRole.MEMBER]: 0,
  [GroupRole.ADMIN]: 1,
};
