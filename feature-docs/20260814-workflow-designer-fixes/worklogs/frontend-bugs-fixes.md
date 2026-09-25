# Worklog — frontend bugs (D7, D8, D12, D13)

Branch `feature/visual-workflow-builder`, 2026-08-15. The four bugs from the
developer's walkthrough that were diagnosed first and fixed second: laggy typing
in node config, the custom-step editor throwing the caret to the end of the
document, the doubled plus on the custom-nodes empty state, and the simplified
view toggle distorting the graph.

The diagnosis is `worklogs/frontend-bugs-investigation.md` (a read-only pass —
no application file was touched by it). Everything below is the code that
landed. Line numbers are against the working tree as it stands now.

**Provenance note.** The session that implemented these ran out before it could
write this file, so this worklog was reconstructed from the working-tree diff
and the tests in it. That constrains what it can claim: **nothing here was
verified in a browser**, and where the checklist or a source comment promises
evidence that the diff does not contain, it is called out rather than repeated.

---

## D7 — typing in node config fields is very laggy

*"Typing in the field is very laggy. I suspect it's the same problem as the HITL
page, where updates are causing a lot of the page to re-render when it really
shouldn't if broken up."*

### What was wrong

There was no local draft state anywhere on the input path, so **one keystroke
wrote a whole new `GraphWorkflowConfig` at page level**, and several consumers
did O(graph) work off that new object identity:

- the auto-wire resolver re-ran for every typed input port on every node (an
  upstream graph walk per port) and **rewrote downstream input bindings** from
  the half-typed value — so typing `c` → `cu` → `cur` into a map's *Item ctx
  key* bound the body node's input to ctx key `c`, then `cu`, then `cur`;
- those bindings are part of the canvas's structural fingerprint, so the canvas
  re-projected the whole graph per character, allocating a fresh object per node
  — which defeats xyflow's identity reuse and re-renders every card;
- and independently of all that, the validation hook handed out a brand-new
  `errorsByNode` Map on every config edit, 300 ms before the debounced validator
  it belongs to had run. That Map drove the canvas's badge-sync effect, whose
  `prev.map(...)` **always allocates**, so the xyflow node array was replaced
  even when not one badge count had moved.

Three changes, cheapest first.

### 1. The badge-sync effect stops replacing the node array for nothing

`canvas/WorkflowEditorCanvas.tsx:2620` carries the reason; the guard is a
`changed` flag declared at `:2629` and set in the patch branch at `:2659`, plus
`return changed ? next : prev` at `:2700`. This is the same shape the
hover-highlight effect twenty lines below (`:2719`) already used — it was the
model, not an invention.

### 2. The validation result stops changing identity between runs

`validation/useGraphValidation.ts`. The node-id list that bucketing resolves
anchors against (G-096) used to be read from the **live** `config`, which is why
`config` had to be a dependency of the result memo. It now travels with the run
that produced the errors:

- `:57` a new `ValidationRun { errors, knownNodeIds }`, with the reason written
  above it;
- `:106` the hook holds a `run` rather than an `errors` array;
- `:123` the debounced validator snapshots `Object.keys(config.nodes ?? {})`
  **inside** the run, so G-096's bucketing input is unchanged;
- `:136` the bucketing memo depends on `[run]` only — deliberately not on
  `isPending` either, since folding the pending flag in would hand out a new Map
  on the first keystroke of every editing burst for no change in contents;
- `:166` `isPending` is spread back on in a separate memo, so the public shape
  of `GraphValidationResult` is untouched.

### 3. Free-text fields draft locally and commit on a quiet moment

New hook: `apps/frontend/src/features/workflow-builder/use-debounced-text-commit.ts`.
`useDebouncedTextCommit(value, onChange, debounceMs = 250)` returns
`{ draft, setDraft, commit, flush }` — `setDraft` records a keystroke and
restarts the debounce (`:75`), `commit` sets and commits in one go for a
discrete choice such as picking an option (`:85`), `flush` commits whatever is
pending (`:67`).

