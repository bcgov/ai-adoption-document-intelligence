# Worklog — versions / list / runner (D31, D11, D33, D3-message)

2026-08-14 → 15. Four items from the developer's walkthrough review: the
compare-to-head view, what "restore an old version" actually does, search on the
workflows list, and the publish error that named an internal service.

Everything below was verified in the real browser (Playwright + the
`app-browser-auth` bypass) and, for the backend items, against the running dev
stack with `curl` + `psql`. No dependency was added; nothing was installed.

---

## D11 — "Restoring an old version just re-tags HEAD"

**The reviewer was right, and it was worse than a labelling problem.**

### What restore did (before)

`WorkflowService.revertHeadToVersion` performed exactly one write — it moved the
lineage pointer onto the existing old row:

```ts
// apps/backend-services/src/workflow/workflow.service.ts (previous revision)
const updated = await this.prisma.workflowLineage.update({
  where: { id: lineageId },
  data: { head_version_id: workflowVersionId },
  include: this.lineageWithHead,
});
```

No `workflowVersion.create`. So "revert to v1" left the lineage with two rows
(v1, v2) and head on v1 — exactly what the reviewer described.

**Evidence 1 — the API, against the running stack.** Demo lineage
`cmsmfxejp01l4ungcnfgnilrr` ("🎯 Demo — Versioning"), head on v2:

```
POST /api/workflows/<lineage>/revert-head {"workflowVersionId": <v1>}   → 200
psql: select id, version_number from workflow_versions …  → still 2 rows (v1, v2)
psql: select head_version_id from workflow_lineages …     → v1's id
```

### The part nobody had noticed: the next save then failed with a 500

`updateWorkflow` numbers a new version from the **head**, not from the maximum:

```ts
// workflow.service.ts:903 — the config-append path
const nextNum = current.headVersion.version_number + 1;
```

and `WorkflowVersion` carries `@@unique([lineage_id, version_number])`
(`apps/shared/prisma/schema.prisma:225`). With head parked on v1 while v2
existed, the next save asked Postgres for a second `(lineage, 2)`.

**Evidence 2 — reproduced on the dev stack, before any change**
(`PUT /api/workflows/<lineage>` with a changed config, `expectedVersion: 1`):

```
HTTP 500  {"statusCode":500,"message":"Internal server error"}
```

`logs/backend-services.log`, same requestId, three passes of the retry loop:

```
Appending workflow version for lineage cmsmfxejp…: 1 -> 2
Workflow version append hit unique constraint (concurrent update); retrying (1/3)
Appending workflow version for lineage cmsmfxejp…: 1 -> 2
… retrying (2/3)
code: 'P2002',
originalMessage: 'duplicate key value violates unique constraint
                  "workflow_versions_lineage_id_version_number_key"'
```

So restoring an older version silently made the workflow unsaveable until head
was moved forward again. The retry loop cannot help: nothing about the situation
changes between attempts.

### Which of the two documents was right

- `docs-md/workflows/GALLERY.md:508` (the walkthrough the reviewer followed):
  *"Revert to this version brings an old one back — as a **new** version, so the
  history stays honest."* — describes append.
- `docs-md/workflows/WORKFLOW_LINEAGE_AND_VERSIONS.md:15` (the design doc):
  *"sets **head only**"* — describes the pointer move.

They contradicted each other. The tie-break is not editorial: only the append
reading keeps head at the highest version number, which is the invariant the
rest of the versioning code already assumes (`nextNum = head + 1`). **So the
behaviour was wrong, and it is the behaviour that changed.**

### What changed

`apps/backend-services/src/workflow/workflow.service.ts:1417` —
`revertHeadToVersion` now, in one transaction: copies the selected version's
config (re-stamped via `stampConfigWithPersistedHash`), creates a new version
row at `head.version_number + 1`, points head at it, and audits with both
versions in the payload (`workflow_version_id` + `version_number` for the new
one, `restored_from_version_id` + `restored_from_version_number` for the
source). The source row is untouched, so its run counts stay attached to the
version that produced them. P2002 retry mirrors the append path; exhaustion
raises a 409 that says the workflow changed underneath you.

