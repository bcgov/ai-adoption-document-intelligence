# US-208: `AgentChatIcon` in global app header

**As a** user picking up the agent from any page,
**I want** a chat-bubble icon in the global app header that toggles the drawer,
**So that** I can talk to the agent regardless of which route I'm currently on.

## Acceptance Criteria

- [ ] **Scenario 1**: `AgentChatIcon` component exists
    - **Given** `apps/frontend/src/components/nav/AgentChatIcon.tsx`
    - **When** read after the change
    - **Then** it renders a Mantine `<ActionIcon>` with a chat-bubble glyph (use whichever icon set the existing nav uses — likely tabler or lucide)
    - **And** the icon has an `aria-label="Open workflow agent chat"` for accessibility
    - **And** clicking the icon calls `useAgentChatStore().toggle()`

- [ ] **Scenario 2**: Icon mounted in the existing top-bar nav
    - **Given** the existing top-bar nav file (likely `components/nav/TopBarNav.tsx` based on Phase 6's L44 reference, OR the actual file confirmed via Read first)
    - **When** read after the change
    - **Then** the `<AgentChatIcon />` is rendered in the right-side icon cluster (next to the existing notification / user-menu icons)
    - **And** the icon is visible on every authenticated route (whatever the existing nav's mounting strategy is — the icon ships wherever the nav ships)

- [ ] **Scenario 3**: Streaming-indicator badge dot
    - **Given** the icon
    - **When** an agent stream is in-flight in any conversation
    - **Then** a small Mantine `<Indicator color="green" processing>` dot renders on the icon
    - **And** the dot disappears when no stream is active
    - **And** the streaming-status state lives in `agentChatStore` (extend the store with `isStreaming: boolean` + `setStreaming(v)`)

- [ ] **Scenario 4**: Drawer toggle on click round-trips correctly
    - **Given** the drawer closed
    - **When** the user clicks `AgentChatIcon`
    - **Then** the drawer opens
    - **When** the user clicks the icon again
    - **Then** the drawer closes
    - **And** the close-button-in-header → icon click → reopen cycle also works (state stays consistent)

- [ ] **Scenario 5**: Component tests + smoke
    - **Given** `AgentChatIcon.spec.tsx`
    - **When** run via `npm test`
    - **Then** tests cover: click toggles store, streaming indicator visible when `isStreaming: true`, aria-label present, icon renders without errors when no auth context

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/components/nav/AgentChatIcon.tsx` — new
- `apps/frontend/src/components/nav/AgentChatIcon.spec.tsx` — new
- `apps/frontend/src/components/nav/TopBarNav.tsx` (or the actual file confirmed via Read) — add the icon
- `apps/frontend/src/features/workflow-builder/agent-chat/state/agentChatStore.ts` — extend with `isStreaming` + `setStreaming`

## Technical notes

- Per L42 in REQUIREMENTS.md.
- Depends on US-207 (drawer + store).
- Before writing the file edits, confirm the actual top-bar-nav file path via Read — the path in L42 / L44 references may need adjustment.
- The streaming indicator is a small UX nicety so users can know an agent is mid-iteration in another route (e.g. they navigated away to look at something).
