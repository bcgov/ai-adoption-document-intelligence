# Phase 2 Track 3 — Versioning UI

**Workflow-builder Phase 2, last of three tracks.** Surfaces
[the backend's existing `WorkflowVersion` lineage model](../../apps/shared/prisma/schema.prisma#L182)
on the V2 editor: a version-history drawer, revert-to-version,
compare-to-head, per-version Test-run, and library version-pinning
on `childWorkflow` nodes. Closes Phase 2 (library workflows +
workflow-as-API + versioning) and unblocks Phase 3 (typed I/O)
together with Track 2.

## Background

[IMPLEMENTATION_PLAN.md §5 Phase 2](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md#phase-2--library-workflows--workflow-as-api--versioning)
splits Phase 2 into three tracks:

1. **Track 1 — Library workflow management.** Closed 2026-05-26.
   See `../20260526-workflow-builder-phase2-library-workflows/`.
2. **Track 2 — Workflow-as-API surfacing.** Closed 2026-05-23.
   See `../20260527-workflow-builder-phase2-workflow-as-api/`.
3. **Track 3 — Versioning UI.** (This document.)

The backend already maintains immutable versions per
`WorkflowLineage` (every Save creates a new `WorkflowVersion` row;
`WorkflowLineage.head_version_id` points at the active one). The
plumbing landed in earlier work:

- `GET /api/workflows/:id/versions` — list versions newest-first
  (`useWorkflowVersions` hook wired)
- `POST /api/workflows/:id/revert-head` — set head to an existing
  version (`useRevertWorkflowHead` hook wired)
- `POST /api/workflows/:id/runs` already accepts `workflowVersionId`
  in the body (Track 2 just always omits it — defaults to head)
- `getWorkflowGraphConfig` activity already resolves a
  `WorkflowVersion.id` as its first lookup attempt, so library
  childWorkflow nodes that pass a version-pinned id will execute
  that specific version

Track 3 is the UI surface for all of the above, plus the small
shared-schema + backend changes needed to make version-pinning
correct.

## Locked decisions (made by the user via session-start questions)

These were resolved with the user at session kickoff. Each decision
is recorded with its rationale so a future session can re-litigate
if circumstances change.

### D1 — Compare-to-version is side-by-side `JsonInput` blocks (no diff)

The version-history drawer's "Compare to head" action opens a
modal (or pushes a side panel inside the drawer) with two read-only
Mantine `<JsonInput>` blocks: left = the selected version's
config, right = the current head's config. No line-level or
structural diff in Track 3.

**Why:** A real diff is a meaningfully larger surface (text diff
library + colourisation + scroll-sync; or a graph-structural diff
that knows about node/edge IDs). The user explicitly chose the
simplest option to keep Track 3 scope tight; a structural diff is
filed for Phase 4 (try-in-place) where it composes with per-node
run state.

### D2 — `GET /api/workflows/:id/run-spec` accepts `?workflowVersionId=`; `POST /runs` validates against the *selected* version

The Run drawer gets a "Version" `<Select>` (defaults to head).
When the user changes the version, the drawer refetches the
run-spec for that specific version so the schema table and
prefilled JSON stay correct. The same `workflowVersionId` is also
sent in the `POST /runs` body, and the backend validates
`initialCtx` against the *selected version's* derived input schema
(not head's).

**Why:** Inputs can change across versions (the user might rename
a ctx key, flip `isInput`, or add/remove inputs). Showing the
head's schema while running an older version would lie about the
contract. Backend validation against the selected version closes
the loop — without it, a body that's invalid for the selected
version but valid for head would be accepted.

**Implementation:** Extend Track 2's `buildRunSpec` /
`deriveInputSchema` (already pure helpers) to accept a `config`
loaded from any version. Add a `workflowVersionId?: string` query
param to the controller; resolve via the existing
`resolveLineageAndVersion(id, workflowVersionId?)` helper that's
already used by `POST /runs`.

### D3 — Library version-pinning happens inside the picker; default = head

The `LibraryPickerModal` grows a "Version" `<Select>` in the same
modal. Default value is "head". On confirm, the modal stamps
`workflowRef = { type: "library", workflowId, version?: number }`
— `version` set only when the user explicitly picked a specific
version (not when they left it at "head"). Existing
`{ type: "library", workflowId }` shapes continue to mean "head".

The `ChildWorkflowNodeSettings` signature summary shows the
pinned version inline (e.g., a small `<Badge>` reading `v3` or
`head`) and a button to re-open the picker.

**Why:** Two-step flows (pick library, then pick version
separately) feel like a bug to the author and split a single
decision across two UI surfaces. Default-to-head keeps the
existing flow's ergonomics (no extra clicks for the common case);
the optional `version?` keeps the schema backwards compatible
(no `null` sentinels in the JSON, smaller diff, all existing
configs validate unchanged).

### D4 — Version-history button placement: top bar, between "Save" and "Run this workflow"

A new top-bar button labelled "History" (icon: clock-rewind), placed
in `WorkflowEditorV2Page` between "Save" and "Run this workflow".
Disabled in create mode (no `workflowId` yet) with a tooltip
explaining "Save the workflow first." Opens the version-history
drawer on the right side (matches the existing Settings and Run
drawers — single side-rail for consistency).

**Why:** The history affordance is a peer of Save / Run / Save-as-
library / Settings, not a deeply-nested action. Mantine right-side
drawers are the established pattern for these editor sub-surfaces;
introducing a left-side or modal flavor for one would fragment the
mental model.

### D5 — Compare and Run-with-version need a new `GET /api/workflows/:id/versions/:versionId` endpoint that returns the full version config

`listVersions` only returns summaries (`id`, `versionNumber`,
`createdAt`); it doesn't include the JSON `config`. Compare-to-head
and Run-drawer's per-version spec refetch both need that config (the
spec refetch can derive from `?workflowVersionId=` on `/run-spec`
without exposing the raw config; Compare cannot).

The new endpoint returns the full `WorkflowInfo` for the targeted
version (mirrors `GET /api/workflows/:id`, but anchored to a
specific `WorkflowVersion.id` instead of the lineage's head).

**Why:** Keeping `listVersions` as a thin summary avoids paying
the JSON config cost for every row in the history drawer. The full
fetch is on-demand per-version when the author asks to compare.
The shape symmetry with `GET /api/workflows/:id` keeps the
frontend code straightforward — same `WorkflowInfo` consumer can
render either head or a specific version.

## Scope (what we build)

### Shared schema (`packages/graph-workflow`)

1. **`ChildWorkflowNode.workflowRef.library`** extended with
   optional `version?: number`. New shape:
   ```typescript
   workflowRef:
     | { type: "library"; workflowId: string; version?: number }
     | { type: "inline"; graph: GraphWorkflowConfig };
   ```
   Validator accepts the new field as declarative metadata
   (existing configs without `version` validate unchanged).
   Unit test confirms acceptance of both shapes.

### Backend (`apps/backend-services`)

1. **`GET /api/workflows/:id/versions/:versionId`** — returns the
   full `WorkflowInfo` for the targeted version (config + metadata).
   Uses the existing `workflowService.getWorkflowVersionById` (was
   present but unexposed). Authorized via `Identity({ allowApiKey:
   true })`; group-membership check. Returns 404 if the version
   doesn't exist or doesn't belong to the lineage `:id`.

2. **`GET /api/workflows/:id/run-spec`** extended to accept an
   optional `?workflowVersionId=` query param. When provided,
   validates the version belongs to the lineage (400 if not),
   resolves the spec against that version's config (rather than
   head). All existing call sites unchanged — when the param is
   omitted, behaviour is identical to today.

3. **`POST /api/workflows/:id/runs`** updated so `initialCtx`
   validation uses the *selected* version's derived schema
   (today it uses head's schema even when `workflowVersionId` is
   set). One-line bugfix-shaped change; new test case covers
   "old version expected fewer inputs than head → body that's
   missing head's new required input is still accepted when
   running the old version."

4. **Engine support for `workflowRef.library.version`** in the
   `childWorkflow` node executor (`apps/temporal/src/graph-engine/
   node-executors.ts`). When `version` is set, resolve it to a
   specific `WorkflowVersion.id` (the lineage `workflowId` + the
   pinned `version` number → exact id) and pass that id to
   `getWorkflowGraphConfig` (which already prefers
   `WorkflowVersion.id` over lineage). When `version` is undefined,
   pass `workflowId` as today (resolver falls through to head).
   New unit test in `node-executors` against an inline mock
   activity proxy.

5. **Full Swagger DTOs + Vitest coverage** per CLAUDE.md.
   `WorkflowVersionInfoResponseDto` (or reuse `WorkflowResponseDto`
   if symmetric), `?workflowVersionId=` `@ApiQuery`. Specific
   decorators (`@ApiOkResponse`, `@ApiNotFoundResponse`,
   `@ApiBadRequestResponse`, …). Supertest happy-path + 404 +
   auth-required + cross-lineage-version-id 400.

### Frontend (`apps/frontend`)

1. **`VersionHistoryDrawer`** (new component in
   `apps/frontend/src/features/workflow-builder/versioning/`).
   Right-side Mantine `<Drawer>` opened from a new "History" top
   bar button. Renders:
   - A header with the workflow's name + version count.
   - A list (newest-first) of `useWorkflowVersions(lineageId)`
     rows. Each row:
     - Version number badge (e.g., `v7`).
     - Created-at timestamp (Mantine's `useDateFormatter` or
       date-fns formatter — match Track 2 conventions).
     - A **"head"** `<Badge color="blue">` next to the row whose
       `id === workflow.workflowVersionId` (the lineage's current
       head).
     - **Action buttons:**
       - "Revert to this version" — disabled on the head row
         (tooltip "Already the head").
       - "Compare to head" — disabled on the head row
         (tooltip "This is the head — nothing to compare").
   - Loading state: Mantine `<Skeleton>` rows.
   - Empty state (no versions): plain text "No versions yet —
     save the workflow first."
   - Error state: red `<Alert>` with the fetch error message.

2. **Revert-confirmation flow.** Clicking "Revert to this version"
   opens a Mantine `modals.openConfirmModal` warning:
   > "Reverting will replace the current head with v{n}, created
   > {timestamp}. Any unsaved canvas changes will be discarded.
   > Continue?"

   On confirm, calls `useRevertWorkflowHead({ lineageId,
   workflowVersionId })`. On success: invalidates the workflow
   query, reloads the editor's `useWorkflow(lineageId)`, the
   canvas state replaces with the reverted head's config, the
   drawer closes, and a green Mantine notification fires
   ("Reverted to v{n}").

3. **Compare-to-head modal.** Clicking "Compare to head" opens a
   Mantine `<Modal size="80%">` with two side-by-side read-only
   Mantine `<JsonInput>` blocks. Left column header: "v{n} — {iso
   timestamp}". Right column header: "head (v{head} — {iso
   timestamp})". Both JsonInputs `formatOnBlur` + `autosize` +
   `maxRows={40}` for usability. Fetches the selected version
   via `useWorkflowVersion(lineageId, versionId)` (new hook
   wrapping `GET /:id/versions/:versionId`).

4. **`RunWorkflowDrawer` version selector.** Add a Mantine
   `<Select>` to the Test-run section, labelled "Version", placed
   above the JsonInput. Options: one per version in
   `useWorkflowVersions`, label `v{n} — head` for the head row,
   `v{n}` for others. Default selected: head's id. Changing the
   selection:
   - Refetches `useWorkflowRunSpec(lineageId, { workflowVersionId
     })` (the hook adds the optional query param).
   - Re-derives the prefilled JSON stub from the new spec.
   - On Run, includes `workflowVersionId` in the
     `useStartWorkflowRun` mutation body.

5. **`LibraryPickerModal` version Select.** After the user picks a
   library row, the modal reveals (or always shows) a "Version"
   `<Select>` populated from `useWorkflowVersions(libraryWorkflowId)`.
   Default option: "head" (special-cased — not a real
   `WorkflowVersion.id`; on confirm we omit `version`). Other
   options: `v{n} — {date}` keyed by version number. On confirm,
   the modal returns `{ workflowId, version?: number }`. The
   confirm button stays disabled until a library is selected.

6. **`ChildWorkflowNodeSettings` signature summary update.** The
   library-branch signature summary shows the pinned version
   inline:
   - When `workflowRef.version` is undefined: a `<Badge
     color="gray">head</Badge>` next to the library name.
   - When `workflowRef.version === N`: a `<Badge color="blue">v{N}
     </Badge>`.
   A small "Change version" button next to the badge re-opens
   `LibraryPickerModal` pre-seeded with the current library
   selection.

7. **Top-bar "History" button** in `WorkflowEditorV2Page`, placed
   between "Save" and "Run this workflow". Icon: `IconHistory`
   from `@tabler/icons-react`. Disabled in create mode (tooltip:
   "Save the workflow first"). Opens `VersionHistoryDrawer`.

### Verification

- **Shared package Vitest** for the validator accepting both
  `workflowRef.library` shapes (with and without `version`).
- **Backend Vitest + supertest** for:
  - `GET /:id/versions/:versionId` happy path returns config
  - `GET /:id/versions/:versionId` 404 for unknown version
  - `GET /:id/versions/:versionId` 404 for version not in this
    lineage
  - `GET /:id/run-spec?workflowVersionId=<old>` returns the old
    version's derived schema (different from head when head
    added a new input)
  - `POST /:id/runs` with `workflowVersionId` validates against
    that version's schema (regression case: head requires `foo`
    that old version didn't, body without `foo` is accepted when
    running old)
  - `childWorkflow` executor unit test against a mock activity
    proxy: `workflowRef = { type: "library", workflowId, version:
    3 }` resolves to the lineage's version-3 `WorkflowVersion.id`
    and passes it to `getWorkflowGraphConfig`
