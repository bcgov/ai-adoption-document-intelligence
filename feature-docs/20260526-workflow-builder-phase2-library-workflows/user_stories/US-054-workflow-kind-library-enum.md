# US-054: Add `library` to the `WorkflowKind` Prisma enum + migration

**As a** workflow author,
**I want** the DB to support a third `workflow_kind` value alongside
the existing `primary` / `benchmark_candidate`,
**So that** library workflows can be persisted, filtered, and listed
distinctly from regular workflows.

## Acceptance Criteria

- [ ] **Scenario 1**: The Prisma enum has three values
    - **Given** `apps/shared/prisma/schema.prisma`
    - **When** the schema is read
    - **Then** the `WorkflowKind` enum includes `primary`, `benchmark_candidate`, and `library`

- [ ] **Scenario 2**: A migration adds the enum value
    - **Given** the repo's Prisma migration directory
    - **When** `npm run db:generate` is invoked from `apps/backend-services`
    - **Then** the migration `add-library-workflow-kind` exists with a `ALTER TYPE "WorkflowKind" ADD VALUE 'library'` statement (or equivalent)
    - **And** the migration has not yet been run against the dev DB until Alex applies it

- [ ] **Scenario 3**: Existing `WorkflowLineage` rows are unaffected
    - **Given** existing workflow rows with `workflow_kind = primary` or `workflow_kind = benchmark_candidate`
    - **When** the migration is run
    - **Then** all existing rows continue to have their original kind unchanged

- [ ] **Scenario 4**: Prisma-generated types include the new enum value
    - **Given** the post-`db:generate` state
    - **When** `WorkflowKind` is imported from `@prisma/client` in backend code
    - **Then** TypeScript sees `WorkflowKind.primary`, `WorkflowKind.benchmark_candidate`, and `WorkflowKind.library`

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/shared/prisma/schema.prisma` — add `library` to the `WorkflowKind` enum
- New file: `apps/shared/prisma/migrations/YYYYMMDDHHMMSS_add_library_workflow_kind/migration.sql`
- `apps/backend-services/src/generated/*` + `apps/temporal/src/generated/*` — regenerated Prisma client types (auto-written by `npm run db:generate`)
