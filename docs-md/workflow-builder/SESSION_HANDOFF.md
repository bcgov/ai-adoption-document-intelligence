# Session Handoff — Visual Workflow Builder

**Written:** 2026-05-22.
**For:** the next Claude Code session picking up this work.
**Purpose:** explain everything that's been decided, what's been built, what's running, what's next.

---

## TL;DR for the next AI

Alex is building a visual workflow editor on top of Dylan's shared `@ai-di/graph-workflow` package. He's been working with me to plan and start implementing. We're partway into **Milestone 1 of Phase 1A** — a tracer page that renders activity-parameter forms from Zod schemas. Three activity schemas exist; the form renderer works; the dev preview page is wired at `/workflows/dev-form-preview`.

He hit a problem inspecting the page (his chrome-devtools MCP server got added mid-session and the tool schemas weren't in my session's index). He's likely about to restart Claude Code to pick this up fresh.

**The plan, in full, lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Read that first.** All the architectural decisions and the phased plan are there. [NOTES.md](NOTES.md) has the supporting context (Alex's walking-notes vision, designer conversation outcomes, research). [TYPED_IO_BRAINSTORM.md](TYPED_IO_BRAINSTORM.md) is a parked placeholder for the deferred typed-artifacts question.

---

## How Alex wants to work

Critical preferences he's already stated — honour these:

1. **Don't dump intermediate code/text at him.** Only surface clickable milestones. He explicitly said *"How am I supposed to verify what you just did? I'm not reviewing code at this phase, tell me when there's something I can play around with."* Don't ask for review of schemas, types, or files unless he can run something and see the effect.
2. **Stop pinging him with mid-work updates.** End-of-turn summary should be terse and only when the milestone is interactive.
3. **Work milestone-by-milestone.** The three Milestones for Phase 1A are listed in [IMPLEMENTATION_PLAN.md §4](IMPLEMENTATION_PLAN.md). Milestone 1 was the form-renderer demo (in progress / mostly done — see "Current state" below). Milestone 2 is editor skeleton with one activity end-to-end. Milestone 3 is full Phase 1A.
4. **Locked decisions are locked.** Don't re-raise the typed-I/O question, the single-in/single-out question, the "shared package vs sibling" question, or the "Zod v4 vs Zod 3" question. All resolved in [IMPLEMENTATION_PLAN.md §3](IMPLEMENTATION_PLAN.md).
5. **Don't ping Dylan about AI-1192.** Just work on top of his branch.
6. **He prefers Chrome DevTools MCP over Playwright** for browser inspection. If a chrome-devtools tool is available in your session, use that.

---

## Branch + git state

- **Branch:** `feature/visual-workflow-builder`, cut from `origin/AI-1192` (Dylan's shared-package consolidation; **not yet merged to develop**).
- **There is a pre-existing commit on this branch — `b86741c7` "deps: pin cross-platform native binaries in root optionalDependencies"** — made by Alex earlier in this session. Its commit message explicitly says **this change is unrelated to the workflow builder and should land as its own PR against develop. Cherry-pick onto a dedicated branch before opening the workflow-builder PR.** Don't bundle it.
- The workflow-builder commits are layered on top of that.

If/when `origin/AI-1192` lands on `develop`, merge develop in to keep current.

---

## Shared package (`packages/graph-workflow`)

Dylan's package now contains, on this branch:

- `src/types.ts` — schema types (Dylan's, unchanged)
- `src/validator/validator.ts` — graph schema validator (Dylan's, unchanged)
- `src/validator/context-utils.ts` — ctx namespace utils (Dylan's, unchanged)
- **`src/catalog/types.ts`** — new: `ActivityCatalogEntry`, `PortDescriptor`, `CatalogCategory`
- **`src/catalog/index.ts`** — new: `ACTIVITY_CATALOG`, `getActivityCatalogEntry()`, `getActivityParametersJsonSchema()`, `listActivityTypes()`
- **`src/catalog/activities/file-prepare.ts`** — new: schema + entry for `file.prepare`
- **`src/catalog/activities/ocr-check-confidence.ts`** — new: schema + entry for `ocr.checkConfidence`
- **`src/catalog/activities/azure-ocr-submit.ts`** — new: schema + entry for `azureOcr.submit`
- **`src/catalog/activities/file-prepare.test.ts`** — new: tests (9 passing)

Pattern for each activity: a Zod v4 schema (`from "zod/v4"`) describing static parameters, with UI hints attached via `.meta({ ... })` that ride through `z.toJSONSchema()` as `x-widget`, `x-options`, `x-default`, `x-step` extension fields.

`package.json` now depends on `zod: "3.25.76"` (the v4-bridge release). Build passes (`npm run build` in the package directory). Tests pass (`npx jest src/catalog`).

---

## Frontend additions

- **`apps/frontend/src/features/workflow-builder/json-schema-form/`** — the renderer
  - `types.ts` — minimal JSON Schema shape
  - `JsonSchemaForm.tsx` — Mantine renderer; handles string, string+enum, string+combobox, number (with min/max/step), integer, boolean
  - `index.ts` — re-exports
- **`apps/frontend/src/pages/WorkflowFormPreviewPage.tsx`** — three-card dev preview (form + JSON Schema panel + live value & validation panel)
- **`apps/frontend/src/App.tsx`** — added route `/workflows/dev-form-preview`

Frontend `package.json` already has the `@ai-di/graph-workflow` workspace dep — added in Dylan's `63f23c3a` commit.

Type-check passes (`npx tsc --noEmit` in apps/frontend). I did not run vitest.

---

## Current state of Milestone 1

The dev preview page works to the extent I could verify:
- HTTP 200 at `http://localhost:3000/` (Vite reports ready)
- HMR updates in the log are clean — no Vite/Rollup errors after the platform-binary commit landed
- I did not get to verify the page renders correctly in a browser

**Open question Alex raised before stopping:** "Frontend doesn't start." But Vite was up and serving 200s. So either:
- The React app is crashing on mount (would only show in browser console)
- An auth redirect is sending him elsewhere
- The route resolves to something unexpected

He wanted to inspect via chrome-devtools MCP. The MCP server is *registered and connected* per `claude mcp list`, but its tools were added mid-session so they weren't in my deferred-tool index. **In a fresh session, the chrome-devtools tools should be available.** Navigate to `http://localhost:3000/workflows/dev-form-preview`, capture console errors, debug from there.

If chrome-devtools isn't available in the new session either, options are:
- Use `playwright` MCP (also registered, also connected, has `mcp__playwright__browser_navigate` etc. — but earlier it failed with "Chromium distribution 'chrome' is not found"; would need `npx playwright install chrome` first)
- Ask Alex to paste console errors
- Read the Vite dev log at `logs/frontend-dev.log` (errors during HMR would appear there)

---

## How to start the dev server (when needed)

Pre-existing commit `b86741c7` solved the native-binary issue durably, so this should now Just Work after a clean `npm install`:

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npm install                                # in case anything drifted
npm run dev:frontend                       # starts vite + tees log to logs/frontend.log
# OR start it directly in the background:
nohup npx vite --config apps/frontend/vite.config.ts apps/frontend \
  > logs/frontend-dev.log 2>&1 &
```

Dev server lands on `http://localhost:3000/`. The tracer route is `http://localhost:3000/workflows/dev-form-preview`.

If you hit the rollup or esbuild "Cannot find module @rollup/rollup-linux-x64-gnu / @esbuild/linux-x64" error: the platform-binary commit was supposed to fix this. If it returns, run `npm install` once more — it shouldn't need ad-hoc `--no-save` patches anymore.

---

## What to do next

### Immediate: verify Milestone 1 actually works in a browser

In a fresh session with chrome-devtools tools available, navigate to the tracer page and confirm the form renders correctly for all three activities. Capture any console errors and fix them.

### Then: choose the next milestone

Either:

**A. Add the conditional-fields stress test before fanning out.** Add `document.split` schema with its `strategy` discriminator (`per-page` / `fixed-size` / `custom-ranges`) and extend the renderer to handle one-of-style conditional fields. This is the harder renderer case — better to debug it on three more activities than on twenty-five. Same milestone (Milestone 1, polish).

**B. Fan out to remaining ~22 activity schemas.** Brute-force add the remaining catalog entries — see [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) for the full list. This finishes Milestone 1's "all activities have schemas" goal. Source of truth for the activity list: `apps/temporal/src/activity-registry.ts` and `apps/temporal/src/activity-types.ts`.

**C. Start Milestone 2 (editor skeleton).** Drop one activity (`file.prepare`) onto a real canvas — palette + interactive `GraphVisualization.tsx` + right-side schema-driven settings panel + save/load. This is the bigger leap; needs ~1 week.

I'd suggest A → B → C. Confirm with Alex first.

---

## Repo layout cheatsheet

```
ai-adoption-document-intelligence/
├── apps/
│   ├── backend-services/          ← NestJS backend (Temporal client)
│   ├── temporal/                  ← Temporal worker + activity implementations
│   └── frontend/                  ← React + Mantine + Vite (the editor lives here)
│       ├── src/components/workflow/
│       │   ├── GraphVisualization.tsx        ← existing 47KB ReactFlow renderer; keep, make interactive in Phase 1A
│       │   ├── GraphConfigFormEditor.tsx     ← old JSON-driven form editor; partial coverage; reference, don't reuse wholesale
│       │   ├── AzureClassifySubmitForm.tsx   ← canonical "override the generic renderer when you need an API call" pattern
│       │   ├── SelectClassifiedPagesForm.tsx
│       │   └── FlattenClassifiedDocumentsForm.tsx
│       ├── src/features/workflow-builder/    ← NEW; all new workflow-builder code goes here
│       │   └── json-schema-form/             ← the renderer
│       ├── src/pages/
│       │   ├── WorkflowEditorPage.tsx        ← old JSON editor; coexists during transition
│       │   ├── WorkflowFormPreviewPage.tsx   ← NEW; the dev tracer
│       │   ├── WorkflowListPage.tsx
│       │   ├── WorkflowEditPage.tsx          ← unknown status, investigate before adding more pages
│       │   └── WorkflowPage.tsx              ← unknown status, investigate before adding more pages
│       └── package.json                       ← Mantine 8.3.9, @xyflow/react 12.10.0, Zod 3.25.76
├── packages/
│   ├── graph-workflow/            ← Dylan's shared package; NOW has our catalog too
│   │   └── src/
│   │       ├── types.ts           ← Dylan's
│   │       ├── validator/         ← Dylan's
│   │       └── catalog/           ← NEW (ours)
│   ├── graph-insertion-slots/     ← Dylan's; relevant later for the AI builder
│   ├── blob-storage-paths/
│   ├── logging/
│   └── monitoring/
└── docs-md/
    ├── SHARED_PACKAGES.md         ← Dylan's convention for shared packages
    ├── workflow-builder/
    │   ├── IMPLEMENTATION_PLAN.md ← THE PLAN. READ FIRST.
    │   ├── NOTES.md               ← vision + research + designer convo summary
    │   ├── TYPED_IO_BRAINSTORM.md ← deferred / placeholder
    │   ├── SESSION_HANDOFF.md     ← THIS FILE
    │   ├── WORKFLOW_DESIGN_BRIEF.md
    │   ├── WORKFLOW_NODE_CATALOG.md
    │   └── WORKFLOW_NODE_IO_MODEL_DECISION.md
    └── graph-workflows/
        ├── DAG_WORKFLOW_ENGINE.md
        ├── GRAPH_TYPES.md
        ├── WORKFLOW_BUILDER_GUIDE.md
        └── templates/             ← 8 example workflow JSONs
```

---

## Memory pointers (in `~/.claude/projects/-home-alstruk-GitHub-ai-adoption-document-intelligence/memory/`)

The following memory files exist and are loaded automatically each session:

- `project_workflow_builder_handoff.md` — **read this first** — pointers + cadence preferences
- `project_workflow_builder_decisions.md` — locked-in decisions
- `project_shared_graph_workflow_package.md` — Dylan's package status
- `project_workflow_templates.md` — where templates live
- (and unrelated: `project_openshift_deployment.md`, `project_primary_instance.md`, feedback files)

If a new top-level fact is learned (e.g., AI-1192 finally merged, the chrome-devtools MCP issue recurs, a major decision flips), add a new memory file and update `MEMORY.md`. Don't put implementation details there — those go in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

---

## Things I noticed but didn't act on

- `apps/frontend/src/pages/WorkflowPage.tsx` and `WorkflowEditPage.tsx` exist alongside `WorkflowEditorPage.tsx`. Three workflow pages is one (or two) too many. Worth investigating before adding more.
- Backend `activity-parameter-schema-registry.ts` only has 1 entry (`data.transform`). Most activities have no save-time parameter validation. Once we have catalog entries for all activities, replacing this registry to use the catalog's Zod schemas is the right move — but defer until catalog is broader.
- The decoupled `mantine-form-zod-resolver` is still imported by `apps/frontend/src/features/tables/components/RowForm.tsx`. New code uses `@mantine/form`'s built-in `schemaResolver` instead. The form renderer in this PR doesn't actually use either yet — it manages state directly. Wire `schemaResolver` in when adding live validation to the editor's settings panel.

---

## Working dev-server pid (if it's still running)

When I last looked the server was on pid `915980` (parent bash) → `node` vite + `esbuild`. I tried to kill it before committing; one of the kill commands errored with the process tree partly intact. If `lsof -i:3000` shows a process, kill it before starting fresh.

Log lives at `logs/frontend-dev.log`. Recent HMR pattern is clean — last entry before I killed was a successful Vite startup, no errors.
