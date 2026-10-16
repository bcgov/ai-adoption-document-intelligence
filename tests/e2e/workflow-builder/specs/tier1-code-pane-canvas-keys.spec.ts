import { expect, type Page, test } from "@playwright/test";
import {
  SEED_WORKFLOW_IDS,
  setupWorkflowBuilderTest,
} from "../helpers/wb-test";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — the canvas must not swallow keys typed into the custom-step code
 * editor when the editor is open over it.
 *
 * ## The defect
 *
 * React Flow pans the canvas while Space is held. It listens for Space on the
 * whole document and claims it (`preventDefault`) unless the key comes from a
 * text field: an `input`, `select` or `textarea`, a `contenteditable` element,
 * or anything inside an element carrying its `nokey` class. In Chrome and
 * Edge, Monaco takes typing through the EditContext API on a plain `div`,
 * which is none of those, so in the builder's custom-step windows every space
 * vanished: `const zq = 1;` arrived as `constzq=1;`. Monaco handles Backspace,
 * Delete and its shortcuts itself and stops them before they bubble, so the
 * space bar was the only key lost. Firefox and Safari have no EditContext;
 * Monaco types into a `textarea` there, which the canvas leaves alone. The
 * standalone `/dynamic-nodes/new` page has no canvas and was never affected.
 *
 * ## Why this has to be a browser test
 *
 * jsdom has no EditContext, and `CodePane.spec.tsx` stubs Monaco with a
 * `textarea`. Only a Chromium build takes the input path that broke, so the
 * test confirms it is on that path before it types.
 *
 * ## Scope
 *
 * The "New custom node" window from the step list, over the seeded Standard
 * OCR workflow. Nothing is published or saved, so this stays in the default
 * hermetic tier: no `@infra`, no deno-runner, nothing to restore afterwards.
 */

/** A line with spaces and no identifier any completion would match. */
const TYPED = "const zq = 1;";

/**
 * The editor's rendered rows as text, trimmed. Monaco renders spaces as
 * non-breaking spaces and positions its `.view-line` rows absolutely, so DOM
 * order is not line order; the test looks its line up by content instead.
 */
async function editorLines(page: Page): Promise<string[]> {
  return page
    .getByTestId("code-pane-editor")
    .locator(".view-lines .view-line")
    .evaluateAll((rows) =>
      rows.map((row) => (row.textContent ?? "").replace(/ /g, " ").trim()),
    );
}

test.describe("custom-step editor open over the canvas", () => {
  test("a space typed in the New custom node window lands in the code", async ({
    page,
  }) => {
    await setupWorkflowBuilderTest(page);
    await new WorkflowEditorPage(page).openExisting(
      SEED_WORKFLOW_IDS.standardOcr,
      3,
    );
    expect(
      await page.evaluate(() => "EditContext" in globalThis),
      "this test covers Monaco's EditContext input path, which only Chromium-based browsers take",
    ).toBe(true);

    await page.getByTestId("palette-custom-new-btn").click();
    const editor = page
      .getByTestId("code-pane-editor")
      .locator(".monaco-editor");
    await editor.locator(".view-lines").click();
    await expect(editor).toHaveClass(/focused/);
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(TYPED);

    await expect
      .poll(async () =>
        (await editorLines(page)).find((line) => line.includes("zq")),
      )
      .toBe(TYPED);
  });
});
