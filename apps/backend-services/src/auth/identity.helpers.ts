import { DatabaseService } from "@/database/database.service";
import { ResolvedIdentity } from "./types";

/**
 * Determines whether the resolved identity has access to the specified group.
 *
 * - **API key path** (`identity.groupId` is set): access is granted when the
 *   identity's group matches the requested `groupId` exactly.
 * - **JWT path** (`identity.userId` is set): access is granted when the user
 *   is a member of the group, verified via a database lookup.
 * - **Unauthenticated / no identity**: always returns `false`.
 *
 * @param identity - The resolved identity from `request.resolvedIdentity`, or
 *   `undefined` for unauthenticated requests.
 * @param groupId - The group ID to validate access against.
 * @param db - The database service used to check user group membership on the
 *   JWT path.
 * @returns `true` if the identity is authorised to access the group,
 *   `false` otherwise.
 */
export async function identityCanAccessGroup(
  identity: ResolvedIdentity | undefined,
  groupId: string,
  db: DatabaseService,
): Promise<boolean> {
  if (!identity) {
    return false;
  }

  if (identity.groupId !== undefined) {
    return identity.groupId === groupId;
  }

  if (identity.userId !== undefined) {
    // TODO: Check role permissions here once the roles & claims system is implemented
    return db.isUserInGroup(identity.userId, groupId);
  }

  return false;
}
