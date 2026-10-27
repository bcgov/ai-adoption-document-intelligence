# Frontend bugs investigation — D7, D8, D12, D13

Investigation pass only. **No application file was edited.** Screenshots of the
"before" state were being captured in parallel, so nothing that could change the
UI was touched.

Every claim below is cited `file:line` against
`feature/visual-workflow-builder` at commit `a8ee4705`. Anything not established
from the code is labelled a **guess**.

---

## D7 — typing in node config fields is very laggy

### Symptom

Keystrokes in the right-rail node settings lag behind the keyboard. The
reviewer's step-7 case is the **Item ctx key** field on a *Run for each item*
(map) node. He suspected "the same problem as the HITL page, where updates are
causing a lot of the page to re-render when it really shouldn't". He is right,
and it is the same class of bug in both places.

### Root cause

There is no local draft state anywhere on the input path. **Every keystroke
replaces the entire workflow config object at page level**, and four separate
consumers do O(graph) work off that new object identity.

**1. The field is fully controlled by page state, one write per character.**

- `settings/control-flow/MapNodeSettings.tsx:64` —
  `const setItemCtxKey = (next: string) => updateNode({ ...node, itemCtxKey: next });`
- `settings/control-flow/MapNodeSettings.tsx:54` — `updateNode` is
  `onConfigChange(replaceNode(config, node.id, next))`
- The same shape for schema-driven activity parameters:
  `settings/NodeSettingsPanel.tsx:656-657` —
  `const setParameters = (parameters) => onConfigChange(replaceNode(config, node.id, { ...node, parameters }))`
  fed by a plain controlled `TextInput` at
  `json-schema-form/JsonSchemaForm.tsx:296-307` (no debounce, no local state).

**2. Each write runs the whole auto-wire resolver, then pushes an undo entry.**

- `WorkflowEditorV2Page.tsx:665-676` — `handleCanvasConfigChange` calls
  `setConfig(resolveBindings(stripped))`.
- `packages/graph-workflow/src/auto-wire/resolver.ts:16` — `resolveBindings`
  walks every typed input port on every consumer node, and
  `resolve-input-port.ts` does an upstream graph walk **per port**. Cost is
  roughly O(nodes × ports × (nodes + edges)) per character.
- `use-config-history.ts` `setConfig` — a history entry per character (bounded
  at `CONFIG_HISTORY_LIMIT = 50`, so undo also becomes per-character; cheap in
  memory, but it means one undo un-types one letter).

**3. — this is the expensive one — the canvas fully re-projects on every
character of this particular field.**

The canvas gates re-projection on a structural fingerprint
(`canvas/WorkflowEditorCanvas.tsx:2149` `buildStructuralFingerprint`, memoised
at `:2326`). That fingerprint deliberately excludes activity `parameters`, but
it **includes every node's `inputs` bindings**
(`canvas/WorkflowEditorCanvas.tsx:2189-2199`, the `bindings:` block).

And `resolveBindings` rewrites downstream input bindings from the map's
`itemCtxKey` on every character:

```
packages/graph-workflow/src/auto-wire/resolver.ts:152-155
  const existing = nextInputs.find((b) => b.port === port.name);
  if (existing && existing.ctxKey === producerCtxKey) continue;
  nextInputs = nextInputs.filter((b) => b.port !== port.name);
  nextInputs.push({ port: port.name, ctxKey: producerCtxKey });
```

where `producerCtxKey` for a map's `item` port resolves to the author-typed
`itemCtxKey` (`auto-wire/ctx-source.ts:179`, `:265-270`;
`auto-wire/resolve-input-port.ts:166-192`). Typing `c` → `cu` → `cur` … binds
the body node's input to ctx key `c`, then `cu`, then `cur` — **a different
fingerprint every keystroke**.

That fires the structural sync effect at
`canvas/WorkflowEditorCanvas.tsx:2483-2548`, which per character:

- runs `deriveWires(config)` — a full upstream graph walk (its own comment at
  `:2331-2336` says it "must NOT rerun on every config identity change"; the
  fingerprint change defeats that guard here),
- runs `projectFlowNodes` (`:1593-1600`), which **allocates a brand-new object
  for every node on the canvas** — so xyflow's `checkEquality` reuse in
  `adoptUserNodes` (`node_modules/@xyflow/system/dist/esm/index.mjs:1613`) fails
  for all of them and **every node component re-renders**,
- re-projects group containers and schedules a `requestAnimationFrame`
  re-measure pass (`:2525-2531`).

A visible tell of this, worth checking against the "before" screenshots: the
projection resets `errorCount: 0, warningCount: 0` on every node
(`canvas/WorkflowEditorCanvas.tsx:1613-1614`) and the badge-sync effect patches
the real counts back afterwards — so **problem badges flicker to zero and back
on each keystroke**.

