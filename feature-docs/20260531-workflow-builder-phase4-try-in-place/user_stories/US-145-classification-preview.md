# US-145: `ClassificationPreview` widget

**As a** user iterating on a workflow with `document.classify` / `azureClassify.poll` / `document.splitAndClassify` nodes,
**I want** the preview pane below a `Classification`-producing node to show the predicted label, confidence, and matched-rule name in a compact pill,
**So that** I can see at a glance whether the classifier is doing the right thing.

## Acceptance Criteria

- [ ] **Scenario 1**: Component signature + base render
    - **Given** `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx` (new file)
    - **When** read
    - **Then** it exports `function ClassificationPreview({ value }: { value: unknown })`
    - **And** when `value` is a Classification object (has `label: string` + `confidence: number`), it renders the pill + bar
    - **And** when `value` is malformed, it renders "No classification result"

- [ ] **Scenario 2**: Label pill + confidence bar layout
    - **Given** a value `{ label: "INVOICE", confidence: 0.87, ruleName: "vendor-invoice-keyword-match" }`
    - **When** rendered
    - **Then** a Mantine `<Badge size="lg" variant="filled">INVOICE</Badge>` renders prominently
    - **And** below it, a small `<Progress value={87} color="green" size="xs">` bar renders + a label "87%"
    - **And** below that, a `<Text size="xs" c="dimmed">matched by: vendor-invoice-keyword-match</Text>` line (when `ruleName` is set; hidden otherwise)

- [ ] **Scenario 3**: Confidence colour bands
    - **Given** the confidence value
    - **When** rendered
    - **Then** confidence ≥ 0.8 → bar `color="green"`
    - **And** 0.5 ≤ confidence < 0.8 → bar `color="amber"` (use the closest Mantine palette name — `yellow`)
    - **And** confidence < 0.5 → bar `color="red"`

- [ ] **Scenario 4**: Multi-result arrays (when the node emits an array of Classifications)
    - **Given** a value that's an array `[{ label: "INVOICE", confidence: 0.87 }, { label: "RECEIPT", confidence: 0.65 }]`
    - **When** rendered
    - **Then** the FIRST result renders prominently per Scenarios 2 + 3
    - **And** a small "+1 more" chip at the right opens a popover listing all results sorted by confidence desc
    - **And** the dispatch shell (US-141) treats `Classification[]` the same as `Classification` for this widget

- [ ] **Scenario 5**: Confidence rendering edge cases
    - **Given** a value with `confidence` outside `[0, 1]` (e.g., `1.5`, `-0.2`, `NaN`)
    - **When** rendered
    - **Then** the bar clamps to `[0, 100]` for visual purposes
    - **And** the label "%" text shows the raw value rounded to 2 decimals (so `1.5` displays as "150%" — surfaces a data-quality issue rather than silently hiding it)
    - **And** `NaN` confidence renders the bar at 0 and "—" as the text

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.test.tsx`
    - **When** tests run
    - **Then** at least 5 cases pass: green band, amber band, red band, rule-name shows/hides, array-multi-result rendering

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.test.tsx` — tests

## Technical notes

- Classification result shape: `{ label: string, confidence: number, ruleName?: string }`. Some catalog entries also include `metadata: Record<string, unknown>` (e.g., the matched-region polygon) — Phase 4 ignores it; Phase 4.x could surface it.
- The colour bands match the typical "high/medium/low confidence" UX convention used elsewhere in the app (Mantine palette).
- This is the simplest of the four widgets — ~60 LoC. Closes Milestone D.
- After landing: no Vite restart (frontend-only).
