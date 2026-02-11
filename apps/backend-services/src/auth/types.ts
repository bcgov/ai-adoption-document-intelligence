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
 * Augment Express Request to include the user object
 * attached by the JWT authentication strategy.
 */
declare module "express" {
  interface Request {
    user?: User;
  }
}