- **Frontend Vitest** for:
  - `VersionHistoryDrawer` — renders rows + head badge; revert
    button disabled on head; confirm-modal wired; compare opens
    the modal with two JsonInputs
  - `RunWorkflowDrawer` — version select changes the spec fetch
    + body's `workflowVersionId`
  - `LibraryPickerModal` — version select default "head" + stamps
    `version?` only when explicit; confirm button gating
  - `ChildWorkflowNodeSettings` — head badge vs v{n} badge
- **Playwright walkthrough** (per `app-browser-auth` skill against
  the live dev server with the seed-default API key):
  - Open History drawer for a workflow with 2+ versions. Confirm
    head badge on the right row.
  - Click Compare to head on an older version — modal opens, two
    JsonInputs render the two configs.
  - Click Revert to this version on an older version. Confirm
    modal warning. After confirm, the canvas reflects the
    reverted config and the older row now has the head badge.
  - Open Run drawer, pick an older version from the version
    `<Select>`, observe the schema rows + prefilled JSON change.
    Click Run; observe a workflowId in the response.
  - Open LibraryPickerModal in a childWorkflow node. Select a
    library, then pick `v2` from the Version select. Confirm.
    Save the parent workflow. Reload the editor. Confirm the
    `v2` badge persists in `ChildWorkflowNodeSettings`.

