import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "@/database/database.service";
import { GroupRole } from "@/generated";
import { ROLE_ORDER } from "./identity.guard";
import { ResolvedIdentity } from "./types";

/**
 * Resolves the set of group IDs the resolved identity has access to, or
 * `undefined` when the identity has unrestricted access (system-admin).
 *
 * - **API key path** (`identity.groupRoles` is set): returns the keys of
 *   `identity.groupRoles` as the accessible group IDs.
 * - **JWT / system-admin path** (`identity.userId` is set): checks the database
 *   for the `system-admin` role. If the user is a system-admin, returns
 *   `undefined` so the caller applies no group filter and all records are
 *   visible. Otherwise, returns the user's group IDs.
 * - **Unauthenticated / no identity**: returns an empty array (no access).
 *
 * Callers that receive `undefined` should skip any group-membership `where`
 * clause so that admin users can see resources across all groups.
 *
 * @param identity - The resolved identity from `request.resolvedIdentity`, or
 *   `undefined` for unauthenticated requests.
 * @returns An array of accessible group IDs, or `undefined` for unrestricted access.
 */
export function getIdentityGroupIds(
  identity: ResolvedIdentity | undefined,
): string[] | undefined {
  if (!identity) {
    return [];
  }

  // Fast path: isSystemAdmin was pre-populated by IdentityGuard (via @Identity decorator).
  // Admin users can see all records across all groups.
  if (identity.isSystemAdmin === true) {
    return undefined;
  }

  if (identity.groupRoles !== undefined) {
    // API key path: groupRoles encodes the single scoped group.
    return Object.keys(identity.groupRoles);
  }

  return [];
}

/**
 * Asserts that the resolved identity has access to the specified group,
 * throwing an appropriate HTTP exception if access is denied.
 *
 * - **Null groupId**: throws `404 Not Found` to prevent leaking the existence
 *   of orphaned records that have no group assignment.
 * - **API key path** (`identity.groupRoles` is set): throws `403 Forbidden` when
 *   the requested `groupId` is not present in `identity.groupRoles`.
 * - **JWT path** (`identity.userId` is set): throws `403 Forbidden` when the
 *   user is not a member of the group, verified via a database lookup.
 * - **Unauthenticated / no identity**: always throws `403 Forbidden`.
 *
 * @param identity - The resolved identity from `request.resolvedIdentity`, or
 *   `undefined` for unauthenticated requests.
 * @param groupId - The group ID to validate access against, or `null` for
 *   orphaned records with no group assignment.
 * @param minimumRole - The minimum required role within the group (default: "MEMBER").
 * @throws {NotFoundException} When the resource has no group (`groupId` is null),
 *   preventing leakage of orphaned record existence.
 * @throws {ForbiddenException} When the identity is not authorised to access the group.
 */
export function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string | null,
  minimumRole: GroupRole = GroupRole.MEMBER,
): void {
  if (groupId === null) {
    throw new NotFoundException("Resource not found.");
  }

  if (!identity) {
    throw new ForbiddenException("User does not belong to requested group.");
  }

  // Fast path: isSystemAdmin was pre-populated by IdentityGuard (via @Identity decorator).
  if (identity.isSystemAdmin === true) {
    return;
  }

  if (identity.groupRoles !== undefined) {
    // API key path: groupRoles encodes the single scoped group.
    // Use Object.hasOwn instead of `in` to avoid prototype chain traversal.
    // The `in` operator returns true for inherited properties like "__proto__"
    // or "constructor", which would bypass the membership check.
    if (!Object.hasOwn(identity.groupRoles, groupId)) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    // Is their role for the group sufficient?
    const role = identity.groupRoles[groupId];
    if (ROLE_ORDER[role] < ROLE_ORDER[minimumRole]) {
      throw new ForbiddenException("Insufficient role within the group");
    }
    return;
  }

  throw new ForbiddenException("User does not belong to requested group.");
}