`apps/backend-services/src/workflow/workflow.controller.ts:907` — Swagger for
`POST :id/revert-head` rewritten (summary + `description` + a described
`@ApiOkResponse` stating that `version` is the NEW number, plus
`@ApiConflictResponse` for the retry-exhausted case).

**The UI half** (minimal touch to a shared file — `WorkflowEditorV2Page.tsx`,
which another agent also has open; only the confirm-modal copy and the success
notification, lines 1519–1545):

- Confirm modal: *"v1, created …, will be copied forward as a new version and
  become the head. Nothing in the history is removed."*
- Success toast now reads the NEW version off the mutation response:
  **`Restored v1 as v3`** — *"The editor is on v3, a new version holding v1's
  steps. v1 is still in the history."* The old toast said "Reverted to v1",
  which is precisely what read as a re-tag.

**Evidence 3 — end to end in the browser** (Versioning demo → More ▸ History →
Revert on v1 → confirm):

```
notification: "Restored v1 as v3
               The editor is on v3, a new version holding v1's steps.
               v1 is still in the history."
history rows: V3 HEAD 0 RUNS (Aug 14, 2026, 11:51 PM)
              V2       0 RUNS (Aug 9, 2026, 4:35 PM)
              V1       0 RUNS (Aug 9, 2026, 4:35 PM)
```

**Evidence 4 — the 500 is gone.** On a throwaway lineage (created and deleted
through the API): create v1 → save v2 → restore v1 (`response version = 3`, DB
rows 1,2,3, head = v3) → save again → **HTTP 200**, v4 appended.

Dev-DB hygiene: the demo lineage was returned to its seeded state (v3 deleted,
head back on v2) and the throwaway lineage deleted.

Docs: `WORKFLOW_LINEAGE_AND_VERSIONS.md` lines 5 + 15 rewritten (with the
reason), `MANUAL_TEST_PLAN.md` 12.2 now tells the tester to save immediately
after a restore. `GALLERY.md` was already correct and was not touched (another
agent is working in it).

**Tests** — `apps/backend-services/src/workflow/workflow.service.spec.ts`, new
`describe("revertHeadToVersion")`: creates a new row at head+1 carrying the
restored config; head points at the new row and never back; the source row is
untouched; audit names both versions; a version from another lineage is
refused; a P2002 from a concurrent save is retried.

---

## D31 — Compare to Head should show a real diff

**Dependency decision:** none added. `apps/frontend/package.json` has no diff
library (`diff`, `jsondiffpatch`, `react-diff-viewer` — all absent), and a text
diff would be the wrong tool anyway: config objects have no meaningful key
order, so a line diff reports moves as changes. Written as a structural diff
instead, per the brief's fallback.

**New:** `apps/frontend/src/features/workflow-builder/versioning/config-diff.ts`
— walks both configs to their leaves and compares leaf by leaf. Array elements
are indexed (`edges[1].to`) so a new edge is attributable. Object-vs-scalar is
one `changed` entry, not a pile of adds/removes. A subtree present on one side
expands into its own leaves, so "this node only exists in head" lists the
fields it adds. `metadata.configHash` is excluded as derived (it changes on
every save and turned "1 changed field" into "2, one of them a 64-char hash");
the modal states the exclusion rather than hiding it.

**Changed:** `CompareToHeadModal.tsx` — two tabs. **Changes** (default) renders
the diff: a summary line (`2 changed fields of 78.`), one bordered row per
difference with a kind badge, the path in `<Code>`, and both values labelled
`v1:` / `head (v2):`; unchanged fields collapse behind *"Show 76 unchanged
fields"*. **Both versions in full** is the original side-by-side JSON, kept
because "show me everything" is a real need — same `compare-left-json` /
`compare-right-json` testids, unchanged. Modal title now names both versions
("Compare v1 to head (v2)").

**Browser-verified** on the Versioning demo:

```
summary : "2 changed fields of 78."   (before excluding configHash)
rows    : nodes.submit.label — v1: "Submit to Azure OCR"
                               head (v2): "Submit to Azure OCR (v2 — edited)"
toggle  : "Show 76 unchanged fields"
```