**4. A second, unconditional canvas re-render per keystroke, independent of the
fingerprint.**

`validation/useGraphValidation.ts:134` — the result memo's deps are
`[errors, isPending, config]`, so `errorsByNode` is a **fresh `Map` on every
keystroke** even though the debounced validator (`:85-102`, 300 ms) has not run.

That new Map identity drives the badge-sync effect at
`canvas/WorkflowEditorCanvas.tsx:2629-2706`, whose updater is
`setInternalNodes((prev) => prev.map(...))` — `Array.prototype.map` **always
allocates a new array**, so the xyflow node state is replaced on every keystroke
even when nothing changed. The sibling hover-highlight effect immediately below
gets this right and is the model to copy:

```
canvas/WorkflowEditorCanvas.tsx:2723
  return changed ? next : prev;
```

**5. The picker itself recomputes graph analyses per keystroke.**

`graph-widgets/VariablePicker.tsx:208-232` — `buildVariableOptions` (which runs
`analyzeMapBody` for **every map node in the graph**, `:105-121`) is memoised on
`[config, currentNodeId]`, and `expandVariableOptions` on
`[baseGroups, config, value, currentNodeId]`. Both deps change on every
character. Three pickers are mounted on a map node
(`MapNodeSettings.tsx:147-179`).

**6. Nothing memoises the boundaries.** `NodeSettingsPanel`
(`settings/NodeSettingsPanel.tsx:123`) and `WorkflowEditorCanvas`
(`canvas/WorkflowEditorCanvas.tsx:2211`) are plain function components, and both
receive the new `displayConfig` (`WorkflowEditorV2Page.tsx:652-663`) every
keystroke, so `React.memo` would not help on its own — the prop genuinely
changes. The fix has to be to stop the write, not to memo around it.

### Is the HITL page the same root cause? Yes — same class.

`features/annotation/hitl/pages/ReviewWorkspacePage.tsx` is a single 1213-line
component that owns the field values in page state and re-renders the document
canvas + box overlay + full field list on every character:

- `:1129-1136` — `Textarea value={displayValue} onChange={… handleFieldChange …}`
- `:547-569` — `handleFieldChange` does **three** state updates per character:
  `pushUndo(...)`, then `setCorrectionMap(...)`.
- `hooks/useUndoRedo.ts:35-38` — `pushUndo` is
  `setUndoStack(prev => [...prev, entry]); setRedoStack([]);` — the redo reset
  **allocates a new empty array every time**, so it forces a re-render even when
  the redo stack was already empty, and the undo stack grows one entry per
  character with no bound.
- `:1141-1147` — the per-row `error={fieldValidators[field.fieldKey]!(displayValue)}`
  re-runs every validator on every render of the list.

Same shape as D7: **the text field's value lives in a large page-level state
object, and there is no memoisation boundary between the field and the heavy
sibling (React Flow canvas here, the document canvas + overlay there).**

### Proposed fix

Ordered cheapest-first; 1 and 2 are the ones that matter.

