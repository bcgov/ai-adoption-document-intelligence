# US-207: `AgentChatDrawer` + `AgentChatHeader` + drawer-at-layout-root mount

**As a** frontend engineer placing the chat surface in the app shell,
**I want** a Mantine `Drawer`-based shell that mounts at the layout root (persisting across route changes), with a title + close button in the header,
**So that** clicking the (yet-to-be-built) header icon opens a 480 px right-rail drawer regardless of which page the user is on.

## Acceptance Criteria

- [ ] **Scenario 1**: `AgentChatDrawer` Mantine component renders
    - **Given** `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx`
    - **When** read after the change
    - **Then** the component renders Mantine `<Drawer position="right" size="480px">`
    - **And** the body is `<AgentChatHeader>` + a placeholder `<div data-testid="agent-chat-body" />` (`AgentChatThread` lands in US-209)
    - **And** the drawer reads its open state from a Zustand store at `agent-chat/state/agentChatStore.ts` (so the trigger icon in US-208 can toggle it)

- [ ] **Scenario 2**: `AgentChatHeader` renders a title + close button
    - **Given** `agent-chat/header/AgentChatHeader.tsx`
    - **When** read after the change
    - **Then** it renders a title (default "Workflow Agent") + a Mantine close button
    - **And** the close button calls `agentChatStore.close()`
    - **And** abort + new-conversation buttons land in US-211 (placeholder slots present here)

- [ ] **Scenario 3**: Drawer mounts at the app layout root
    - **Given** the existing app layout file (likely `apps/frontend/src/App.tsx` or `apps/frontend/src/layouts/AppLayout.tsx`)
    - **When** read after the change
    - **Then** `<AgentChatDrawer />` is rendered as a sibling of the route outlet (NOT inside a route component)
    - **And** the drawer's open state survives route changes (Cypress / Playwright smoke: open drawer on `/workflows`, navigate to `/workflows/create-v2?id=<X>`, drawer stays open)

- [ ] **Scenario 4**: Zustand `agentChatStore` provides minimal state
    - **Given** `agent-chat/state/agentChatStore.ts`
    - **When** read after the change
    - **Then** it exports a Zustand-based hook `useAgentChatStore()` with `{ isOpen, open(), close(), toggle() }`
    - **And** initial `isOpen` is `false`
    - **And** unit tests cover open / close / toggle

- [ ] **Scenario 5**: Component tests pass
    - **Given** `AgentChatDrawer.spec.tsx` + `AgentChatHeader.spec.tsx` + `agentChatStore.spec.ts`
    - **When** run via `npm test`
    - **Then** the drawer renders the title + close, closing fires `agentChatStore.close()`, drawer is hidden when `isOpen: false`, drawer is visible when `isOpen: true`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentChatHeader.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/header/AgentChatHeader.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/state/agentChatStore.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/state/agentChatStore.spec.ts` — new
- `apps/frontend/src/App.tsx` (or equivalent layout root) — mount the drawer

## Technical notes

- Per L41 + L48 in REQUIREMENTS.md.
- Drawer width 480 px matches the existing right-rail drawers from Phase 2 / 4.
- Mid-stream navigation logic lands in US-216 — the drawer's open state surviving navigation here is the prerequisite.
