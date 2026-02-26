import { ForbiddenException } from "@nestjs/common";
import { DatabaseService } from "@/database/database.service";
import { ResolvedIdentity } from "./types";

/**
 * Asserts that the resolved identity has access to the specified group,
 * throwing an appropriate HTTP exception if access is denied.
 *
 * - **API key path** (`identity.groupId` is set): throws `403 Forbidden` when
 *   the identity's group does not match the requested `groupId`.
 * - **JWT path** (`identity.userId` is set): throws `403 Forbidden` when the
 *   user is not a member of the group, verified via a database lookup.
 * - **Unauthenticated / no identity**: always throws `403 Forbidden`.
 *
 * @param identity - The resolved identity from `request.resolvedIdentity`, or
 *   `undefined` for unauthenticated requests.
 * @param groupId - The group ID to validate access against.
 * @param db - The database service used to check user group membership on the
 *   JWT path.
 * @throws {ForbiddenException} When the identity is not authorised to access the group.
 */
export async function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string,
  db: DatabaseService,
): Promise<void> {
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
    // TODO: Check role permissions here once the roles & claims system is implemented
    const isMember = await db.isUserInGroup(identity.userId, groupId);
    if (!isMember) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    return;
  }

  throw new ForbiddenException("User does not belong to requested group.");
}
