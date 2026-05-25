# US-185: End-to-end Playwright walkthrough — Phase 6 dynamic nodes

**As a** workflow-builder engineer closing Phase 6,
**I want** a single Playwright walkthrough that proves the full agent feedback loop works end-to-end against the live dev server,
**So that** Alex can click-and-play every Phase 6 surface in one pass and we have a reproducible verification artifact (screenshots + script) for the SESSION_HANDOFF.

## Acceptance Criteria

- [ ] **Scenario 1**: Setup — env var, base fixture, walkthrough script live at `/tmp/wb-phase6-verify/`
    - **Given** the running dev backend has `DYNAMIC_NODE_ALLOW_NET` set to include any test hosts needed (empty allowlist is OK for the URL-uppercase smoke)
    - **When** the developer runs the setup script (`/tmp/wb-phase6-verify/setup.sh`)
    - **Then** the script confirms Deno is on PATH locally, the backend is responding, and the dev DB has no leftover Phase-6 fixtures from prior runs
    - **And** the walkthrough script `/tmp/wb-phase6-verify/walkthrough.mjs` exists with the 7 scenarios below

- [ ] **Scenario 2**: Publish v1 + canvas comes alive via Try
    - **Given** the walkthrough running
    - **When** it `POST`s `/api/dynamic-nodes` with the uppercase-URL script per REQUIREMENTS §6 Milestone G step 2
    - **Then** the response is 201 with `{ slug, version: 1, signature, errors: [] }`
    - **And** `GET /api/activity-catalog` includes `dyn.uppercase-document-url`
    - **And** the walkthrough creates fixture workflow `WF_PH6_ID` wiring `source.api → dyn.uppercase-document-url`, saves it, clicks Try with `{"documentUrl": "https://example.com/foo.pdf"}`, and observes the canvas come alive (status badges → green; preview under the dynamic node shows the uppercased URL)

- [ ] **Scenario 3**: Publish v2 + cache invalidation visible
    - **Given** v1 is live
    - **When** the walkthrough PUTs v2 (changing "uppercase" to "reverse")
    - **Then** the response is 200 with `version: 2`
    - **And** clicking Try again on the same workflow re-executes the dynamic node (cache miss because resolved versionId changed)
    - **And** the source.api node is a cache hit (purple — Phase 4)
    - **And** the preview shows the reversed URL

- [ ] **Scenario 4**: In-situ edit + publish-time error markers
    - **Given** the v2 node visible on canvas
    - **When** the walkthrough right-clicks → Edit script → introduces a syntax error → clicks Publish
    - **Then** the editor's status strip shows `[ts-check] line X col Y: ...` AND Monaco gutter shows a red squiggle on the failing line
    - **And** fixing the syntax + clicking Publish succeeds (v3) with a green notification

- [ ] **Scenario 5**: Management page list + version history + delete
    - **Given** v3 is live
    - **When** the walkthrough navigates to `/dynamic-nodes`
    - **Then** the list shows the slug with `version count: 3, used in 1 workflows`
    - **And** clicking the slug shows the full v3 script + signature preview + 3-row version history
    - **And** clicking v1 in the version history opens the side-by-side view modal
    - **And** clicking Delete (confirm modal lists `Used in: WF_PH6`) confirms → list refreshes without the slug

- [ ] **Scenario 6**: Deleted-state canvas behavior
    - **Given** the lineage was just soft-deleted
    - **When** the walkthrough re-opens `WF_PH6_ID`
    - **Then** the dynamic node renders with a red "Deleted" badge
    - **And** the settings panel shows the "Deleted dynamic node" Alert
    - **And** Try is disabled with the Tooltip from US-183

- [ ] **Scenario 7**: Zero `pageerror` events + screenshots saved
    - **Given** the walkthrough runs the previous 6 scenarios
    - **When** the walkthrough completes
    - **Then** every `page` listened for `pageerror` events emits zero
    - **And** 14+ screenshots are saved under `/tmp/wb-phase6-verify/` (one per major step)
    - **And** the walkthrough's stdout summary prints `PASS: 7/7 scenarios — 0 pageerror events`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `/tmp/wb-phase6-verify/setup.sh` — out-of-tree setup script
- `/tmp/wb-phase6-verify/walkthrough.mjs` — out-of-tree Playwright walkthrough
- `/tmp/wb-phase6-verify/01-*.png` ... `/tmp/wb-phase6-verify/14-*.png` — screenshots
- `docs-md/workflow-builder/SESSION_HANDOFF.md` — refresh with Phase 6 closeout summary (test counts, commits, fixtures, screenshots location)
- `feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/user_stories/README.md` — tick every checkbox

## Technical notes

- Per the existing convention (Phase 4 / Phase 8), setup + walkthrough scripts live OUT of the repo tree at `/tmp/wb-phase6-verify/`.
- Use `app-browser-auth` skill for the mock auth bypass (per the existing conventions documented in `.claude/skills/app-browser-auth/`).
- The walkthrough uses the seed-default `x-api-key` value `69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY` (per CLAUDE.md) — Alex's dev DB may use a different key; check + parameterize.
- The fixture workflow `WF_PH6_ID` should be cleaned up at script end (or left in place per developer preference — Phase 4's walkthrough left fixtures around for inspection).
- This story is the final ping for Phase 6. After tick: write the SESSION_HANDOFF closeout, commit, and the phase is closed.
- After landing: no Vite restart (verification-only).
