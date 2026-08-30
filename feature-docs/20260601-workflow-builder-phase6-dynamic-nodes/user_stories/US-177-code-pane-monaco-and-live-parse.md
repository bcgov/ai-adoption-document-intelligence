# US-177: `CodePane` — Monaco editor + boilerplate + live signature parse strip + publish-time error markers

**As a** dynamic-node author (human OR agent),
**I want** a Monaco TS editor that pre-fills useful boilerplate in create mode, shows my signature status live below the editor, and surfaces publish-time errors as gutter markers I can click to jump to,
**So that** the authoring loop is one editor + one status strip + zero context switches, and the agent's revision loop reads the same line-anchored error data the human sees.

## Acceptance Criteria

- [x] **Scenario 1**: Monaco TS editor mounted with TypeScript language mode
    - **Given** `apps/frontend/src/features/workflow-builder/dynamic-nodes/CodePane.tsx`
    - **When** the component renders
    - **Then** it mounts Monaco with `language="typescript"`, dark theme matching the existing project, `automaticLayout: true`
    - **And** Monaco is loaded from the existing project dep (no new install per requirements §4.4)

- [x] **Scenario 2**: Boilerplate prefill in create mode
    - **Given** `slug` prop is undefined (create mode)
    - **When** the editor first mounts
    - **Then** Monaco loads with the boilerplate from REQUIREMENTS §3.3 L38: imports `Document` from `@ai-di/graph-workflow/kinds`, JSDoc with `@workflow-node`, `@name my-custom-node`, `@description TODO`, simple `inputs/outputs`, an `export default async function dynamicNode(ctx, params)` returning `{ result: ctx.document }`
    - **And** in edit mode, the editor loads the script from the `useDynamicNode(slug)` hook's `headVersion.script`

- [x] **Scenario 3**: Live signature parse strip below the editor
    - **Given** the editor mounted with text
    - **When** the user types
    - **Then** every 300 ms (debounced), `parseDynamicNodeSignature(text)` is called client-side (from the shared package — no network)
    - **And** the strip renders either: green checkmark with `Signature OK: <name> — <inputs ports> → <outputs ports>`, OR a red bulleted list of `{stage} line N col M: message` items
    - **And** clicking a bulleted error in the strip jumps the editor cursor to the line/column

- [x] **Scenario 4**: Publish-time errors render as Monaco gutter markers
    - **Given** the editor receives a `publishErrors: ParseError[]` prop from the shell (US-176)
    - **When** the prop changes
    - **Then** `editor.deltaDecorations` adds a red squiggle gutter marker at each error's `line` + `column` (where present)
    - **And** hovering a marker shows the `message` as a tooltip
    - **And** when `publishErrors` is empty the markers are cleared

- [x] **Scenario 5**: Editor exposes the current text via a `onChange(text)` prop
    - **Given** the shell needs the current text on Publish
    - **When** the editor's content changes
    - **Then** `onChange(text)` fires (debounced ~150 ms to avoid render spam)
    - **And** the shell stores the latest text in state for the Publish mutation

- [x] **Scenario 6**: Tests cover boilerplate + live parse + markers + onChange
    - **Given** `CodePane.spec.tsx`
    - **When** the test suite runs
    - **Then** tests pass for: boilerplate matches the expected string in create mode, edit mode hydrates from `useDynamicNode` data, live parse strip updates on typed input, gutter markers appear when `publishErrors` is non-empty, clicking a strip error positions the cursor

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/dynamic-nodes/CodePane.tsx` — new file
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/CodePane.spec.tsx` — new test
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/boilerplate.ts` — extracted boilerplate string constant
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` — wire the shell to render `<CodePane>` with the right props

## Technical notes

- The live parse uses the shared `parseDynamicNodeSignature` exported from `@ai-di/graph-workflow` (US-158/US-159). Same parser the backend runs — same `ParseError[]` shape on both sides.
- Debounce values: 300 ms for parse (heavy enough to not run every keystroke; tight enough to feel live), 150 ms for `onChange` propagation.
- Monaco's TS language service does NOT need to typecheck inside the editor — `deno check` at publish time is the source of truth. Disable Monaco's built-in TS checker to avoid red squiggles that don't match Deno's output.
- After landing: no Vite restart (frontend-only).
