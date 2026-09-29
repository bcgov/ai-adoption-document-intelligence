# US-095: Canvas handle colour + hover tooltip

**As a** workflow author scanning the canvas,
**I want** each node's input/output handles coloured by the kind that flows through them (when unambiguous),
**So that** I can spot kind-compatible neighbours at a glance.

## Acceptance Criteria

- [x] **Scenario 1**: Single-typed-port output handle is colour-coded
    - **Given** a `document.split` node (typed in US-101: outputs `[{ name: "segments", kind: "Segment[]" }]`) on the canvas
    - **When** the canvas renders
    - **Then** the node's single right-side output handle dot is rendered in the `Segment`-family colour (green per TYPED_IO_DESIGN.md §4)
    - **And** the array cardinality is signalled via a doubled outline on the dot
    - **And** the same rule fires symmetrically on the input side for single-typed-input nodes

- [x] **Scenario 2**: Zero-typed-port and multi-typed-port handles stay gray
    - **Given** a `document.classify` node (multi-port: 3 outputs of which only 1 has a declared kind from the taxonomy; the others are `Artifact`-wildcards from US-102's typing)
    - **When** the canvas renders
    - **Then** the output handle stays gray (Artifact wildcard) because there's more than one declared output
    - **And** a legacy node without ANY `kind` declarations also renders gray on both sides
    - **And** the rendering must not pick a "primary" port to colour by — gray is the correct signal for "see the type pill"

- [x] **Scenario 3**: Hover tooltip on a coloured handle shows the kind literal
    - **Given** the green output handle on `document.split`
    - **When** the user hovers
    - **Then** the tooltip text reads exactly `"Segment[]"` (the kind string, verbatim from the descriptor)
    - **And** hover on a coloured input handle shows the consumer's expected kind literal

- [x] **Scenario 4**: Hover tooltip on a gray multi-port handle explains the indirection
    - **Given** the gray output handle on `document.classify`
    - **When** the user hovers
    - **Then** the tooltip reads `"Multiple outputs — select node to view all"`
    - **And** the input-side equivalent reads `"Multiple inputs — select node to view all"`
    - **And** the gray legacy-untyped case (no kinds declared anywhere) shows the same tooltip (the message is honest — multi or unknown both collapse to "look at the pill")

- [x] **Scenario 5**: `handleConnect` behaviour unchanged
    - **Given** any pair of handles regardless of kind compatibility
    - **When** the user drags a wire from one to the other
    - **Then** the wire is created (no rejection)
    - **And** the wire's body colour remains driven by edge type (switch case / error / normal), not by kind
    - **And** existing Phase 1B switch-edge / error-edge styling continues to work

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` — wire kind-aware styling into the per-node handle render path
- `apps/frontend/src/features/workflow-builder/catalog-utils.ts` — extend the existing port-info resolver to surface `kind` from the catalog + from `CtxDeclaration` + from `LibraryPortDescriptor` (per US-093's `resolvePortKind` shape, but rendered as `{ color, label, isArray }` for the canvas)
- `apps/frontend/src/features/workflow-builder/canvas/handle-style.ts` — new helper translating `KindRef | undefined + count` to `{ color: MantineColor, doubledOutline: boolean }`
- `apps/frontend/src/features/workflow-builder/canvas/handle-style.test.ts` — unit tests covering each handle-rendering branch

## Technical notes

- The frontend's MantineColor mapping reads `ARTIFACT_REGISTRY[kind].color` from the shared package (US-090) and translates to the active Mantine theme. Avoid hex codes — let Mantine theme palette resolve them.
- Reusing the existing canvas xyflow `<Handle>` component — no new components. The colour styling rides on the existing `style` prop (or className).
- Counting "single typed port" vs "multi" is per-side: count `node.inputs[]` (or `node.outputs[]`) entries where the resolved port descriptor declares a kind. Zero typed → gray. One typed → coloured. Two-or-more typed → gray.
- Wire body styling is OUT of scope — already coloured by edge type from Phase 1B. Don't touch.
