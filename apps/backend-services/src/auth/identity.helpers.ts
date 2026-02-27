import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "@/database/database.service";
import { ResolvedIdentity } from "./types";

/**
 * Resolves the set of group IDs the resolved identity has access to, or
 * `undefined` when the identity has unrestricted access (system-admin).
 *
 * - **API key path** (`identity.groupId` is set): returns `[identity.groupId]`.
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
 * @param db - The database service used to check admin role and group membership.
 * @returns An array of accessible group IDs, or `undefined` for unrestricted access.
 */
export async function getIdentityGroupIds(
  identity: ResolvedIdentity | undefined,
  db: DatabaseService,
): Promise<string[] | undefined> {
  if (!identity) {
    return [];
  }

  if (identity.groupId !== undefined) {
    return [identity.groupId];
  }

  if (identity.userId !== undefined) {
    const isAdmin = await db.isUserSystemAdmin(identity.userId);
    if (isAdmin) {
      // What undefined means:
      // - Caller should not apply any group filter (e.g. `where: { group_id: { in: ... } }`)
      // - Admin users can see all records across all groups
      return undefined;
    }
    const userGroups = await db.getUsersGroups(identity.userId);
    return userGroups.map((ug) => ug.group_id);
  }

  return [];
}

/**
 * Asserts that the resolved identity has access to the specified group,
 * throwing an appropriate HTTP exception if access is denied.
 *
 * - **Null groupId**: throws `404 Not Found` to prevent leaking the existence
 *   of orphaned records that have no group assignment.
 * - **API key path** (`identity.groupId` is set): throws `403 Forbidden` when
 *   the identity's group does not match the requested `groupId`.
 * - **JWT path** (`identity.userId` is set): throws `403 Forbidden` when the
 *   user is not a member of the group, verified via a database lookup.
 * - **Unauthenticated / no identity**: always throws `403 Forbidden`.
 *
 * @param identity - The resolved identity from `request.resolvedIdentity`, or
 *   `undefined` for unauthenticated requests.
 * @param groupId - The group ID to validate access against, or `null` for
 *   orphaned records with no group assignment.
 * @param db - The database service used to check user group membership on the
 *   JWT path.
 * @throws {NotFoundException} When the resource has no group (`groupId` is null),
 *   preventing leakage of orphaned record existence.
 * @throws {ForbiddenException} When the identity is not authorised to access the group.
 */
export async function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string | null,
  db: DatabaseService,
): Promise<void> {
  if (groupId === null) {
    throw new NotFoundException("Resource not found.");
  }

  if (!identity) {
    throw new ForbiddenException("User does not belong to requested group.");
  }

  if (identity.groupId !== undefined) {
    if (identity.groupId !== groupId) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    return;
  }

  if (identity.userId !== undefined) {
    const isUserSystemAdmin = await db.isUserSystemAdmin(identity.userId);
    if (isUserSystemAdmin) {
      return;
    }
    // TODO: Check role permissions here once the roles & claims system is implemented
    const isMember = await db.isUserInGroup(identity.userId, groupId);
    if (!isMember) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    return;
  }

  throw new ForbiddenException("User does not belong to requested group.");
}
