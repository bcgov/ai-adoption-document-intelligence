import { expect, test, type Page } from "@playwright/test";
import { FRONTEND_URL, setupWorkflowBuilderTest } from "../helpers/wb-test";

/**
 * Tier 1 — D8: the custom-step code editor must not have its buffer replaced
 * underneath the author.
 *
 * ## The defect
 *
 * `CodePane` mirrors Monaco's text into React state, debounces it 150 ms, and
 * hands it to `DynamicNodeEditor`, which stores it and feeds the same string
 * straight back down as the `script` prop. `script` is therefore not an
 * independent input — it is this pane's own text arriving back late. The
 * "the prop changed, re-seed the editor" effect could not tell that echo apart
 * from a real external change, and `@monaco-editor/react` applies a changed
 * `value` as one full-model `executeEdits` with `forceMoveMarkers: true`.
 * Replacing the whole model that way throws the caret to the end of the
 * document and discards whatever was typed after the echoed snapshot was taken.
 * The same path re-inserted the entire boilerplate when the editor was cleared,
 * because the seed expression was `script || DYNAMIC_NODE_BOILERPLATE` and the
 * echo of an emptied editor is `""`.
 *
 * ## Why this has to be a browser test
 *
 * `CodePane.spec.tsx` stubs Monaco with a `<textarea>`, and React preserves the
 * caret on one of those. The unit tests can prove the *text* survives a
 * round-trip; nothing in jsdom can prove the *caret* does, because the jump is
 * Monaco's `executeEdits` behaviour and the stub has no `executeEdits`. That
 * half is what these tests own.
 *
 * ## Scope
 *
 * Both live tests run in create-mode (`/dynamic-nodes/new`). Nothing is
 * published and nothing is written to the database, so this stays in the
 * default hermetic tier — no `@infra`, no deno-runner, no seed fixture to
 * restore afterwards. The third test is a `fixme` reproduction of a *different*
 * cause of the same symptom, which the D8 fix does not close; see its comment.
 */

/** The literal `@description` line of `DYNAMIC_NODE_BOILERPLATE`. */
const DESCRIPTION_LINE = " * @description TODO";
/** The literal first line of `DYNAMIC_NODE_BOILERPLATE`. */
const FIRST_BOILERPLATE_LINE =
  'import type { Document } from "@ai-di/graph-workflow/kinds";';

/** `ONCHANGE_DEBOUNCE_MS` in `CodePane.tsx`. */
const ONCHANGE_DEBOUNCE_MS = 150;

interface EditorSnapshot {
  /** One entry per *model* line currently rendered, in visual order. */
  lines: string[];
  /** Index into `lines` of the line the caret sits on, or -1 if not found. */
  caretLine: number;
}

/**
 * Read the editor's rendered lines and the caret's line straight out of the
 * DOM.
 *
 * Deliberately not via `window.monaco`: the app configures
 * `@monaco-editor/react` with a *bundled* Monaco (`monaco-loader.ts`), and that
 * path never assigns the global — `loader.config({ monaco })` keeps the
 * instance in module state, so there is no editor handle for a test to reach.
 * The rendered layer is what is left, and it is what the author is looking at
 * anyway.
 *
 * `.view-line` elements are absolutely positioned and Monaco recycles them, so
 * DOM order is meaningless — they are sorted by box top. With `wordWrap: "on"`
 * a wrapped model line is still a single `.view-line` holding several visual
 * rows, so `textContent` is the whole logical line.
 */
async function readEditor(page: Page): Promise<EditorSnapshot> {
  return page.evaluate(() => {
    const root = document.querySelector(".monaco-editor");
    if (!root) throw new Error("no .monaco-editor in the DOM");

    const rows = Array.from(
      root.querySelectorAll<HTMLElement>(".view-lines .view-line"),
    )
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .sort((a, b) => a.box.top - b.box.top);

    // Monaco renders indentation and runs of spaces as non-breaking spaces.
    const lines = rows.map((r) =>
      (r.el.textContent ?? "").replace(/\u00a0/g, " "),
    );

    const cursor = root.querySelector<HTMLElement>(".cursors-layer .cursor");
    let caretLine = -1;
    if (cursor) {
      const box = cursor.getBoundingClientRect();
      const mid = box.top + box.height / 2;
      caretLine = rows.findIndex((r) => mid >= r.box.top && mid < r.box.bottom);
    }

    return { lines, caretLine };
  });
}

