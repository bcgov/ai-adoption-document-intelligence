import { GroupRole } from "@generated/client";

/**
 * Numeric ordering of {@link GroupRole} values used for minimum-role comparisons.
 * Higher numbers represent greater privilege.
 */
export const ROLE_ORDER: Record<GroupRole, number> = {
  [GroupRole.REVIEWER]: 0,
  [GroupRole.MEMBER]: 1,
  [GroupRole.ADMIN]: 2,
};
