# US-224: End-to-end Playwright walkthrough — Phase 7 AI workflow builder

**As a** product engineer closing Phase 7,
**I want** a Playwright script that drives a real agent conversation against the live stack and verifies all 8 scenarios from AI_AGENT_DESIGN.md §11,
**So that** Phase 7 has the same click-and-play closure proof that Phases 3 / 4 / 6 / 8 have.

## Acceptance Criteria

- [ ] **Scenario 1**: Walkthrough script + fixtures
    - **Given** `/tmp/wb-phase7-verify/walkthrough.mjs` + a fixture invoice at `/tmp/wb-phase7-verify/invoice.pdf`
    - **When** the script runs against a live backend on :3002 + frontend on :3000 + deno-runner on :9099 + a valid `ANTHROPIC_API_KEY`
    - **Then** it executes 8 named scenarios in sequence:
        - **S1** — Greenfield workflow build: open chat from header on `/workflows`, type "build me a workflow that extracts text from PDFs and saves it", verify agent calls `createWorkflow` + navigates the user, verify chat composes the workflow via tool calls
        - **S2** — File drop populates source.upload: drop `invoice.pdf` in composer, verify queued file → source.upload upload → "User attached invoice.pdf" system message
        - **S3** — Run + iterate: verify agent calls `startRun`, polls `getNodeStatuses`, reads `getPreviewCache`, surfaces a final-result card

- [ ] **Scenario 2**: Walkthrough scenarios 4-6 — escape hatch + canvas + abort
    - **Given** the walkthrough mid-flight
    - **When** it executes scenarios 4-6
    - **Then**:
        - **S4** — Dynamic-node escape hatch: drive a conversation that requires a custom transform; verify agent drafts TS in chat, calls `publishDynamicNode`, FIRST call returns 400 with `ParseError[]` (deliberate via a fixture broken-script intercept OR through naturalistic failure), agent revises at the line/column, second call succeeds
        - **S5** — Canvas reactivity: assert each `addNode` / `connectNodes` / `deleteNode` tool-call-complete event is followed within 200 ms by a DOM mutation on the canvas (xyflow re-render)
        - **S6** — Abort works: click Abort mid-stream → backend stops loop → frontend shows "Aborted" pill → conversation row remains in the DB + replayable

- [ ] **Scenario 3**: Walkthrough scenarios 7-8 — resume + zero pageerrors
    - **Given** the walkthrough finishing
    - **When** it executes scenarios 7-8
    - **Then**:
        - **S7** — Resume: close drawer, reopen, verify the prior conversation reloads with full history (text + tool-call cards), next message continues the SDK session via `resume:`
        - **S8** — Zero `pageerror` events across the entire walkthrough (script attaches `page.on('pageerror', …)` from start to end)

- [ ] **Scenario 4**: Verification artefacts
    - **Given** the walkthrough completing
    - **When** the script ends
    - **Then** screenshots are saved at `/tmp/wb-phase7-verify/01-*.png` through `/tmp/wb-phase7-verify/08-*.png` (one per scenario)
    - **And** `/tmp/wb-phase7-verify/summary.json` carries `{ scenarios: { S1: 'PASS', ..., S8: 'PASS' }, pageErrors: 0, totalDurationMs, conversationsCreated, runsExecuted }`
    - **And** the script logs each scenario start + end + assertion result to stdout

- [ ] **Scenario 5**: `SESSION_HANDOFF.md` updated + Phase 7 close-out
    - **Given** the walkthrough pass
    - **When** the closeout commit lands
    - **Then** `docs-md/workflow-builder/SESSION_HANDOFF.md` is updated with a Phase 7 close-out section matching the Phase 4 / 6 / 8 closing format
    - **And** the test counts are recorded (graph-workflow / backend-services / temporal / frontend — final + delta)
    - **And** all 38 stories US-187 → US-224 are checked off in README.md
    - **And** any 7.x deferred items are listed (per REQUIREMENTS.md §5 + any Phase-7-only follow-ups surfaced during implementation)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `/tmp/wb-phase7-verify/walkthrough.mjs` — new (out-of-tree per project convention)
- `/tmp/wb-phase7-verify/invoice.pdf` — fixture
- `/tmp/wb-phase7-verify/setup-fixtures.sh` — fixture seeding (if needed)
- `/tmp/wb-phase7-verify/01-*.png` → `08-*.png` — screenshots
- `/tmp/wb-phase7-verify/summary.json` — result
- `docs-md/workflow-builder/SESSION_HANDOFF.md` — phase close-out update

## Technical notes

- Per L48 + REQUIREMENTS.md §8 acceptance criteria.
- Closes Milestone G + Phase 7.
- Use the [[app-browser-auth]] skill to bypass IDIR login when driving Playwright against localhost:3000.
- Cost cap: this walkthrough makes real Anthropic API calls. Expect ~$0.50 of Opus 4.7 1M usage per full run.
- If S4 (escape hatch) fails to fire naturally, the script can inject a "you need to write a custom function" prompt to force the path — the goal is verifying the agent CAN navigate the escape hatch, not that it spontaneously does so on every run.