/**
 * Open the create-mode editor and wait until Monaco is genuinely live: the
 * boilerplate rendered AND the parse strip settled green, which only happens
 * once a full debounce cycle has round-tripped through the parent. Typing
 * before that would race the mount rather than the echo.
 */
async function openEditor(page: Page): Promise<void> {
  await setupWorkflowBuilderTest(page);
  await page.goto(`${FRONTEND_URL}/dynamic-nodes/new`);
  await expect(page.getByTestId("code-pane")).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toBeVisible();
  await expect(page.getByTestId("code-pane-strip-ok")).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await readEditor(page)).lines[0])
    .toBe(FIRST_BOILERPLATE_LINE);
}

/** Click into the editor so keystrokes reach Monaco rather than the page. */
async function focusEditor(page: Page): Promise<void> {
  await page.locator(".monaco-editor .view-lines").click();
  await expect(page.locator(".monaco-editor")).toHaveClass(/focused/);
}

/**
 * Park the caret at the end of ` * @description TODO`. A JSDoc description is
 * free text, so the header stays valid however much is appended and the
 * round-trip under test is the ordinary one, not an error-state variant.
 *
 * Clicks the line rather than counting `ArrowDown`s: the rendered line is the
 * thing later assertions compare against, so clicking it cannot drift out of
 * step with the boilerplate the way a hard-coded line offset can.
 */
async function parkCaretOnDescriptionLine(page: Page): Promise<void> {
  await page
    .locator(".monaco-editor .view-line", { hasText: "@description" })
    .click();
  await page.keyboard.press("End");

  const anchored = await readEditor(page);
  expect(
    anchored.lines[anchored.caretLine],
    "failed to park the caret on the @description line",
  ).toBe(DESCRIPTION_LINE);
}

