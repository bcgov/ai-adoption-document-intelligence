NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Phase 1B — Backend catalog adoption

| File | Title |
|---|---|
| [US-015-shared-catalog-parameter-validator.md](./US-015-shared-catalog-parameter-validator.md) | Shared catalog-driven `validateActivityParameters` adapter |
| [US-016-tighten-data-transform-catalog.md](./US-016-tighten-data-transform-catalog.md) | Tighten `data.transform` catalog schema to match runtime contract |
| [US-017-backend-validator-consumes-catalog.md](./US-017-backend-validator-consumes-catalog.md) | Backend save-time validator consumes the catalog |
| [US-018-temporal-validator-consumes-catalog.md](./US-018-temporal-validator-consumes-catalog.md) | Temporal worker validator consumes the catalog |
| [US-019-frontend-uses-shared-adapter.md](./US-019-frontend-uses-shared-adapter.md) | Frontend `useGraphValidation` consumes the shared adapter |
| [US-020-multi-page-report-legacy-rejection.md](./US-020-multi-page-report-legacy-rejection.md) | Regression: backend rejects the legacy flat `validateFields` shape |

## Suggested Implementation Order

- [x] **US-015** — Shared adapter in `@ai-di/graph-workflow`; foundation for everything else.
- [x] **US-016** — Tighten `data.transform`; required before US-017/US-018 spec updates so behavior is preserved.
- [x] **US-017** — Backend `graph-schema-validator` adopts catalog; deletes `activity-parameter-schema-registry.ts`.
- [x] **US-018** — Temporal `graph-schema-validator` adopts catalog; deletes `activity-parameter-schema-registry.ts`.
- [x] **US-019** — Frontend `useGraphValidation` switches to the shared adapter.
- [x] **US-020** — Regression test pinning the legacy flat `validateFields` shape rejection on the backend.
