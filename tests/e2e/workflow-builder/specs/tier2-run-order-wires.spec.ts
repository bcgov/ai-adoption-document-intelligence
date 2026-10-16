import { expect, type Page, test } from "@playwright/test";
import { dragConnect } from "../helpers/canvas";
import {
  SEED_WORKFLOW_IDS,
  setupWorkflowBuilderTest,
} from "../helpers/wb-test";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — run-order wires: the two the canvas refuses, and removing one.
 *
 * A run-order wire is the dashed grey line drawn between two steps' grey
 * node-level dots. It makes one step wait for the other without passing
 * data. Over the seeded Standard OCR workflow:
 *
 *   - Prepare File Data → Submit to Azure OCR is refused: the data wire
 *     between them already sets that order, so the wire would change nothing.
 *   - Prepare File Data → Update APIM Request ID is drawn.
 *   - Update APIM Request ID → Prepare File Data is then refused: it would
 *     close a loop.
 *   - The drawn wire's right-click menu removes it.
 *
 * Each refusal says why in a notice. Real drags and a real right-click, so
 * this lives in the canvas tier. Nothing is saved.
 */

const PREPARE = "prepareFileData";
const SUBMIT = "submitOcr";
const UPDATE = "updateApimRequestId";

// The canvas shares the screen with the step list and the settings panel; at
// the default 1280×720 it is too narrow to show three cards at a size where
// the dots can be aimed at.
test.use({ viewport: { width: 1920, height: 1080 } });

/**
 * Zoom in on the first three steps, as a person would before aiming at the
 * small grey dots. Fit-to-screen shows all eleven steps of this workflow, and
 * at that size one card's dots sit within a drop's reach of the next card's.
 */
async function zoomToFirstSteps(page: Page): Promise<void> {
  const prepare = page.locator(`.react-flow__node[data-id="${PREPARE}"]`);
  const update = page.locator(`.react-flow__node[data-id="${UPDATE}"]`);
  for (let i = 0; i < 12; i++) {
    const first = await prepare.boundingBox();
    if (!first) throw new Error("Prepare File Data is not on screen");
    if (first.width >= 160) break;
    // Zooming keeps the point under the pointer still. Anchored just left of
    // the first card, the cards grow to the right, away from the step list.
    await page.mouse.move(first.x - 10, first.y + first.height / 2);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(150);
  }
  const canvas = await page.locator(".react-flow").boundingBox();
  const first = await prepare.boundingBox();
  const third = await update.boundingBox();
  if (!canvas || !first || !third) throw new Error("the canvas has no box");
  if (
    first.width < 160 ||
    first.x < canvas.x + 20 ||
    third.x + third.width > canvas.x + canvas.width - 20
  ) {
    throw new Error("could not bring the first three steps into view");
  }
}

async function edgeIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="rf__edge-"]')
    .evaluateAll((els) =>
      els.map((el) =>
        (el.getAttribute("data-testid") ?? "").slice("rf__edge-".length),
      ),
    );
}

/**
 * Close the connect-summary popover a drawn wire opens, which sits over the
 * canvas for a few seconds and would take the next gesture.
 */
async function dismissPopovers(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
}

/**
 * A point on the wire where the wire itself is the topmost element, so a
 * right-click there reaches it rather than a card or another wire drawn over
 * it.
 */
async function pointOnWire(
  page: Page,
  edgeId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((id) => {
    const group = document.querySelector(`[data-testid="rf__edge-${id}"]`);
    const path = group?.querySelector<SVGPathElement>(
      "path.react-flow__edge-path",
    );
    const ctm = path?.getScreenCTM();
    if (!path || !ctm) return null;
    const length = path.getTotalLength();
    for (let i = 1; i < 50; i++) {
      const p = path.getPointAtLength((length * i) / 50);
      const x = p.x * ctm.a + p.y * ctm.c + ctm.e;
      const y = p.x * ctm.b + p.y * ctm.d + ctm.f;
      if (
        document
          .elementFromPoint(x, y)
          ?.closest(`[data-testid="rf__edge-${id}"]`)
      ) {
        return { x, y };
      }
    }
    return null;
  }, edgeId);
  if (!point) throw new Error(`no visible point on wire ${edgeId}`);
  return point;
}

test.describe("run-order wires on the canvas", () => {
  test("refuses a wire that changes nothing or closes a loop, and removes one from its menu", async ({
    page,
  }) => {
    await setupWorkflowBuilderTest(page);
    await new WorkflowEditorPage(page).openExisting(
      SEED_WORKFLOW_IDS.standardOcr,
      3,
    );
    await zoomToFirstSteps(page);
    const seeded = await edgeIds(page);

    await dragConnect(page, PREPARE, SUBMIT);
    await expect(
      page.getByText(
        '"Submit to Azure OCR" already runs after "Prepare File Data": the data wire between them sets the order.',
      ),
    ).toBeVisible();
    expect(await edgeIds(page)).toEqual(seeded);

    await dragConnect(page, PREPARE, UPDATE);
    await expect
      .poll(async () => (await edgeIds(page)).length)
      .toBe(seeded.length + 1);
    const drawn = (await edgeIds(page)).find((id) => !seeded.includes(id));
    if (!drawn) throw new Error("the run-order wire was not drawn");
    await dismissPopovers(page);

    await dragConnect(page, UPDATE, PREPARE);
    await expect(
      page.getByText(
        'That would make a loop: "Update APIM Request ID" already runs after "Prepare File Data".',
      ),
    ).toBeVisible();
    expect(await edgeIds(page)).toHaveLength(seeded.length + 1);

    await dismissPopovers(page);
    const { x, y } = await pointOnWire(page, drawn);
    await page.mouse.click(x, y, { button: "right" });
    await page.getByTestId("wire-menu-remove-run-order").click();
    await expect.poll(() => edgeIds(page)).toEqual(seeded);
  });
});
