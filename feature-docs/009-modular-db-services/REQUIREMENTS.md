# Feature Requirements: Modular Database Services

## Summary

The existing monolithic `DatabaseService` in the `database` module has grown too large and handles database operations for multiple unrelated modules (documents, labelling, group, classifier, HITL review). This feature decomposes it by moving each module's database operations into a dedicated db-service that lives within that module.

---

## Background / Problem Statement

The current architecture places all database operations in `apps/backend-services/src/database/database.service.ts`. Sub-services (`DocumentDbService`, `LabelingDocumentDbService`, `LabelingProjectDbService`, `ReviewDbService`) already exist inside the `database` module but are all re-exported through `DatabaseService`, which serves as a pass-through façade. Additionally, some operations (classifier model CRUD, group membership queries) are implemented directly in `DatabaseService` using `PrismaService` inline.

This creates tight coupling, poor separation of concerns, and makes the module difficult to maintain and test independently.

---

## Goals

1. Move each module's db-service into the module it belongs to.
2. Ensure that only db-services within a module can access `PrismaService` (i.e., Prisma) directly.
3. Enforce that controllers and services in one module do not directly inject or call a db-service from another module.
4. Provide access to db-service results through the module's own service layer (using TypeScript getters or simple accessor methods where needed).
5. Standardise CRUD method naming conventions across all db-services.

---

## Affected Modules

| Module       | Db-Service to Create / Move                      | Notes                                                                                         |
|--------------|--------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `document`   | `DocumentDbService`                              | Move from `database` module; handles `Document` and `OcrResult` entities                     |
| `labeling`   | `LabelingDocumentDbService`                      | Move from `database` module                                                                   |
| `labeling`   | `LabelingProjectDbService`                       | Move from `database` module                                                                   |
| `group`      | `GroupDbService` (new)                           | Extract group/user-group queries currently inline in `DatabaseService`                        |
| `azure`      | `ClassifierDbService` (new)                      | Extract classifier model queries currently inline in `DatabaseService`                        |
| `hitl`       | `ReviewDbService`                                | Move from `database` module                                                                   |
| `benchmark`  | *(no new db-service)*                            | Currently injects `DatabaseService`; must be updated to use the relevant module services      |
| `training`   | *(no new db-service)*                            | Currently injects `DatabaseService`; must be updated to use the relevant module services      |
| `upload`     | *(no new db-service)*                            | Currently injects `DatabaseService`; must be updated to use the relevant module services      |

---

## Architectural Rules

### Prisma Access
- `DatabaseModule` is decorated with `@Global()`, making `PrismaService` available to any module in the application without requiring each module to explicitly import `DatabaseModule`.
- `AppModule` is the only module that imports `DatabaseModule`; all other modules receive `PrismaService` automatically through the global registration.
- No service, controller, or other class outside of a db-service may call `PrismaService` or `prisma` client directly.
- Each db-service injects `PrismaService` and exposes a `private get prisma()` getter (following the existing pattern in `DocumentDbService`).

> **Convention note (for developers and AI):** NestJS cannot enforce that only db-service classes inject `PrismaService` — the `@Global()` registration makes it available everywhere. The restriction is a **code-review and AI convention only**. When writing or reviewing code, any injection of `PrismaService` outside of a `*-db.service.ts` file must be flagged as a violation.

### Cross-Module Access
- A **controller** may import and call another module's **service** (non-db service). It must NOT inject another module's db-service.
- A **service** may import and call another module's **service** (non-db service). It must NOT inject another module's db-service.
- A **db-service** is only injected within its own module's service (and, where necessary, other services within the same module).

> **Watch item — circular module dependencies:** As modules begin importing each other's services, circular dependency errors may arise at startup. NestJS detects these at runtime. Monitor dependency relationships carefully during migration and restructure if a cycle is detected (e.g., by extracting shared logic to a third module).

### Intra-Module Access Pattern
- The module's primary service (e.g., `DocumentService`) injects the module's db-service(s).
- Where another module's service needs data owned by a different module, it calls that module's service, **not** its db-service.
- If a db-service method should not be exposed outside its module, it is either:
  - Kept `private` on the db-service class, or
  - Not surfaced via a getter/method on the module's service.
- Where the module's service needs to expose db-service results to other modules, it does so through simple TypeScript `get` accessors or thin public methods. These should be as minimal as possible.

