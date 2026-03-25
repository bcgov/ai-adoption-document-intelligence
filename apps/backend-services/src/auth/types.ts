import { GroupRole } from "@generated/client";

/**
 * User interface representing the validated JWT payload.
 * Extended with Keycloak-specific claims and normalized roles.
 */
export interface User {
  sub?: string;
  idir_username?: string;
  display_name?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Resolved requestor identity attached to the request by the IdentityGuard.
 *
 * - `userId`: JWT-authenticated. The service layer must look up group
 *   membership in the database.
 * - `isSystemAdmin`: Indicates the identity has unrestricted system-admin access.
 * - `groupRoles`: A map of group IDs to the identity's role within each group.
 *   Both API-key and JWT paths populate this field using the same shape.
 *   For the API-key path the guard sets this directly; for the JWT path the
 *   service layer may populate it after a role lookup.
 */
export interface ResolvedIdentity {
  userId?: string;
  isSystemAdmin?: boolean;
  groupRoles?: Record<string, GroupRole>;
}

/**
 * Shape returned by ApiKeyService.validateApiKey and attached to the request
 * by ApiKeyAuthGuard. Mirrors the optional `user` property so both auth
 * paths expose their credential via a single object.
 */
export interface ValidatedApiKey {
  groupId: string;
  keyPrefix: string;
}

declare module "express" {
  interface Request {
    user?: User;
    /** Set by ApiKeyAuthGuard when a valid API key is used. */
    apiKey?: ValidatedApiKey;
    /**
     * Set by IdentityGuard after authentication succeeds.
     * Contains the normalised requestor identity for downstream authorization.
     */
    resolvedIdentity?: ResolvedIdentity;
  }
}