test.describe("D8 — custom-step editor: the round-trip must not move the caret", () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
  });

  test.afterEach(() => {
    expect(pageErrors, "the editor logged an uncaught error").toEqual([]);
  });

  /**
   * The deterministic half of D8. Select-all + Delete emits `""` upward; the
   * parent stores it and echoes it back; the pane's seed expression was
   * `script || DYNAMIC_NODE_BOILERPLATE`, so an empty echo re-inserted the
   * whole boilerplate and left the caret at the end of it. No timing window is
   * involved — this fails on every run against the pre-fix build.
   */
  test("select-all + delete stays deleted — the boilerplate is not re-inserted", async ({
    page,
  }) => {
    await openEditor(page);
    await focusEditor(page);

    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");

    // Well past the 150 ms debounce, the parent's state update and the echo
    // back down. If the re-insert is going to happen, it has happened.
    await page.waitForTimeout(1_000);

    const after = await readEditor(page);
    expect(after.lines, "the editor should hold one empty line").toEqual([""]);
    expect(
      after.lines.join("\n"),
      "the boilerplate came back after being deleted",
    ).not.toContain("@workflow-node");
    expect(after.caretLine, "the caret should be on the one empty line").toBe(
      0,
    );
  });

  /**
   * The reported half of D8 — "the editor occasionally forces the cursor to the
   * end of the last line… makes it very frustrating to type."
   *
   * The window is real but narrow: it opens when the 150 ms debounce timer
   * fires and closes once React has committed the parent's state and re-run the
   * pane's `[script]` effect — measured at roughly 10–15 ms on this stack. A
   * keystroke landing inside it advances the live buffer past the snapshot
   * already on its way back down; the stale echo then overwrites the buffer,
   * dropping that character and throwing the caret to the end of the document.
   *
   * One pause cannot be relied on to hit a 15 ms window, so this types 26
   * pause-and-resume cycles with the pause swept across the debounce boundary
   * (148–174 ms), which lands inside it repeatedly. Every character is typed
   * after its own pause, at a human cadence, on purpose — see the `fixme`
   * below for why back-to-back keystrokes are a different defect that must not
   * be mixed in here.
   *
   * The assertion is exact, not statistical: all 26 characters must be on the
   * line they were typed on, in order, with the caret still there. Post-fix
   * that is an invariant rather than a probability — the echo guard makes the
   * overwrite impossible — so there is no flake in the passing direction.
   */
  test("pausing and resuming typing keeps every character and leaves the caret in place", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openEditor(page);
    await focusEditor(page);
    await parkCaretOnDescriptionLine(page);

    const typed = "abcdefghijklmnopqrstuvwxyz";
    for (let i = 0; i < typed.length; i++) {
      // Sweep the resume across the moment the echo is dispatched, so
      // successive cycles land on both sides of it.
      await page.waitForTimeout(ONCHANGE_DEBOUNCE_MS - 2 + (i % 14) * 2);
      await page.keyboard.type(typed[i]);
    }

    // Let the last cycle's echo arrive before reading.
    await page.waitForTimeout(1_000);

    const expected = `${DESCRIPTION_LINE}${typed}`;
    const after = await readEditor(page);

    expect(
      after.lines,
      "characters were dropped or landed elsewhere — a stale echo overwrote the buffer",
    ).toContain(expected);
    expect(
      after.lines[after.caretLine],
      "the caret left the line being typed on (pre-fix it was thrown to the end of the document)",
    ).toBe(expected);
  });

  /**
   * KNOWN FAILURE — a second, still-open cause of the identical symptom, found
   * while writing the two tests above. Marked `fixme` because it reproduces
   * reliably and must not be reported as a pass.
   *
   * The D8 echo guard closes the 150 ms round-trip through the parent, and
   * instrumentation confirms it: every echo in a typing run is now suppressed.
   * But `CodePane` also drives Monaco as a *controlled* component locally —
   * `<Editor value={internalText} onChange={(v) => setInternalText(v)} />` — so
   * `value` trails the model by one React commit whenever two keystrokes land
   * inside the same commit. `@monaco-editor/react` then sees
   * `value !== editor.getValue()` and applies the shorter, older string as a
   * full-model `executeEdits` with `forceMoveMarkers: true`, exactly as the
   * echo used to. Captured from `onDidChangeModelContent` /
   * `onDidChangeCursorPosition` with two keystrokes 9 ms apart:
   *
   *     content isFlush=false changes=[[402,401]]   ← whole model replaced, one char short
   *     cursor 16:1 reason=2 source=modelChange     ← caret thrown to the end
   *     content isFlush=false changes=[[401,402]]   ← next commit restores the text…
   *                                                    …but not the caret
   *
   * The text survives (the second rewrite puts the missing character back), so
   * only the caret is lost — which is exactly what was reported, and why it
   * looked intermittent: it needs two keystrokes closer together than one React
   * commit. Playwright's ~9 ms between keystrokes hits it every time; a human
   * hits it whenever a commit runs long, which a large script makes routine.
   *
   * FIXED 2026-08-15: `CodePane` now passes `defaultValue`, never `value`, so
   * the editor owns its buffer while the author types and re-seeds are pushed
   * imperatively. This test was `fixme` while that was still a proposal; it is
   * live now and is what proves the second cause closed.
   */
  test(
    "typing two characters inside one React commit must not rewrite the model or move the caret",
    async ({ page }) => {
      test.setTimeout(90_000);

      await openEditor(page);
      await focusEditor(page);
      await parkCaretOnDescriptionLine(page);

      // Pairs of back-to-back keystrokes: each pair is dispatched faster than
      // React can commit the first one.
      const typed = "abcdefghijklmnopqrstuvwxyz";
      for (let i = 0; i < typed.length; i += 2) {
        await page.keyboard.type(typed[i]);
        await page.keyboard.type(typed[i + 1]);
        await page.waitForTimeout(ONCHANGE_DEBOUNCE_MS + 10);
      }

      await page.waitForTimeout(1_000);

      const expected = `${DESCRIPTION_LINE}${typed}`;
      const after = await readEditor(page);

      expect(after.lines).toContain(expected);
      expect(after.lines[after.caretLine]).toBe(expected);
    },
  );
});