**Tests** — new `__tests__/config-diff.test.ts` (12 cases: retuned parameter,
node added, node removed, indexed edges, key-order insensitivity, empty
containers, shape change, null, derived-field exclusion, three headline
wordings) and five new cases in `__tests__/CompareToHeadModal.test.tsx` (opens
on Changes; one row per difference with both values; unchanged collapsed by
default; identical-config state; loading + error on the diff tab). The existing
US-084 scenarios still assert the full-JSON tab and pass unchanged.

---

## D33 — The workflows list needs a search bar

**Client-side, and here is why:** `useWorkflows` fetches the group's whole list
in one request — `GET /api/workflows` has no page/limit parameter — so every row
the filter could match is already in memory. A request per keystroke would add
latency and a loading flicker to a list that is fully loaded. (Measured on the
dev stack: 35 workflows.) If that list ever grows past a few hundred, the
honest fix is server-side paging for the whole page, not search alone.

**Pattern followed, not invented:** `SearchField` from `../ui` (BC DS
`TextField` + search icon), the same component and shape as
`features/tables/pages/TablesListPage.tsx:55` and
`components/group/GroupsTable.tsx:131` — case-insensitive substring, filtered
count in the table caption.

`apps/frontend/src/pages/WorkflowListPage.tsx:101` — `filteredWorkflows` matches
name, slug and description (the three columns people scan). Caption becomes
`1 of 35 workflows match "versioning"` while filtering. Empty result
(`:284`) names the term, points at the Workflows/Libraries/All filter as the
usual reason a workflow is missing, and offers **Clear search**; the box stays
mounted so the term can be edited rather than retyped. The pre-existing
"no workflows at all" empty state is untouched.

**Browser-verified:** 35 rows → typing `versioning` → 1 row, caption
`1 of 35 workflows match "versioning"`; typing `zzzz` → the empty state with
Clear search; no page errors.

**Tests** — six new cases in `WorkflowListPage.test.tsx` (renders the box;
filters by name case-insensitively; filters by slug and by description;
caption counts; empty state + clear; and one that asserts **no additional
`apiService.get` call** while filtering, which is the client-side claim made
executable).

---

## D3 (second half) — the publish error named an internal service

**What the reviewer saw:** `Publish failed — Failed to reach deno-runner /check
at http://localhost:9099 — see error markers.` Produced at
`apps/backend-services/src/dynamic-nodes/deno-runner.client.ts` (four throw
sites) and passed through to the notification verbatim.

**Changed** — the message is now built where the URL is known, and the URL is
demoted to a details line:

- `deno-runner.client.ts:57` `denoRunnerUnavailableMessage(baseUrl)` — the
  instruction depends on where the runner is expected to live. A loopback URL
  means a developer's own machine, so it names the command:
  *"The custom-node checker is not running, so this script could not be
  type-checked. Start it with `docker compose -f
  deployments/local/docker-compose.deno.yml up -d`, then publish again."*
  Any other URL is a deployed sidecar the caller cannot start, so it says
  retry-then-escalate. Neither wording contains a URL.
- `deno-runner.client.ts:76` `DenoRunnerUnavailableError` now carries
  `details` (endpoint + URL + underlying failure) alongside the human `message`.
- `deno-runner.client.ts:193` a private `unavailable()` helper builds the error
  **and logs the diagnostic at WARN**, so the technical detail survives even
  though it is no longer the headline.
- `dynamic-nodes.controller.ts` — the 503 body is now
  `{ code, message, details }`, with a dedicated
  `DenoRunnerUnavailableResponseDto` (`dto/deno-runner-unavailable-response.dto.ts`,
  every field `@ApiProperty`-documented) wired into both
  `@ApiServiceUnavailableResponse` decorators via `type`.

**Verified against the running stack** — deno-runner container stopped, a valid
script published, container restarted (down for ~10 seconds):

```json
HTTP 503
{"code":"DENO_RUNNER_UNAVAILABLE",
 "message":"The custom-node checker is not running, so this script could not be
            type-checked. Start it with `docker compose -f
            deployments/local/docker-compose.deno.yml up -d`, then publish again.",
 "details":"POST http://localhost:9099/check could not be reached: fetch failed"}
```