The echo guard is the part that makes this safe, and it is the same defect class
as D8 one file over: a controlled field that also holds a draft has two writers,
and the parent's value arrives *late* — it is the draft coming back. So
`lastSyncedRef` (`:55`) records what was emitted **before** the parent can echo
it (`:70-71`), and the external-change effect at `:96-102` re-seeds only when
the incoming value is not that echo. Genuine external changes — an undo, an
agent write, a hydration — still land. Two backstops against losing a pending
commit: `flush` on blur at each call site, and an unmount flush at `:106-111`,
because selecting another node tears the settings panel down mid-burst.

Wired into the two components that own the free-text fields:

| file | what |
|---|---|
| `graph-widgets/VariablePicker.tsx:216` | the hook; both `Autocomplete` branches take `value={draft}` / `onChange={setDraft}` / `onOptionSubmit={commit}` / `onBlur={flush}` (`:317-323` and `:400-406`) |
| `graph-widgets/VariablePicker.tsx:235` | field drill-down re-expands against the **draft**, not the committed value, so the option list stays live while the graph work waits |
| `graph-widgets/VariablePicker.tsx:256-261` | "+ Create variable" flushes before declaring the key — that is a config write of its own and the two would otherwise race off the same stale config |
| `json-schema-form/JsonSchemaForm.tsx:263` | the hook, called **unconditionally** so hook order is stable across the schema branches; only the string branches read it (`:280-283` combobox, `:314-316` plain `TextInput`) |

The reviewer's exact field is covered: *Item ctx key* on a map node is a
`VariablePicker` (`settings/control-flow/MapNodeSettings.tsx:159-176`).

### How it is verified

- `use-debounced-text-commit.test.tsx` — six cases, all of which state a
  behaviour rather than an implementation: *"commits ONCE for a burst of
  keystrokes, not once per character"* (`:79`), *"does not lose characters typed
  while the parent is echoing the previous commit"* (`:98`), *"clearing the
  field stays cleared — the echo does not restore the old text"* (`:119`),
  *"still accepts a genuine external change (an undo, an agent write)"*
  (`:141`), *"flushes a pending commit on blur"* (`:159`), *"flushes a pending
  commit on unmount, so navigating away cannot drop it"* (`:172`).
- `validation/useGraphValidation.stability.test.ts` — *"keeps errorsByNode
  reference-identical across config edits until the debounced validator
  re-runs"* (`:45`, ten synthetic keystrokes, each asserting `toBe(settled)`)
  and *"still buckets against the graph's real node ids, including ids
  containing a dot (G-096)"* (`:64`), which is the regression guard on the thing
  the change moved.

Two honest gaps:

- **No test covers the canvas badge-sync guard directly.** The investigation
  proposed one (feed the updater a `prev` array whose counts already match and
  assert the returned array is `=== prev`); it was not written. The guard's
  correctness rests on reading it against its sibling at `:2719`.
- **`VariablePicker.test.tsx` and `JsonSchemaForm.test.tsx` are unmodified.**
  There is no new field-level assertion that typing no longer writes per
  character. What their unchanged passes do establish is compatibility: drafting
  did not change what either widget does from the outside.

**Measured 2026-08-15, after this worklog's first draft**, by
`measure-typing.mjs` in this folder — 30 characters typed with no delay between
keys into `multi-page-report` (22 cards on the canvas) with the
`processSegments` map node selected, three rounds, alternating, medians below.
Dev build (Vite dev server, development React), which is the build the defect
was reported against.

| | **Node label**<br>whole-config write per keystroke<br>*(NOT part of this change)* | **Map item ctx key**<br>*(the D7 path)* |
|---|---|---|
| React commits for 30 keystrokes | 152 | 68 |
| Wall time for the burst | 6752 ms (225 ms/char) | 567 ms (19 ms/char) |
| Long tasks (>50ms) during the burst | 37, 5286 ms total, longest 447 ms | 1, 234 ms total |
| …of those, after the last keystroke | 1 (208 ms) | 1 (234 ms) — all of it |

