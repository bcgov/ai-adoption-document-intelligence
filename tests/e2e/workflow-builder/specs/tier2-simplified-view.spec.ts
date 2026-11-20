import { expect, type Page, test } from "@playwright/test";
import {
  SEED_WORKFLOW_IDS,
  setupWorkflowBuilderTest,
} from "../helpers/wb-test";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 2 — the Simplified view switch, there and back, on the seeded Standard
 * OCR workflow, whose four groups cover every step.
 *
 *   - Switched on, each group is one block. The blocks sit side by side and
 *     the view is fitted to them: every block on screen and wide enough to
 *     read, not strung out across the expanded canvas's span.
 *   - Switched back, every card is on screen again, and each group box is the
 *     size it was before the round trip — wrapped round its own cards, clear
 *     of its neighbours. The boxes are re-sized when the re-mounted cards are
 *     measured, which happens after the projection's own one re-fit.
 *
 * The switch is a view: nothing is saved.
 */

// The canvas shares the screen with the step list and the settings panel; at
// the default 1280×720 it is too narrow to fit four blocks at a readable size.
test.use({ viewport: { width: 1920, height: 1080 } });

/** A rectangle in screen pixels. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

async function canvasRect(page: Page): Promise<Rect> {
  const box = await page.locator(".react-flow").boundingBox();
  if (!box) throw new Error("the canvas has no box");
  return {
    left: box.x,
    top: box.y,
    right: box.x + box.width,
    bottom: box.y + box.height,
    width: box.width,
  };
}

async function nodeRects(page: Page, selector: string): Promise<Rect[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
      };
    }),
  );
}

/** Every rect lies inside the canvas. */
function allInside(rects: Rect[], canvas: Rect): boolean {
  return (
    rects.length > 0 &&
    rects.every(
      (r) =>
        r.left >= canvas.left - 1 &&
        r.right <= canvas.right + 1 &&
        r.top >= canvas.top - 1 &&
        r.bottom <= canvas.bottom + 1,
    )
  );
}

/**
 * Each group box's size in canvas units (screen size divided by the zoom), so
 * readings taken at different zoom levels compare directly.
 */
async function groupBoxSizes(
  page: Page,
): Promise<Record<string, { w: number; h: number }>> {
  return page.evaluate(() => {
    const style =
      document.querySelector(".react-flow__viewport")?.getAttribute("style") ??
      "";
    const zoom = Number(/scale\(([-\d.]+)\)/.exec(style)?.[1] ?? "1");
    const out: Record<string, { w: number; h: number }> = {};
    for (const el of document.querySelectorAll(
      '.react-flow__node[data-id^="container-"]',
    )) {
      const r = el.getBoundingClientRect();
      out[el.getAttribute("data-id") ?? ""] = {
        w: Math.round(r.width / zoom),
        h: Math.round(r.height / zoom),
      };
    }
    return out;
  });
}

/** Pairs of group boxes that overlap by more than a few pixels. */
async function overlappingBoxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const boxes = [
      ...document.querySelectorAll('.react-flow__node[data-id^="container-"]'),
    ].map((el) => ({
      id: el.getAttribute("data-id") ?? "",
      r: el.getBoundingClientRect(),
    }));
    const pairs: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 4 && y > 4) pairs.push(`${boxes[i].id} / ${boxes[j].id}`);
      }
    }
    return pairs;
  });
}

/** Box sizes match within a pixel of rounding. */
function sameSizes(
  a: Record<string, { w: number; h: number }>,
  b: Record<string, { w: number; h: number }>,
): boolean {
  const ids = Object.keys(a);
  return (
    ids.length === Object.keys(b).length &&
    ids.every(
      (id) =>
        b[id] !== undefined &&
        Math.abs(a[id].w - b[id].w) <= 1 &&
        Math.abs(a[id].h - b[id].h) <= 1,
    )
  );
}

test.describe("the Simplified view switch", () => {
  test("switching on and back off keeps the canvas readable and the group boxes intact", async ({
    page,
  }) => {
    await setupWorkflowBuilderTest(page);
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(SEED_WORKFLOW_IDS.standardOcr, 3);

    // The boxes settle once every card has been measured.
    let before = await groupBoxSizes(page);
    await expect
      .poll(async () => {
        const now = await groupBoxSizes(page);
        const settled = sameSizes(now, before);
        before = now;
        return settled && Object.keys(now).length;
      })
      .toBe(4);
    expect(await overlappingBoxes(page)).toEqual([]);

    await editor.setSimplifiedView(true);
    const canvas = await canvasRect(page);
    await expect
      .poll(async () => {
        const blocks = await nodeRects(
          page,
          '.react-flow__node[data-id^="group-chip-"]',
        );
        return (
          blocks.length === 4 &&
          allInside(blocks, canvas) &&
          blocks.every((b) => b.width >= 100)
        );
      }, "every block on screen and readable")
      .toBe(true);

    await editor.setSimplifiedView(false);
    await expect
      .poll(async () => sameSizes(await groupBoxSizes(page), before), {
        message: "each group box back to its size before the round trip",
      })
      .toBe(true);
    expect(await overlappingBoxes(page)).toEqual([]);
    await expect
      .poll(
        async () =>
          allInside(
            await nodeRects(
              page,
              '.react-flow__node:not([data-id^="container-"])',
            ),
            canvas,
          ),
        { message: "every card on screen" },
      )
      .toBe(true);
  });
});
