# D8, second cause — Monaco buffer ownership

**Item:** D8 in `feature-docs/20260814-workflow-designer-fixes/CHECKLIST.md` —
*"The editor occasionally forces the cursor to the end of the last line. Maybe
this is happening when it reloads? Makes it very frustrating to type."*

The first cause (a stale debounced echo arriving back from the parent) was
already closed by the `lastEmittedRef` guard. This worklog covers the **second
cause**: `CodePane` drove Monaco as a *controlled* React component, so `value`
could trail the editor's own model by one React commit.

Captured evidence from `onDidChangeModelContent` / `onDidChangeCursorPosition`
with two keystrokes ~9 ms apart:

```
content isFlush=false changes=[[402,401]]   ← whole model replaced, one char short
cursor 16:1 reason=2 source=modelChange     ← caret thrown to the end
content isFlush=false changes=[[401,402]]   ← next commit restores the text, not the caret
```

---

## 1. What the documentation says

### 1a. `@monaco-editor/react` — the installed version, and what it does with `value`

Installed: **`@monaco-editor/react` 4.7.0**, **`monaco-editor` 0.55.1**
(`apps/frontend/package.json:35,46`).

The README's `Editor` props table
([README, "Props → Editor"](https://github.com/suren-atoyan/monaco-react#editor),
local copy `node_modules/@monaco-editor/react/README.md`) draws the line
between the two modes in a single pair of rows:

| Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `defaultValue` | string | | Default value of the current model |
| `value` | string | | Value of the current model |

The README's own "Simple usage" and "Get value" examples — the ones the library
leads with — both use **`defaultValue`**, never `value`:

> ```javascript
> return <Editor height="90vh" defaultLanguage="javascript" defaultValue="// some comment" />;
> ```

and, under **"Get value"**:

> There are two options to get the current value:
> 1. get the current model value from the `editor` instance
>    ```javascript
>    function handleEditorDidMount(editor, monaco) { editorRef.current = editor; }
>    function showValue() { alert(editorRef.current.getValue()); }
>    ```
> 2. get the current model value via `onChange` prop

That is the prescribed shape: **the editor owns the buffer; you get the text
out via `onMount` + `getValue()` or via `onChange`.** The docs never show a
`value={state}` / `onChange={setState}` round-trip.

The reason matters more than the example, and it is in the shipped source. The
`value` effect in `node_modules/@monaco-editor/react/dist/index.js`
([`src/Editor/Editor.tsx`](https://github.com/suren-atoyan/monaco-react/blob/master/src/Editor/Editor.tsx)),
de-minified:

```js
useUpdate(() => {
  if (!editorRef.current || value === undefined) return;          // ← the escape hatch
  if (editorRef.current.getOption(monaco.editor.EditorOption.readOnly)) {
    editorRef.current.setValue(value);
  } else if (value !== editorRef.current.getValue()) {
    preventTriggerChangeEvent.current = true;
    editorRef.current.executeEdits('', [{
      range: editorRef.current.getModel().getFullModelRange(),
      text: value,
      forceMoveMarkers: true,                                     // ← the caret jump
    }]);
    editorRef.current.pushUndoStop();
    preventTriggerChangeEvent.current = false;
  }
}, [value], isEditorReady);
```

Three things are load-bearing here:

1. **`value === undefined` short-circuits the whole effect.** Not passing
   `value` at all is the library's supported *uncontrolled* mode — it is an
   explicit guard, not an accident.
2. **Any `value` that differs from `getValue()` replaces the entire model** via
   a full-range `executeEdits(..., forceMoveMarkers: true)`. There is no
   `endCursorState` argument, so the caret lands wherever the replacement
   leaves it — the end of the document. This is exactly the captured
   `changes=[[402,401]]` / `reason=2 source=modelChange` pair.
3. **`preventTriggerChangeEvent` suppresses `onChange` for that programmatic
   edit**, so nothing downstream ever learns the buffer was rewritten and
   nothing self-corrects.

Mount is a separate path and reads **both** props —
`createModel(value || defaultValue, ...)` — and the effect above is
`useUpdate`, which skips the first render. So `defaultValue` alone seeds the
model correctly at create time and then the library never touches the buffer
again.

Also confirmed in the same source: `onChange` is wired to
`onDidChangeModelContent` and reports `editorRef.current.getValue()` — the
**live model**, never a React snapshot. So going uncontrolled loses nothing on
the read side.

### 1b. Monaco itself — how to apply an external change without destroying the caret

From `node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts` (the shipped
API doc comments, same text as the
[Monaco typedoc](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.ITextModel.html)):

- `ITextModel.pushEditOperations(beforeCursorState, editOperations, cursorStateComputer)` —
  > *"Push edit operations, basically editing the model. **This is the preferred
  > way of editing the model.** The edit operations will land on the undo stack.
  > `@param beforeCursorState` The cursor state before the edit operations. This
  > cursor state will be returned when `undo` or `redo` are invoked.
  > `@param cursorStateComputer` A callback that can compute the resulting
  > cursors state after the edit operations have been executed."*
- `ITextModel.applyEdits(operations)` —
  > *"Edit the model **without adding the edits to the undo stack. This can have
  > dire consequences on the undo stack!** See @pushEditOperations for the
  > preferred way."*
- `ITextModel.setValue(newValue)` —
  > *"**Replace the entire text buffer value** contained in this model."*
- `IStandaloneCodeEditor.executeEdits(source, edits, endCursorState?)` —
  > *"Execute edits on the editor. The edits will land on the undo-redo stack,
  > but no 'undo stop' will be pushed. `@param endCursorState` **Cursor state
  > after the edits were applied.**"*

The prescription reads cleanly: an edit that should preserve the author's place
goes through `pushEditOperations` (or `executeEdits` **with** an explicit
`endCursorState`); a wholesale document replacement is `setValue`, and it is
honest about resetting the caret because the document is no longer the same
document. What you must never do is use the wholesale replacement for what is
really an incremental edit — which is precisely what the controlled `value`
prop was doing on every commit lag.

### 1c. What that prescribes for this component

There is no per-keystroke external change here at all. The author's keystrokes
already live in Monaco's model; React was mirroring them and handing the mirror
back. The documented fix is therefore **not** a better edit call — it is to
stop making the edit:

- pass **`defaultValue`**, not `value`, so the library's `value` effect
  short-circuits on `value === undefined` and Monaco owns the buffer while the
  author types;
- read the text through **`onChange`** (which reports the live `getValue()`);
- apply the genuine external re-seeds — edit-mode hydrate, revert to a version
  — **imperatively through the editor ref**, deliberately, at the few moments
  they actually happen.

For those imperative re-seeds this component wants `setValue`, not
`pushEditOperations`: a hydrate or a revert *is* "this is a different document
now". Preserving a caret from the old document into the new one would be
meaningless, and both re-seed sites already move focus/selection themselves or
are followed by the author clicking in.

---

## 2. The pattern chosen

**Uncontrolled Monaco with explicit, ref-driven re-seeds** — item 1c above.

Rejected alternatives, and why:

- **Keep `value`, add a tighter equality guard.** The race is not comparison
  logic, it is that `value` is a React-commit-old snapshot of a buffer Monaco
  is mutating synchronously. No guard computed from React state can be current;
  a guard only narrows the window. The captured trace already shows the echo
  guard doing its job and the symptom surviving.
- **Keep `value`, pass `endCursorState` to preserve the caret.** Not reachable
  — the `executeEdits` call is inside the library, with no prop to influence it.
- **Debounce or `flushSync` the mirror.** `flushSync` inside a keystroke handler
  forces a synchronous re-render per character in a Monaco-sized tree; it trades
  a caret bug for a typing-latency bug, and still leaves a window if two events
  are dispatched in one task.

---

## 3. The change

*(filled in below as it lands)*

---

## 4. Before / after

*(filled in below)*

---

## 5. Test output

*(filled in below)*

---

## Completion (2026-08-15, finished in the main session)

The agent that made the change was cut short twice by a stream watchdog, both
times after the implementation had landed. Finished here:

1. **`DynamicNodeEditor.spec.tsx`'s Monaco stub had to change, not weaken.** It
   was a *controlled* `<textarea value={…}>`, which cannot express the new
   contract at all — `CodePane` no longer passes `value`. Six tests failed for
   that reason alone. The stub now mirrors the one in `CodePane.spec.tsx`:
   uncontrolled `defaultValue`, an `onMount` handle whose `setValue` writes the
   DOM node directly (React never learns of it, exactly as with real Monaco),
   and `onChange` for typing. No assertion was relaxed.
   → `npx vitest run src/features/workflow-builder/dynamic-nodes`
   **6 files / 67 tests passed.**

2. **`tsc --noEmit` clean** across the frontend.

3. **The third caret test is un-skipped and passing.** Its `test.fixme` carried
   a comment saying the fix was still a design call; that comment now records
   the decision and the date instead.
   → `PLAYWRIGHT_SKIP_DB_RESET=1 npx playwright test tests/e2e/workflow-builder/specs/tier1-code-pane-caret.spec.ts`
   **3 passed (18.9s)** — including *"typing two characters inside one React
   commit must not rewrite the model or move the caret"*, which is the case that
   failed before this change.

D8 is therefore closed on both causes, with browser evidence for each.