### Module Configuration
- Each module declares its own db-service as a `provider` in its `@Module` decorator.
- Db-services are **not** exported from the module (to prevent cross-module injection of db-services).
- The module's primary service **is** exported, allowing other modules to access data through it.
- `DatabaseModule` is `@Global()` and retains only `PrismaService` as provider and export. No other module needs to import `DatabaseModule`.

### Type Colocation
- Types used by a db-service are defined in that db-service's file or in a sibling types file (e.g., `document-db.types.ts`) within the same module folder.
- Types are exported from the db-service or types file and re-exported from the module's service as needed for external consumers.
- `database.types.ts` is deleted after all types have been moved.

---

## CRUD Naming Conventions

All db-service methods must follow these naming conventions:

| Operation       | Convention              | Example                          |
|-----------------|-------------------------|----------------------------------|
| Create one      | `create{Entity}`        | `createDocument`                 |
| Find by ID      | `find{Entity}`          | `findDocument`                   |
| Find many       | `findAll{Entity}s`      | `findAllDocuments`               |
| Find with filter| `find{Entity}By{Field}` | `findDocumentByWorkflowId`       |
| Update          | `update{Entity}`        | `updateDocument`                 |
| Delete          | `delete{Entity}`        | `deleteDocument`                 |
| Upsert          | `upsert{Entity}`        | `upsertOcrResult`                |
| Check existence | `is{Condition}`         | `isUserInGroup`                  |

---

## Detailed Requirements

### R1 — document module: `DocumentDbService`
- Handles `Document` and `OcrResult` prisma models.
- Provides: `createDocument`, `findDocument`, `findAllDocuments`, `updateDocument`, `deleteDocument`, `findOcrResult`, `upsertOcrResult`.
- Lives at: `apps/backend-services/src/document/document-db.service.ts`.
- Registered as a provider in `DocumentModule`; **not** exported.
- `DocumentService` injects it and surfaces data accessors for other modules.
- Types (`DocumentData`) are defined in `apps/backend-services/src/document/document-db.types.ts`.

### R2 — labeling module: `LabelingDocumentDbService`
- Handles `LabelingDocument` prisma model.
- Provides: `createLabelingDocument`, `findLabelingDocument`, `updateLabelingDocument`.
- Lives at: `apps/backend-services/src/labeling/labeling-document-db.service.ts`.
- Registered as a provider in `LabelingModule`; **not** exported.
- Types (`LabelingDocumentData`) are defined in `apps/backend-services/src/labeling/labeling-document-db.types.ts`.

### R3 — labeling module: `LabelingProjectDbService`
- Handles `LabelingProject`, `FieldDefinition`, `LabeledDocument`, and label-related models.
- Provides: `createLabelingProject`, `findLabelingProject`, `findAllLabelingProjects`, `updateLabelingProject`, `deleteLabelingProject`, `createFieldDefinition`, `updateFieldDefinition`, `deleteFieldDefinition`, `createLabeledDocument`, `findLabeledDocument`, `findAllLabeledDocuments`, `deleteLabeledDocument`, `updateLabeledDocument`, `upsertDocumentLabels`, `deleteDocumentLabel`.
- Lives at: `apps/backend-services/src/labeling/labeling-project-db.service.ts`.
- Registered as a provider in `LabelingModule`; **not** exported.
- Types (`LabelingProjectData`, `LabeledDocumentData`) are defined in `apps/backend-services/src/labeling/labeling-project-db.types.ts`.

### R4 — group module: `GroupDbService` (new)
- Handles `UserGroup` and `User` prisma models related to group membership.
- Extracts methods currently in `DatabaseService`: `getUsersGroups`, `isUserInGroup`, `isUserSystemAdmin`.
- Provides: `findUsersGroups`, `isUserInGroup`, `isUserSystemAdmin`.
- Lives at: `apps/backend-services/src/group/group-db.service.ts`.
- Registered as a provider in `GroupModule`; **not** exported.
- `GroupService` injects it and exposes `isUserInGroup`, `isUserSystemAdmin`, and `findUsersGroups` as public methods for other modules that need membership checks.