**Fix 1 — local draft state + commit on debounce/blur for the config fields.**
This is the single change that removes the per-character graph work. Add an
internal-mirror hook (the pattern already exists and works in this repo —
`dynamic-nodes/CodePane.tsx:152-259` — but implement it with the echo guard from
D8's fix so it does not inherit that bug):

```tsx
// graph-widgets/VariablePicker.tsx (and JsonSchemaForm's string TextInput)
const [draft, setDraft] = useState(value);
const lastEmitted = useRef(value);
useEffect(() => {           // accept genuine external changes only
  if (value === lastEmitted.current) return;
  lastEmitted.current = value;
  setDraft(value);
}, [value]);
const [debounced] = useDebouncedValue(draft, 250);
useEffect(() => {
  if (debounced === lastEmitted.current) return;
  lastEmitted.current = debounced;
  onChange(debounced);
}, [debounced]);
// Autocomplete: value={draft} onChange={setDraft} onBlur={flush}
```

Note the behavioural change this implies for the walkthrough: the green loop
wire in GALLERY stop 7 will appear ~250 ms after the author stops typing rather
than mid-word. That is arguably better than today (today it re-derives a wire
for `c`, `cu`, `cur`, …) but it is a visible change and stop 7's "Give the loop a
moment" wording should be checked against it.

**Fix 2 — stop the badge-sync effect replacing the node array when nothing
changed.** `canvas/WorkflowEditorCanvas.tsx:2633-2706`, mirroring `:2723`:

```tsx
setInternalNodes((prev) => {
  let changed = false;
  const next = prev.map((n) => { /* …existing body…*/ });
  return changed ? next : prev;   // set `changed = true` in each patch branch
});
```

**Fix 3 — make `errorsByNode` stop changing identity on every config edit.**
`validation/useGraphValidation.ts:134` — drop `config` from the result memo's
deps and take the node-id list from the debounced run instead: capture
`Object.keys(config.nodes)` inside the `setTimeout` at `:88` and store it in
state alongside `errors`, so the memo depends on `[errors, isPending,
knownNodeIds]`. This keeps the G-096 fix (bucketing against real node ids)
while making the result stable between validator runs.

**Fix 4 (optional) — memoise the pickers.** Once Fix 1 lands, `config` still
changes on commit; wrapping `VariablePicker` in `React.memo` buys nothing
because `config` is a prop. If profiling still shows cost, narrow
`buildVariableOptions`'s input to `{ ctx, nodes }` rather than the whole config
so a `metadata.position` change does not invalidate it.

**HITL (D7's sibling, out of scope for this checklist item but same fix):**
push the `Textarea` into a memoised `FieldRow` component holding its own draft
state, commit on debounce/blur, and coalesce `pushUndo` per editing burst rather
than per character (`useUndoRedo.ts:35-38`; also `setRedoStack([])` should be
`setRedoStack(prev => prev.length === 0 ? prev : [])`).

### Risk

- **Medium.** Draft state on a controlled field is exactly the pattern that
  produced D8. The echo guard (`lastEmitted`) is mandatory, not optional.
- Debouncing the commit changes *when* auto-wire runs, which changes when the
  derived green wire appears. Several e2e tests assert on wires appearing after
  typing into these fields — expect to add `await expect(...).toBeVisible()`
  waits rather than immediate assertions. Candidates to check:
  `features/workflow-builder/WorkflowEditorV2Page.test.tsx`, the
  `canvas/WorkflowEditorCanvas.test.tsx` suite, and `InputsSection.test.tsx`.
- Fix 2 and Fix 3 are low risk and independently shippable — do those first.

### What test would prove it

1. **Render-count regression test (proves the mechanism, not the feel).** In
   `WorkflowEditorV2Page.test.tsx`, mount the editor on a graph with a map node,
   wrap `WorkflowEditorCanvas` in a spy that counts renders, type 10 characters
   into `[data-testid="map-node-settings-item-ctx-key"]`, assert the canvas
   rendered **≤ 2 times** (today: ≥ 20 — one per character per pass).
2. **Projection-count test.** Spy on `deriveWires` and assert it is called once
   per committed value, not once per character.
3. **Guard test for Fix 2.** Unit-test the badge-sync updater directly: feed it
   a `prev` array and an `errorsByNode` Map whose counts already match, and
   assert the returned array is `=== prev`.
4. **Playwright feel test (the honest one).** Type a 20-character ctx key with
   `delay: 30`, and assert the field's final value equals what was typed *and*
   that no character was dropped. Today, under a slow CPU throttle, the
   re-projection can eat keystrokes — worth confirming in the browser, because
   jsdom cannot show it (see the standing `jsdom can't see pixels` lesson).

---

## D8 — the custom-step code editor forces the cursor to the end of the last line

### Symptom

While typing in the dynamic-node (custom step) script editor, the caret
occasionally jumps to the end of the last line, and characters typed just before
the jump are lost. The reviewer guessed "maybe this is happening when it
reloads".

### Root cause

The editor is Monaco via `@monaco-editor/react@4.7.0`, driven as a **fully
controlled `value` prop**, with a **150 ms debounced round-trip through the
parent's state**. The parent's `script` prop is the CodePane's own text echoed
back late; when the author types during the echo window, the stale echo
overwrites the live text, and the wrapper applies that as a full-model edit.

**The caret-moving primitive** — `@monaco-editor/react`'s `value` effect
(`node_modules/@monaco-editor/react/dist/index.js`, minified; unminified shape):

```js
} else if (value !== editorRef.current.getValue()) {
  preventTriggerChangeEvent.current = true;
  editorRef.current.executeEdits('', [{
    range: editorRef.current.getModel().getFullModelRange(),
    text: value,
    forceMoveMarkers: true,          // <-- moves the caret to end of inserted text
  }]);
  editorRef.current.pushUndoStop();
  preventTriggerChangeEvent.current = false;
}
```

Whenever the `value` prop is not `===` to `editor.getValue()`, **the whole model
is replaced in one edit with `forceMoveMarkers: true`** → caret to end of
document. `preventTriggerChangeEvent` suppresses `onChange` for that programmatic
edit, so the parent never learns its stale text won and nothing self-corrects.

**The loop that feeds it a stale value:**

- `dynamic-nodes/CodePane.tsx:356-362` — `<Editor value={internalText} …
  onChange={(v) => setInternalText(v ?? "")} />` (controlled).
- `dynamic-nodes/CodePane.tsx:252-259` — `internalText` is debounced 150 ms
  (`ONCHANGE_DEBOUNCE_MS`, `:74`) and pushed to the parent via
  `onChangeRef.current(debouncedText)`.
- `dynamic-nodes/DynamicNodeEditor.tsx:371-373` — `<CodePane script={currentText}
  onChange={setCurrentText} />`. So `script` **is** CodePane's own text, 150 ms
  late.
- `dynamic-nodes/CodePane.tsx:160-166` — and that echo is written back into the
  editor:
  ```tsx
  const lastHydratedScriptRef = useRef<string>(script);
  useEffect(() => {
    if (script !== lastHydratedScriptRef.current) {
      lastHydratedScriptRef.current = script;
      setInternalText(script || DYNAMIC_NODE_BOILERPLATE);
    }
  }, [script]);
  ```
  The comment at `:157-159` claims this only fires "when the prop genuinely
  changed" — but the prop genuinely changes on **every debounce cycle**.

**The race, step by step:**

1. Author pauses ≥ 150 ms → `useDebouncedValue` fires → `debouncedText = T_A`.
2. Effect at `CodePane.tsx:257-259` calls `onChange(T_A)` → parent
   `setCurrentText(T_A)`.
3. Parent re-renders the whole editor tree, including a full TypeScript
   signature parse at `DynamicNodeEditor.tsx:181-185`
   (`parseDynamicNodeSignature(currentText)`), plus the signature and version
   panes — tens of milliseconds on a real script.
4. **The author resumes typing inside that window** → `setInternalText(T_B)`.
5. CodePane renders with `internalText = T_B` but `script = T_A`; the effect at
   `:161` force-writes `setInternalText(T_A)`.
6. Next render: `value = T_A`, `editor.getValue() = T_B` → full-model
   `executeEdits` with `forceMoveMarkers` → **caret to end of last line**, and
   the characters typed in the window are silently discarded.

"Occasionally" is exactly right: it needs a keystroke inside the ~10–50 ms
window that opens right after a ≥ 150 ms pause — i.e. every time you pause
between words and keep going.

**A deterministic sibling of the same bug**, worth fixing in the same change:
`CodePane.tsx:164` — `setInternalText(script || DYNAMIC_NODE_BOILERPLATE)`.
Select-all + Delete → `internalText = ""` → 150 ms later `script = ""` → falsy →
**the whole boilerplate is re-inserted** and the caret lands at its end. 100%
reproducible, no race required.

**The reviewer's "when it reloads" hunch is a real second contributor**, just
not the main one — `DynamicNodeEditor.tsx:160-164`:

```tsx
useEffect(() => {
  if (slug && headScript !== undefined) {
    setCurrentText(headScript);
  }
}, [slug, headScript]);
```

The dep is a *string*, not the query `data` object, so the classic
"new object per refetch" trap is avoided. But there is no once-per-slug guard,
so it clobbers in two real situations:

- **Modal mounts.** `canvas/WorkflowEditorCanvas.tsx:4665`,
  `palette/ActivityPalette.tsx:400` and
  `settings/dynamic-node/DynamicNodeSettings.tsx:183` mount `DynamicNodeEditor`
  immediately with `detailQuery` still loading; `initialScript` is `""`
  (`DynamicNodeEditor.tsx:152-155`) so the boilerplate shows, and when the fetch
  lands 200–500 ms later `headScript` changes → clobber. The full-page route
  `pages/dynamic-nodes/DynamicNodeEditPage.tsx:32-46` gates on `isLoading` and
  is immune; the three modal mounts are not.
- **After Publish.** `useDynamicNodePublish.ts:83-85` invalidates the detail
  query → refetch → new `headScript` → same clobber.

**Ruled out:** no `key` prop on any of the five mount sites; no `refetchInterval`
on the dynamic-node queries (`useDynamicNode.ts:37-53`); global query defaults
are safe (`data/queryClient.ts:6-8`, `staleTime: 5min`,
`refetchOnWindowFocus: false`); no prettier/trim/JSON round-trip on the text path
(`parseDynamicNodeSignature` is read-only).

**Aggravating (does not move the caret alone, but widens the window):** the
canvas polls node statuses every 1.5 s while a run is active
(`run/useNodeStatuses.ts:144-159`), re-rendering the modal-hosted editor; and
`CodePane.tsx:363-369` passes a **fresh `options` object literal** and `:362` a
**fresh `onChange` arrow** on every render, so the wrapper calls
`updateOptions` and disposes/re-subscribes `onDidChangeModelContent` on every
single render. *(Guess: this is why it feels worse in the canvas modal than on
the standalone page.)*

### Proposed fix

**A — ignore the echo of our own edits (primary).** `CodePane.tsx:160-166` and
`:257-259`:

```tsx
const lastEmittedRef = useRef<string>(script);     // new, next to lastHydratedScriptRef (:160)

useEffect(() => {                                   // replaces :257-259
  lastEmittedRef.current = debouncedText;           // record BEFORE the parent echoes back
  onChangeRef.current(debouncedText);
}, [debouncedText]);

useEffect(() => {                                   // replaces :161-166
  if (script === lastHydratedScriptRef.current) return;
  lastHydratedScriptRef.current = script;
  // The parent's `script` is our own debounced text coming back. Re-seeding
  // from a stale echo overwrites characters typed since the debounce fired,
  // which @monaco-editor/react applies as a full-model executeEdits
  // (forceMoveMarkers) — the caret jumps to the end of the document.
  if (script === lastEmittedRef.current) return;
  setInternalText(script || DYNAMIC_NODE_BOILERPLATE);
}, [script]);
```

`lastEmittedRef` is assigned synchronously in the same effect that calls
`onChange`, so the echo always arrives strictly later and is always recognised.
This kills the race **and** the select-all-delete → boilerplate re-insertion.

**B — hydrate from the query once per lineage.** `DynamicNodeEditor.tsx:160-164`:

```tsx
const hydratedSlugRef = useRef<string | null>(null);
useEffect(() => {
  if (!slug || headScript === undefined) return;
  if (hydratedSlugRef.current === slug) return;
  hydratedSlugRef.current = slug;
  setCurrentText(headScript);
}, [slug, headScript]);
```

**C — structural hardening (optional, do only if A+B prove insufficient).** Drop
the controlled `value` at `CodePane.tsx:356`: pass `defaultValue` and perform
genuine external hydrates imperatively, without `forceMoveMarkers` and
restoring the caret:

```tsx
const ed = editorRef.current, model = ed?.getModel();
if (ed && model && ed.getValue() !== next) {
  const pos = ed.getPosition();
  ed.executeEdits("hydrate", [{ range: model.getFullModelRange(), text: next }]);
  ed.pushUndoStop();
  if (pos) ed.setPosition(pos);
}
```

**D — cheap wins.** `useMemo` the `options` object (`CodePane.tsx:363-369`) and
`useCallback` the `onChange` arrow (`:362`).

### Risk

- **A is low risk and self-contained** — it only ever *skips* a redundant
  re-seed. The one behaviour it changes deliberately: clearing the editor
  completely no longer re-inserts the boilerplate. That is the desired
  behaviour, but confirm nobody relies on "clear to reset".
- **B is low risk** but changes revert/restore behaviour: if a revert is meant
  to push new text into an open editor, the once-per-slug guard would block it.
  Check `handleRevert` / the version-history pane
  (`dynamic-nodes/VersionHistoryPane.tsx`) before shipping B — if revert must
  re-seed, key the guard on `slug + versionNumber` rather than `slug`.
- **C is the highest risk** (uncontrolled editor changes the testing surface)
  and should not be bundled with A/B.

### What test would prove it

**The existing unit tests structurally cannot catch this.**
`CodePane.spec.tsx:40-54` stubs `@monaco-editor/react` with a plain
React-controlled `<textarea>` — React preserves the caret on a controlled
textarea, so the `executeEdits` behaviour that *is* the bug is mocked away.
`DynamicNodeEditor.spec.tsx:226` and `:305` assert `editor.value` only.

1. **Deterministic, fails today, no Monaco needed.** Add a *controlled* harness
   to `CodePane.spec.tsx` (the current `renderPane` at `:56-68` passes a static
   `script`, which is why the loop is invisible): parent holds `script` in
   state, `onChange={setS}`. Clear the editor, advance timers 300 ms, assert the
   value is `""` — today it becomes `DYNAMIC_NODE_BOILERPLATE`.
2. **The race, unit-level.** Same harness, parent echoes asynchronously
   (`onChange={(v) => setTimeout(() => setS(v), 0)}`, a fair model of the
   expensive parse at `DynamicNodeEditor.tsx:181-185`). Type `T_A`, advance
   150 ms, type `T_B` before the echo lands, advance 10 ms, assert the value is
   `T_B` — today it reverts to `T_A`.
3. **Proves the caret specifically — needs real Monaco, so Playwright.** The
   document text reveals where the caret was, so no Monaco API access is needed:
   open `/dynamic-nodes/:slug`, click at the start of line 1, `Home`, type `X`,
   wait 200 ms (forces a full debounce round-trip), type `Y`, assert line 1
   begins with `XY`. Today `Y` lands at the end of the last line. Repeat the
   cycle 10× to catch the probabilistic variant.
4. **Regression guard for the reload path (B).** Mount the editor via the canvas
   modal with a delayed `GET /api/dynamic-nodes/:slug` (MSW `delay(400)`), type
   at t=100 ms, assert the typed text survives the fetch landing.

---

## D12 — dynamic-nodes empty state renders "+ + Create your first"

### Symptom

The empty-state CTA on **Custom nodes** reads `+ + Create your first` — a plus
from the icon prop and a second, literal plus in the label.

### Root cause

`pages/dynamic-nodes/DynamicNodesListPage.tsx:180-186`:

```tsx
<Button
  leftSection={<IconPlus size={16} />}
  onClick={() => navigate("/dynamic-nodes/new")}
  data-testid="dynamic-nodes-list-empty-cta"
>
  + Create your first
</Button>
```

`leftSection={<IconPlus size={16} />}` at `:181` renders the first plus; the
literal `+ ` at the head of the label on `:185` renders the second. The file's
own header comment repeats the mistake — `DynamicNodesListPage.tsx:17` documents
the empty state as `"No custom nodes yet" + "+ Create your first"`.

### Proposed fix

Drop the literal, keep the icon. `DynamicNodesListPage.tsx:185`:

```diff
-              + Create your first
+              Create your first custom node
```

and fix the doc comment at `:17` to match. "Create your first" alone is a
dangling phrase — the surrounding copy says "No custom nodes yet", so naming the
object in the button makes it readable on its own, which is how a screen reader
will read it.

*(Sibling for consistency, not required: `WorkflowListPage.tsx:164` uses the
same empty-state pattern without the doubled plus — that one is already
correct.)*

### Risk

**Trivial.** The only coupling is any test that matches the button by text.
`data-testid="dynamic-nodes-list-empty-cta"` (`:184`) exists, so selector-based
tests are unaffected; grep for `Create your first` in
`apps/frontend/src/**/*.spec.tsx` and `e2e/` before changing the wording.

### What test would prove it

An assertion on the button's accessible name in the dynamic-nodes list empty
state: `expect(screen.getByTestId("dynamic-nodes-list-empty-cta")).toHaveAccessibleName("Create your first custom node")`.
A snapshot would also catch it but would be noisier.

---

## D13 — toggling "Simplified view" distorts the layout

### Symptom

"Turning Simplified view on and off does some weird things to the formatting."
Switching ON looks fine; switching back OFF is when the graph jumps.

### Root cause

**This is not a canvas bug. Toggling the switch silently reverts the editor's
whole config to the raw server copy.**

The toggle is page state at `WorkflowEditorV2Page.tsx:369`
(`const [simplifiedView, setSimplifiedView] = useState(false)`), wrapped at
`:377-382`, rendered at `:1708-1723`
(`data-testid="simplified-view-toggle"`), passed to the canvas at `:2151`. It is
**not persisted** — no `localStorage`, `sessionStorage` or search param.

The flag leaks into a `useCallback` identity chain that the hydration effect
depends on:

- `WorkflowEditorV2Page.tsx:741`, deps at `:790` — `runAutoArrange = useCallback(…, [simplifiedView])`
- `:824-836` — `handleArrangeOnLoad = useCallback(…, [runAutoArrange, resetConfig])`
- `:846-859` — `scheduleArrangeOnLoad = useCallback(…, [handleArrangeOnLoad])`
- `:1028-1098` — the server-hydration effect, whose dep array (`:1088-1095`) is
  `[existingWorkflow, isEditMode, workflowId, scheduleArrangeOnLoad, resetConfig, hasUnsavedChanges]`

`resetConfig` and `hasUnsavedChanges` are stable (`use-config-history.ts:95-99`;
`WorkflowEditorV2Page.tsx:968-973`). **`scheduleArrangeOnLoad` is the only
unstable dep, and it changes for exactly one reason: `simplifiedView` flipped.**

The effect's only guards are `:1029-1030`:

```js
if (!isEditMode || !existingWorkflow) return;
if (hasUnsavedChanges()) return;
```

`hasUnsavedChanges` is a reference compare against
`lastHydratedConfigRef.current`. So on a **clean** workflow — exactly the
walkthrough state — every flip of the switch re-runs the effect body:

```js
const hydrated = resolveBindings(
  normaliseLocks(layoutGraphIfMissingPositions(existingWorkflow.config)),
);                                            // :1031-1033
lastHydratedConfigRef.current = incoming;     // :1051
setName(existingWorkflow.name);               // :1052
resetConfig(incoming);                        // :1056
```

Three consequences:

1. **The in-memory config is thrown away and replaced by the raw server
   layout.** The tidy measured-width arrange-on-load layout is destroyed —
   `handleArrangeOnLoad` (`:824-836`) writes through `resetConfig` **and
   re-bases `lastHydratedConfigRef`** (`:836`, deliberately, so demos don't open
   dirty), which means the arranged config is *not* dirty and the `:1030` guard
   does not protect it.
2. **The loose layout comes back and is never repaired.** For a position-less
   server config (seeded templates, agent-authored), `layoutGraphIfMissingPositions`
   re-runs pre-mount with no measured widths — the uniform 482px
   `DEFAULT_NODE_WIDTH` fallback the P-1 comment at `:1060-1073` describes as
   "it loads more spread out than it should". The measured re-arrange does not
   re-run to fix it, because `arrangedForRef.current === workflowId` already
   (`:1084-1090`).
3. **An unsaved rename is reverted** by `setName(existingWorkflow.name)` at
   `:1052`. The title field writes only `name` state (`:1677`), which never
   touches `config`, so `hasUnsavedChanges()` is still false and the guard
   doesn't stop it.

**Why it reads as "on and off" rather than "on":** child effects run before
parent effects. On the ON flip the canvas re-projects with the still-good
config, *then* the page reverts it — and the canvas's structural fingerprint
deliberately excludes positions
(`canvas/WorkflowEditorCanvas.tsx:2149-2208`) with no `layoutNonce` bump, so
nothing moves yet. On the OFF flip the fingerprint changes again and the
re-projection at `canvas/WorkflowEditorCanvas.tsx:2483-2523` runs **from the
now-reverted config** — the whole graph jumps to the loose coordinates. ON looks
fine; OFF distorts. That matches the report precisely.

### Does toggling mutate the saved workflow?

Not directly — `lastHydratedConfigRef.current = incoming` is set immediately
before `resetConfig(incoming)` (`:1051`, `:1056`), so `isDirty` (`:976-978`)
stays false and no save mutation fires. **But it rewrites the live `config`
object**, and `resetConfig` records no undo step, so Ctrl+Z cannot bring the
good layout back. If the author then makes any edit and saves, the reverted
layout is what gets persisted. It is one user action away from permanent.

### What simplified mode legitimately changes (for context)

All in `canvas/WorkflowEditorCanvas.tsx` unless noted. `simplifiedView` is
folded into the structural fingerprint (`:2206`) so the flag forces a full
re-projection (`:2483-2485`), which is correct and intended.

| Axis | ON | OFF |
|---|---|---|
| Node set | grouped members removed; one `group-chip` per group (`:2487-2505`, `projectChipFlowNodes` `:1926-1945`) | member nodes + one `group-container` box per group (`:2506-2523`) |
| Positions read | `metadata.simplifiedPosition`, falling back to `metadata.position` (`atSimplifiedPosition` `:1948-1959`; `canvas/group-projection.ts:99-107`) | `metadata.position` |
| Edges | `projectSimplifiedFlowEdges` (`:1889-1910`) — no data wires, no port handles except `error`; intra-group edges dropped, cross-group endpoints rewritten to chip ids (`group-projection.ts:196-218`) | `projectFlowWires(derivedWires, config)` (`:2767`) |
| Node component / height | unchanged for ungrouped nodes — `PortRows.tsx` and `port-rows.ts` contain **zero** references to simplified/compact | unchanged |
| Auto-arrange target | `layoutGraphSimplified` (`canvas/auto-layout.ts:349-405`) → writes `metadata.simplifiedPosition` + `nodeGroups[x].position` | `layoutGraphWithMapBodies` → writes `metadata.position` |
| `fitView` / `nodesInitialized` | **neither runs on toggle**; `fitView` fires only on mount (`:4548`), node-add (`:2312`), and Auto-arrange/Fit | — |

No `key` on `<ReactFlow>` or `nodeTypes`; nothing remounts the provider. So
hidden ports and dropped edges are *by design* and restore correctly — the
distortion is entirely the config revert.

### Secondary finding — group boxes are sized from stale measurements on the OFF flip

Only applies to workflows that have groups (authored, or synthetic map bodies).

`canvas/WorkflowEditorCanvas.tsx:2465-2479` — `readMeasuredSizes()` reads the
**live xyflow store**. At the instant the OFF projection runs (`:2510-2516`) the
store still holds the *simplified* node set (chips + ungrouped nodes), so no
grouped member has a measured size and `computeGroupBounds` (`:1986-2029`) falls
back to the worst-case estimates (`ACTIVITY_NODE_WIDTH` 522 and a base height
including a 120px preview block). The D-1 comment at `:2000-2006` says that
slack is exactly what "made adjacent boxes overlap".

The intended self-repair is one `requestAnimationFrame` (`:2527-2531`).
**Guess (needs a browser to confirm):** per the HTML spec, rAF callbacks run
*before* ResizeObserver delivery, so the freshly re-mounted member cards aren't
measured yet; `sizes` is non-empty (ungrouped nodes carry over) so the
`if (sizes.size === 0) return;` early-out doesn't fire, and the boxes are refit
with member sizes still missing → oversized, overlapping group boxes until the
next drag or fingerprint change. There is no `useNodesInitialized` fallback
anywhere in the file.

### Proposed fix

**Fix 1 (primary, small).** Stop `simplifiedView` invalidating the hydration
effect. Hold the flag in a ref and read it at call time inside `runAutoArrange`
(`WorkflowEditorV2Page.tsx:741-790`), changing its deps from `[simplifiedView]`
to `[]`:

```tsx
const simplifiedViewRef = useRef(simplifiedView);
simplifiedViewRef.current = simplifiedView;          // assign during render
const runAutoArrange = useCallback((persist) => {
  …
  const layout = simplifiedViewRef.current ? layoutGraphSimplified : layoutGraphWithMapBodies;
  …
}, []);
```

`runAutoArrange` already reads the flag only at call time, so behaviour is
identical; only the identity stops churning. **This alone fixes D13.**

**Fix 2 (belt-and-braces, and the structurally right guard).** Hydration should
be driven by "the server copy changed", not by callback identity. Immediately
after `WorkflowEditorV2Page.tsx:1030`:

```tsx
if (hydratedFromRef.current === existingWorkflow) return;
hydratedFromRef.current = existingWorkflow;
```

TanStack Query's structural sharing keeps `existingWorkflow` referentially
stable across refetches that return equal data, so the §4.4 "adopt the agent's
write" behaviour is preserved.

**Fix 3 (secondary, group boxes).** Keep a `Map` of last-known measured sizes in
a ref that `readMeasuredSizes()` (`canvas/WorkflowEditorCanvas.tsx:2465-2479`)
merges into, so a node that leaves the store keeps its last measurement instead
of vanishing; and/or replace the single `requestAnimationFrame` at `:2527-2531`
with a refit driven by `useNodesInitialized()` from `@xyflow/react`.

### Risk

- **Fix 1: near-zero.** Only the callback's identity changes. Watch that
  `WorkflowEditorV2Page.test.tsx:921` ("lays out the CHIP graph when simplified
  view is on") still passes — it depends on the arrange picking the simplified
  branch *after* a toggle, which a ref read satisfies.
- **Fix 2: low.** The only way it suppresses a wanted hydration is if react-query
  hands back a new object reference with identical data (harmless — a redundant
  hydration skipped) or an equal reference with changed data (impossible with
  structural sharing).
- **Fix 3: low.** Risks a stale size for a card that shrank while hidden,
  bounded by "boxes slightly too big" — which is the current behaviour anyway.
- Ship Fix 1 and Fix 2 together; Fix 3 is independent and can wait for browser
  confirmation of the rAF guess.

### What test would prove it

The harness already exists in
`features/workflow-builder/WorkflowEditorV2Page.test.tsx` (`renderEditPage`
`:1126`, `existingWorkflowRef`, `measuredNodes`, `readPositionsFromCanvas`,
`liveConfig`), used by the arrange-on-load tests at `:2969-3016`.

1. **Primary regression (fails today).** Load an `arrangeOnLoad` demo via
   `renderEditPage`, `await waitFor(fitViewMock)`, snapshot
   `readPositionsFromCanvas()`, click `[data-testid="simplified-view-toggle"]`
   twice, assert positions unchanged. Today they revert to the pre-arrange
   server values.
2. **Name regression.** Type a new workflow name, toggle on/off, assert the
   field still shows the typed name.
3. **The cleanest statement of the invariant.** Assert the config prop handed to
   the canvas is reference-identical before and after a toggle pair — "toggling
   a view control must not rewrite the document".
4. **Secondary (group boxes).** With `nodeGroups` set and `measuredNodes`
   populated, toggle ON→OFF and assert the projected `group-container` node's
   `data.width` equals the measured bounding box + padding, not the estimate.

---

## Cross-cutting note

D7 and D13 are both the same architectural pressure showing up twice: **the
editor keeps one large mutable document in page state, and every subscriber
re-derives from it by object identity.** D7 is a *write* that is too frequent
(one per keystroke); D13 is a *read* dependency that is too broad (a view
toggle reaching a document-hydration effect through a `useCallback` chain).
Fix 1 for each is the narrow, low-risk version; neither requires restructuring
the page.
