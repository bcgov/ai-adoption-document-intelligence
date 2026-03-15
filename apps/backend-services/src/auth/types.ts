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
 * Exactly one of `userId` or `groupId` is set per authenticated request:
 * - `userId`: JWT-authenticated. The service layer must look up group
 *   membership in the database.
 * - `groupId`: API-key-authenticated. The key is group-scoped; no user lookup
 *   is needed.
 */
export interface ResolvedIdentity {
  userId?: string;
  groupId?: string;
}

declare module "express" {
  interface Request {
    user?: User;
    /** Set by ApiKeyAuthGuard when a valid API key is used. */
    apiKeyGroupId?: string;
    /** Set by ApiKeyAuthGuard — the stored key prefix for audit logging. */
    apiKeyPrefix?: string;
    /**
     * Set by IdentityGuard after authentication succeeds.
     * Contains the normalised requestor identity for downstream authorization.
     */
    resolvedIdentity?: ResolvedIdentity;
  }
}