**What the left column is, and is not.** It is *not* a recording of the pre-fix
build: the fix is in the working tree and the tree is shared, so there is
nothing to check out. It is the **Node label** field on the same panel of the
same node in the same page load — a field this change did not touch, which
still calls `updateNode` on every keystroke (`NodeSettingsPanel.tsx:324` →
`:214`), i.e. the pre-fix path still live in the shipped build. The right-hand
column additionally re-expands its option list against the draft on every
keystroke, work the left column does not do at all, so the comparison is loaded
against the fix.

The shape matters more than the ratio: the debounced field's **only** long task
arrives after the typing stops — the single commit — while the per-keystroke
field blocks the main thread 37 times *during* the burst. That is the reported
symptom, and it is measured rather than asserted. React commits were counted by
a stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` installed before the app loads; long
tasks by `PerformanceObserver`.

---

## D8 — the custom-step editor jumps the caret to the end of the last line

*"The editor occasionally forces the cursor to the end of the last line. Maybe
this is happening when it reloads? Makes it very frustrating to type."*

### What was wrong

Monaco is driven as a fully controlled `value` with a 150 ms debounced
round-trip through the parent, so the `script` prop is **the pane's own text
echoed back late**. `@monaco-editor/react` applies a `value` that differs from
`editor.getValue()` as a single full-model `executeEdits` with
`forceMoveMarkers: true` — caret to the end of the document — and suppresses
`onChange` for that programmatic edit, so nothing ever self-corrected. Resume
typing inside the echo window (which opens every time you pause between words)
and the stale echo wins: characters gone, caret moved.

The same path had a deterministic sibling: clearing the editor round-tripped an
empty string, hit the `script || DYNAMIC_NODE_BOILERPLATE` fallback, and
re-inserted the whole boilerplate.

The reviewer's "when it reloads" hunch was a real second contributor: the
hydration effect had no once-per-lineage guard, and three modals mount the
editor while the detail fetch is still in flight.

### What changed

**`dynamic-nodes/CodePane.tsx`** — the echo guard:

- `:251` `lastEmittedRef`, documented as what it is: `script` is not an
  independent input.
- `:365-366` the ref is assigned **before** `onChangeRef.current(debouncedText)`
  fires, so the echo always arrives strictly later and is always recognised.
- `:258-267` the re-seed effect keeps its "the prop genuinely changed" check
  (`:258`) and then adds `if (script === lastEmittedRef.current) return;`
  (`:266`) — so a stale echo is dropped and only a genuine external change
  re-seeds. This is also what makes clearing the editor stick.

**`dynamic-nodes/DynamicNodeEditor.tsx`** — the reload half, and it went one
step further than the "once-per-slug guard" the checklist describes:

- `:200-205` `hydratedSlugRef` — hydrate from `headScript` once per lineage, so
  the post-Publish detail invalidation cannot clobber the buffer.
- `:396-415` in edit mode, **while `detailQuery.isLoading` the editor is not
  rendered at all** — a loader and "Loading {slug}…" instead. Nothing may be
  typed into a buffer that is about to be replaced. The full-page route
  (`DynamicNodeEditPage`) always gated on `isLoading` and was immune; the three
  modal mount sites are fixed here in one place rather than three.
- `:363` revert now re-seeds the editor explicitly (`setCurrentText(version.script)`)
  in the publish-success handler. It used to get there indirectly, via the
  invalidated query re-running the hydration effect — which the once-per-lineage
  guard closes, so revert has to state its own intent.

### How it is verified

`dynamic-nodes/CodePane.spec.tsx` gained a controlled harness (`ControlledCodePane`,
`:302`) — the pre-existing `renderPane` passes a static `script`, which is why
the round-trip was invisible to the old suite — and three cases at `:324`:

- *"clearing the editor stays cleared — it does not re-insert the boilerplate"*
  (`:325`);
- *"keeps characters typed while the previous commit is still echoing back"*
  (`:343`), which switches to **real timers on purpose**: fake timers collapse
  the debounce and the echo into the same tick, so the window the bug lives in
  never opens;
- *"still accepts a genuine external re-seed (a revert pushing new text in)"*
  (`:374`).

`dynamic-nodes/DynamicNodeEditor.spec.tsx:537`, *"D8: a late fetch must not
clobber the buffer"* — *"offers no editor to type into while the detail fetch is
in flight"* (`:538`), *"hydrates once per lineage — the post-Publish refetch does
not re-seed the buffer"* (`:574`), *"revert still pushes the reverted script into
the editor"* (`:620`).

**What none of these prove: the caret.** The spec says so itself, at
`CodePane.spec.tsx:295`:

> Note what these CANNOT prove: the caret. The stub above is a React-controlled
> `<textarea>`, and React preserves the caret on one of those. Real Monaco
> applies a changed `value` as a full-model `executeEdits` with
> `forceMoveMarkers: true`, which is the caret jump. That half is covered by the
> Playwright check in tests/e2e/workflow-builder.

**That last sentence is not true of this working tree.** Nothing under
`tests/e2e/` is added or modified, and no spec in `tests/e2e/workflow-builder/specs/`
mentions the caret or cursor. So the caret itself is currently unproven: the
tests pin the *mechanism* (the stale echo no longer wins), and the caret jump is
the documented consequence of that mechanism, but no test exercises real Monaco.
Either the e2e check gets written, or the comment should be corrected.

---

## D12 — the custom-nodes empty state rendered two plus symbols

Screenshot: `source/dylan-double-plus-button.png`, the button reading
`+ + Create your first`.

### What was wrong

One plus came from `leftSection={<IconPlus size={16} />}`
(`pages/dynamic-nodes/DynamicNodesListPage.tsx:181`), the other was a literal
`+ ` at the head of the label. The file's own header comment repeated the
mistake.

### What changed

`DynamicNodesListPage.tsx:185` — the literal is gone and the button names its
object: **"Create your first custom node"**. "Create your first" on its own is a
dangling fragment, and the button's accessible name is all a screen reader gets;
the surrounding "No custom nodes yet" is not read with it. The header comment at
`:18` now describes the real state.

### How it is verified

`DynamicNodesListPage.spec.tsx:198`, inside the existing empty-state case:
`expect(getByTestId("dynamic-nodes-list-empty-cta")).toHaveAccessibleName("Create your first custom node")`,
with the reason written above it at `:194`. An accessible-name assertion rather
than a text match, because the doubled plus was a rendering artefact of the icon
plus the label, which is exactly what the accessible name composes.

**Outstanding:** before/after frames. Per the checklist, the empty state is
unreachable on a seeded database without deleting the custom node the Part 14
demo depends on, so capturing it needs the list API intercepted. Not done here.

---

## D13 — toggling "Simplified view" distorts the layout

*"Turning Simplified view on and off does some weird things to the formatting."*

### What was wrong

Not a canvas bug. **Toggling the switch silently reverted the editor's whole
config to the raw server copy.**

`simplifiedView` was closed over by `runAutoArrange`, whose identity flows
through `handleArrangeOnLoad` → `scheduleArrangeOnLoad` into the dependency
array of the server-hydration effect. `scheduleArrangeOnLoad` was that effect's
only unstable dependency, and it changed for exactly one reason: the toggle
flipped. The effect's guards are "edit mode with a workflow" and "no unsaved
changes" — and the arrange-on-load path deliberately re-bases the hydration
reference so demos do not open dirty, so a freshly arranged workflow is *clean*
and unprotected. Every flip therefore re-ran the hydrate: the measured
arrange-on-load layout was replaced by the loose pre-mount fallback (uniform
default widths), and `setName(existingWorkflow.name)` reverted an unsaved
rename. Neither left an undo step.

The reason it reads as "on **and** off" is ordering: child effects run before
parent effects, and the canvas fingerprint excludes positions, so the ON flip
re-projects from the still-good config and only the OFF flip re-projects from
the reverted one.

### What changed

Both fixes the investigation proposed, together — the narrow one and the
structural one.

- `WorkflowEditorV2Page.tsx:748-749` — `simplifiedViewRef`, assigned during
  render. `runAutoArrange` reads `simplifiedViewRef.current` at call time
  (`:779`), which is *when it always read the flag*; only the callback's
  identity changes, and its dependency array is now `[]` (`:796`). This alone
  fixes D13.
- `WorkflowEditorV2Page.tsx:1050` — `hydratedFromRef`, and the guard at
  `:1054-1055`: hydration is driven by "the **server copy** changed", never by
  the identity of anything inside the component, so a future unstable dependency
  cannot quietly turn a UI change back into a document rewrite. TanStack Query's
  structural sharing keeps `existingWorkflow` referentially stable across
  refetches that return equal data, so §4.4 (adopt the agent's write) still
  fires.

### How it is verified

`WorkflowEditorV2Page.test.tsx:3123`, *"D13: the simplified-view toggle must not
re-hydrate"* — four cases, each one of the symptoms:

- *"keeps the measured arrange-on-load layout across an ON/OFF toggle pair"*
  (`:3140`) — a position-less seeded config with measured node widths, snapshot
  the arranged positions after `fitView`, toggle twice, assert unchanged.
- *"keeps an unsaved rename across an ON/OFF toggle pair"* (`:3167`) — the title
  writes `name` state only, never `config`, so the effect's dirty guard never
  protected it.
- *"states the invariant directly: the config handed to the canvas is
  reference-identical across a toggle pair"* (`:3199`). The fixture is chosen so
  the compare is not vacuous: it carries a lineage `description` and no
  `metadata.description`, which makes the R-2 seeding branch allocate a fresh
  config every time the effect runs.
- *"still arranges the CHIP graph when the toggle is on — the flag is read at
  call time, not captured"* (`:3221`) — the guard against the ref freezing the
  flag, which is the one way this fix could have broken the feature.

Nothing about the group-box sizing (the investigation's secondary finding, and
its own explicitly-labelled guess about `requestAnimationFrame` ordering) was
touched. It remains open and unconfirmed.

---

## Test runs

Run in this session, from `apps/frontend`, with the repo-root vitest — nothing
was installed:

```
vitest run  use-debounced-text-commit.test.tsx
            validation/useGraphValidation.stability.test.ts
            dynamic-nodes/CodePane.spec.tsx
            dynamic-nodes/DynamicNodeEditor.spec.tsx
            src/pages/dynamic-nodes/DynamicNodesListPage.spec.tsx
  Test Files  5 passed (5)      Tests   41 passed (41)

vitest run  WorkflowEditorV2Page.test.tsx
            graph-widgets/VariablePicker.test.tsx
            json-schema-form/JsonSchemaForm.test.tsx
  Test Files  3 passed (3)      Tests  158 passed (158)

vitest run  canvas/WorkflowEditorCanvas.test.tsx
  Test Files  1 passed (1)      Tests  218 passed (218)
```

The standing state reported for the branch as a whole — 2381 frontend tests
passing and `tsc --noEmit` clean — comes from the parent session, not from this
one; the runs above are what was executed here. The Playwright e2e suite was
deliberately not run (its global setup resets and reseeds the dev database).

## Shared files

`canvas/WorkflowEditorCanvas.tsx`, `WorkflowEditorV2Page.tsx` and
`dynamic-nodes/DynamicNodeEditor.tsx` all carry other agents' work in the same
diff (D9's data-drop classification and D28's run-order handles on the canvas,
D11's restore copy on the editor page, D3's publish-failure surface in the
dynamic-node editor). The edits described here are the ones tagged `D7`, `D8`
and `D13` in their own comments; no file was reformatted.