## Out of scope (filed for later)

- **Structural / semantic diff** between two configs (Phase 4 or
  later — composes with per-node run state).
- **Per-version annotations / tags / changelog entries** (not in
  the schema today; future enhancement).
- **Delete-version / squash-versions actions** — versions stay
  immutable per the existing backend model. The closest action is
  Revert; deletion is a separate model change.
- **Run history per workflow / per version** — deferred from
  Track 2 already to Phase 4 try-in-place.
- **Library `metadata.inputs[].path` depth-check in the
  validator** — Phase 3 typed I/O.
- **Showing per-version run counts / last-run timestamp** in the
  history drawer — requires Phase 4's run history endpoint.

## Open considerations (not blocking)

- **Unsaved-changes warning before revert.** The confirm modal's
  copy ("Any unsaved canvas changes will be discarded") is shown
  unconditionally; the editor doesn't currently track an
  "in-flight unsaved" flag. Adding that flag is a worthwhile
  follow-up but not blocking for Track 3 — the warning is
  truthful regardless.
- **`workflowVersionId` cross-lineage validation.** The backend
  already validates this for `POST /runs`; reuse the same helper
  for `GET /:id/run-spec?workflowVersionId=` and `GET
  /:id/versions/:versionId` (return 400 / 404 respectively).
- **Logging.** Compare and per-version run-spec fetches are
  read-only; no extra logging needed beyond existing request-level
  HTTP logs. Revert continues to log at info level via the
  existing service method.
- **Library picker pre-fetch.** `useWorkflowVersions(libraryId)`
  fires inside the modal when a library is selected. There's a
  brief flash before the version list resolves — show a small
  Mantine `<Loader size="xs" />` next to the disabled
  `<Select>` until the fetch resolves.
