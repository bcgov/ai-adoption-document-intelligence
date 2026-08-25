/**
 * Repository-layer error classes for the Phase 6 dynamic-node persistence.
 *
 * Thrown by `DynamicNodeRepository`. The service layer (`DynamicNodesService`)
 * catches each one and re-throws as the appropriate NestJS HTTP exception
 * (`ConflictException`, `NotFoundException`, …) so the controllers stay thin.
 *
 * Keeping these as plain `Error` subclasses (rather than NestJS exceptions
 * directly) lets the repository remain framework-agnostic and unit-testable
 * without a NestJS test module.
 */

/**
 * Thrown by `createWithFirstVersion` when the `(groupId, slug)` unique
 * constraint is violated (Prisma error code `P2002`). The service maps this
 * to HTTP 409 `Conflict`.
 */
export class DuplicateSlugError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Dynamic node with slug '${slug}' already exists for this group`);
    this.name = "DuplicateSlugError";
    this.slug = slug;
  }
}

/**
 * Thrown by `publishNewVersion` / `softDelete` when the targeted lineage
 * cannot be found for the calling group. The service maps this to HTTP 404
 * `Not Found`.
 */
export class DynamicNodeNotFoundError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Dynamic node with slug '${slug}' not found for this group`);
    this.name = "DynamicNodeNotFoundError";
    this.slug = slug;
  }
}

/**
 * Thrown by `publishNewVersion` when the targeted lineage exists but is
 * soft-deleted (`deletedAt != null`). The service maps this to HTTP 404
 * `Not Found` — soft-deleted lineages must be invisible to clients.
 */
export class DynamicNodeDeletedError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`Dynamic node with slug '${slug}' is soft-deleted`);
    this.name = "DynamicNodeDeletedError";
    this.slug = slug;
  }
}