and in `logs/backend-services.log`:

```
WARN [DenoRunnerClient] deno-runner unavailable —
     POST http://localhost:9099/check could not be reached: fetch failed
```

**Left for whoever owns the dynamic-nodes editor** (`DynamicNodeEditor.tsx:234`,
another agent's surface, deliberately not touched): it appends
`" — see error markers"` to every publish failure, including this one, where
there are no markers to see. It also ignores `error.body.details`, which is now
available and would make a good second line under the headline.

**Tests** — four new cases in `deno-runner.client.spec.ts` (loopback wording
carries the command and no URL; deployed wording says retry/escalate and no
`docker compose`; `details` carries endpoint + cause on a network failure;
`details` carries the status on a non-2xx while the message does not) and one in
`dynamic-nodes.controller.spec.ts` asserting the 503 body puts the instruction
in `message` and the URL in `details`. The two existing specs that constructed
`DenoRunnerUnavailableError` with a bare string were updated to the new shape.

---

## Test output

Backend (`apps/backend-services`, jest):

```
npx jest src/workflow/workflow.controller.spec.ts src/workflow/workflow.service.spec.ts \
         src/dynamic-nodes/deno-runner.client.spec.ts \
         src/dynamic-nodes/dynamic-nodes.controller.spec.ts \
         src/dynamic-nodes/dynamic-nodes.service.spec.ts

Test Suites: 5 passed, 5 total
Tests:       264 passed, 264 total
```

Frontend (`apps/frontend`, vitest):

```
npx vitest run src/features/workflow-builder/versioning/ src/pages/WorkflowListPage.test.tsx
Test Files  6 passed (6)
     Tests  62 passed (62)

npx vitest run src/features/workflow-builder/WorkflowEditorV2Page.test.tsx
Test Files  1 passed (1)
     Tests  127 passed (127)
```

`npx tsc --noEmit` clean in both apps; biome clean on every file touched.

**One caveat about earlier runs in this session, so nobody re-investigates it:**
between roughly 23:45 and 01:00 the box sat at load 140–163 on 20 cores (several
agents running suites at once) and both runners produced timeout failures — a
5-second jest timeout in `workflow.controller.spec.ts`'s upload-ceiling test
(unrelated to anything here) and a scatter of vitest timeouts. Every one of them
passed on re-run once load dropped; the numbers above are from the quiet runs.
No Playwright e2e suite was run.

## Files touched

Backend
- `apps/backend-services/src/workflow/workflow.service.ts` (restore appends)
- `apps/backend-services/src/workflow/workflow.controller.ts` (Swagger)
- `apps/backend-services/src/workflow/workflow.service.spec.ts`
- `apps/backend-services/src/dynamic-nodes/deno-runner.client.ts`
- `apps/backend-services/src/dynamic-nodes/deno-runner.client.spec.ts`
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.ts`
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.controller.spec.ts`
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.spec.ts`
- `apps/backend-services/src/dynamic-nodes/dto/deno-runner-unavailable-response.dto.ts` (new)

Frontend
- `apps/frontend/src/features/workflow-builder/versioning/config-diff.ts` (new)
- `apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx`
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/config-diff.test.ts` (new)
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/CompareToHeadModal.test.tsx`
- `apps/frontend/src/features/workflow-builder/versioning/__tests__/revert-flow.test.tsx`
- `apps/frontend/src/pages/WorkflowListPage.tsx`
- `apps/frontend/src/pages/WorkflowListPage.test.tsx`
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — **shared
  file, minimal touch**: the revert confirm copy and success toast only (D11's
  visible outcome). Nothing else in that file was changed.

Docs
- `docs-md/workflows/WORKFLOW_LINEAGE_AND_VERSIONS.md` (restore semantics + why)
- `docs-md/workflows/DYNAMIC_NODES_DESIGN.md` (§5.1 — the 503 shape)
- `docs-md/workflows/MANUAL_TEST_PLAN.md` (10.2a search, 12.2 restore, 12.3 diff)
