# Backend catalog adoption — requirements

**Phase 1B item 1, workflow-builder.** Replace the per-app imperative
`activity-parameter-schema-registry.ts` validators with a thin adapter that
runs each activity's `@ai-di/graph-workflow` catalog Zod schema. One source
of truth (the catalog) for save-time, execute-time, and editor-time
parameter validation.

## Background — what triggered this

During the Phase 1A closeout walkthrough on 2026-05-23 (Playwright save
round-trip on `multi-page-report-workflow.json`), the V2 editor's
catalog-driven validation surfaced a real schema drift on
`document.validateFields`: the catalog entry was using a flat
`{ operation, fields, equals }` rule shape with `operator: "exact"`, but
the runtime activity expects a nested `{ expression: { ... } }` shape with
`operator: "equals"`. Fixed in `e99da4ef` and pinned with
`document-validate-fields.test.ts`.

The backend would **not** have caught this on save, because
`apps/backend-services/src/workflow/graph-schema-validator.ts` consults
`activity-parameter-schema-registry.ts`, which only validates
`data.transform`. Every other activity passes through save unvalidated.
The temporal worker has the same gap.

The `@ai-di/graph-workflow` catalog now has Zod schemas for all 41
activity types. Wiring the existing validator-options callback to the
catalog closes the drift class for the whole registry.

## Goals

1. Backend `validateGraphConfig` rejects per-activity parameter shapes
   that violate the catalog's Zod schema, with errors at
   `nodes.<id>.parameters.<path>` (matching the current path convention).
2. Temporal worker `validateGraphConfigForExecution` does the same.
3. The catalog-driven adapter is implemented once in
   `packages/graph-workflow` and consumed by backend, temporal, and the
   frontend's `useGraphValidation` hook — eliminating the triplicated
   "walk Zod issues into `GraphValidationError`" adapter.
4. The imperative `activity-parameter-schema-registry.ts` files (one in
   backend-services, one in temporal) are deleted. No shim.
5. The catalog's `data.transform` schema is tightened to mirror the
   runtime contract (JSON-parseable `fieldMapping`, single
   `{{payload}}` placeholder when `outputFormat === "xml"`) — the
   constraints the legacy imperative validator enforced.
6. A regression test pins the multi-page-report template's old legacy
   flat `validateFields` rule shape as a save-time rejection on the
   backend (mirrors the catalog test).

## Non-goals

- **No changes to the validator's interface or to `pollUntil` parameter
  validation behavior.** Today `pollUntil` activity-type registration is
  checked but its `parameters` are NOT run through
  `validateActivityParameters`. Closing that gap is a separate change
  to the shared validator; this work item keeps the surface identical
  and only swaps the implementation behind it.
- **No new validation rules beyond what the catalog already encodes** —
  this is a wiring change, not an audit of the 41 schemas. The only
  schema tightening is `data.transform` because it has existing
  imperative-validator behavior to preserve.
- **No backwards-compatibility shims.** Per `CLAUDE.md`: "When updating
  existing code, do not add backwards compatibility features."
- **No prisma changes.** This is pure validation wiring.

## Constraints

- `CLAUDE.md`: backend test changes are mandatory; run tests after each
  change; no `any` types; full Swagger remains.
- The `validateGraphConfig` shared signature must NOT change — both apps
  already pass the `ValidateGraphConfigOptions` callback object; we're
  just replacing what we hand to it.
- Error `path` shape must remain `nodes.<id>.parameters.<field>` so the
  frontend's `nodeIdFromPath` parser and the existing
  `errorsByNode` bucketing keep working.

## How we'll know we're done

- `npx jest src/catalog` (in `packages/graph-workflow`) still green and
  includes the new shared-adapter test.
- `npm test -- workflow` (in `apps/backend-services`) green, including
  the new multi-page-report legacy-shape regression.
- `npm test -- graph-schema-validator` (in `apps/temporal`) green.
- Backend save of the legacy flat `validateFields` rule shape returns
  HTTP 400 with a `nodes.<id>.parameters.rules.0.type` error path
  (or equivalent — the Zod error from the discriminated union of
  `field-match`/`arithmetic`/`array-match`).
- The two `activity-parameter-schema-registry.ts` files no longer exist.
