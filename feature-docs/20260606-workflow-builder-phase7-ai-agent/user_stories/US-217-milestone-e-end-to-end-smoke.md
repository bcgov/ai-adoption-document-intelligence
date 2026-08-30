# US-217: Milestone E end-to-end manual smoke — "build me a workflow that..." + file drop + canvas live updates

**As a** product engineer closing Milestone E,
**I want** a documented end-to-end manual smoke against the live stack confirming greenfield workflow build with file drop works end-to-end,
**So that** Alex has a click-and-play surface to verify Milestones A → E land correctly before kicking off Milestone F.

## Acceptance Criteria

- [x] **Scenario 1**: Smoke script exists at `/tmp/wb-phase7-milestone-e/smoke.mjs`
    - **Given** a Playwright runner with the auth-bypass skill applied
    - **When** the smoke script is run
    - **Then** it navigates to `/workflows` (no specific workflow open), opens the global chat icon, types "build me a workflow that extracts text from PDFs and saves it to a results store"
    - **And** drops a sample PDF (`/tmp/wb-phase7-milestone-e/invoice.pdf`) into the composer
    - **And** clicks send

- [x] **Scenario 2**: Agent creates the workflow + navigates the user
    - **Given** the message sent
    - **When** the agent's first `createWorkflow` tool-call-complete event arrives
    - **Then** the browser URL transitions to `/workflows/create-v2?id=<X>` for some new id
    - **And** the canvas mounts (or transitions to) the new workflow's editor
    - **And** the drawer stays open across the navigation

- [x] **Scenario 3**: Agent adds source.upload + frontend uploads the queued file
    - **Given** the navigation complete
    - **When** the agent's next `addNode({ type: 'source.upload' })` lands
    - **Then** the canvas shows a new `source.upload` node
    - **And** within ≤2 seconds, the queued PDF uploads via Phase 8's `POST /api/sources/:sourceNodeId/upload`
    - **And** a synthetic system message in the chat reads "User attached invoice.pdf to source node '<name>'"

- [x] **Scenario 4**: Agent composes downstream + runs the workflow
    - **Given** the source node populated
    - **When** the agent adds downstream activity nodes + calls startRun
    - **Then** the canvas reflects each `addNode` + `connectNodes` within one tick
    - **And** node-status pills appear on each node (Phase 4) as the run progresses
    - **And** the agent reads preview-cache + surfaces a final-result card in the chat

- [x] **Scenario 5**: Smoke pass criteria
    - **Given** the full run
    - **When** the script finishes
    - **Then** screenshots are saved at `/tmp/wb-phase7-milestone-e/01-no-workflow-chat-open.png` through `08-final-result.png`
    - **And** `pageerror` event count is 0
    - **And** a `/tmp/wb-phase7-milestone-e/summary.json` is written with `{ scenarios: { ... }, pageErrors: 0, totalDurationMs: ... }`
    - **And** Alex can replay the screenshots to verify the click-and-play surface

## Priority
- [ ] High (Must Have)

## Files modified / created

- `/tmp/wb-phase7-milestone-e/smoke.mjs` — new (out-of-tree per project convention for verification scripts)
- `/tmp/wb-phase7-milestone-e/invoice.pdf` — test fixture (any small PDF — out-of-tree)
- `/tmp/wb-phase7-milestone-e/01-*.png` → `08-*.png` — screenshots
- `/tmp/wb-phase7-milestone-e/summary.json` — result

## Technical notes

- Per the Milestone E verification surface from REQUIREMENTS.md §6.
- Closes Milestone E.
- This is a manual / single-shot smoke — NOT a permanent regression test. Milestone G's walkthrough (US-224) is the comprehensive verification.
- Use the existing chrome-devtools or Playwright MCP — see [[app-browser-auth]] for the auth-bypass setup needed against localhost:3000.
