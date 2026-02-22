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
 * TypeScript "declaration merge" — extends Express's built-in Request type
 * to include a `user` property. Without this, `req.user` would be a type
 * error because Express doesn't define it.
 *
 * At runtime, Passport attaches the user object after authentication
 * (see KeycloakJwtStrategy.validate() and ApiKeyAuthGuard), but TypeScript
 * has no way to know that unless we tell it here. This lets guards,
 * controllers, and middleware access `req.user` with full type safety
 * instead of casting through `any`.
 */
declare module "express" {
  interface Request {
    user?: User;
  }
}