### R5 — azure module: `ClassifierDbService` (new)
- Handles `ClassifierModel` prisma model.
- Extracts methods currently inline in `DatabaseService`: `createClassifierModel`, `updateClassifierModel`, `getClassifierModel`, `getClassifierModelsForGroups`.
- Renamed to standard conventions: `createClassifierModel`, `updateClassifierModel`, `findClassifierModel`, `findAllClassifierModelsForGroups`.
- Lives at: `apps/backend-services/src/azure/classifier-db.service.ts`.
- Registered as a provider in `AzureModule`; **not** exported.
- `ClassifierService` or `AzureService` injects it and exposes necessary accessor methods.

### R6 — hitl module: `ReviewDbService`
- Handles `ReviewSession`, `FieldCorrection`, and review analytics.
- Provides: `createReviewSession`, `findReviewSession`, `findReviewQueue`, `updateReviewSession`, `createFieldCorrection`, `findSessionCorrections`, `getReviewAnalytics`.
- Lives at: `apps/backend-services/src/hitl/review-db.service.ts`.
- Registered as a provider in `HitlModule`; **not** exported.
- Types (`ReviewSessionData`) are defined in `apps/backend-services/src/hitl/review-db.types.ts`.

### R7 — database module cleanup
- `DatabaseService` and all sub-db-service files are deleted from the `database` module folder only **after** every consumer has been migrated.
- Before deletion, verify that `benchmark`, `training`, and `upload` modules — all confirmed current users of `DatabaseService` — have been fully migrated to call the relevant module services instead.
- `DatabaseModule` is decorated with `@Global()` and retains only `PrismaService` as provider and export.
- `database.types.ts` is deleted after all types have been moved to the relevant module's types file.
- Only `AppModule` imports `DatabaseModule`; all other module files that currently import `DatabaseModule` solely for `PrismaService` are updated to remove that import.

### R8 — Transactions

#### `PrismaService` transaction wrapper
`PrismaService` exposes a `transaction()` helper that services use to define transaction boundaries without accessing Prisma directly:

```typescript
// prisma.service.ts
async transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return this.prisma.$transaction(fn);
}
```

#### db-service methods
All db-service methods accept an optional `tx?: Prisma.TransactionClient` as their last parameter. When provided, it is used instead of `this.prisma`. This is the standard signature for every db-service method:

```typescript
// document-db.service.ts
async updateDocument(
  id: string,
  data: Partial<DocumentData>,
  tx?: Prisma.TransactionClient,
): Promise<DocumentData> {
  const client = tx ?? this.prisma;
  return client.document.update({ where: { id }, data });
}
```

#### Service methods that touch data
Service methods that delegate to a db-service also accept an optional `tx?` and pass it straight through. They never query with `tx` directly:

```typescript
// document.service.ts
async archiveDocument(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await this.documentDb.updateDocument(id, { status: 'archived' }, tx);
}
```

#### Cross-module transactions
When an operation spans multiple modules, the owning service starts the transaction via `prismaService.transaction()` and passes `tx` to both its own db-service and to other modules' service methods:

```typescript
// labeling.service.ts — injects DocumentService (not DocumentDbService)
async deleteProjectWithDocuments(
  projectId: string,
  documentId: string,
): Promise<void> {
  await this.prismaService.transaction(async (tx) => {
    await this.labelingProjectDb.deleteLabelingProject(projectId, tx);
    await this.documentService.archiveDocument(documentId, tx);
  });
}
```

#### Rules summary
| Layer | May call `prismaService.transaction()`? | May accept `tx?`? | May query via `tx` directly? |
|---|---|---|---|
| Controller | No | No | No |
| Service | Yes | Yes (pass-through only) | No |
| Db-service | No (use `this.prisma.$transaction` for single-module atomicity) | Yes | Yes |

### R9 — Testing
- Each new or relocated db-service must have a corresponding unit test file (`*.spec.ts`) using mocked `PrismaService`.
- Existing unit tests for moved services must be updated to reflect new import paths.
- All tests must pass after migration.

---

## Out of Scope

- Changes to non-db-service business logic (no behaviour changes).
- Introducing a new shared data-access layer or repository pattern beyond what is described.
- Any frontend changes.
- Any changes to the Prisma schema.

---

## Open Questions / Gaps

- If any callers are found to use `DatabaseService`'s `get prisma()` getter directly, those usages must be migrated before `DatabaseService` is deleted. This is expected to be uncommon.
