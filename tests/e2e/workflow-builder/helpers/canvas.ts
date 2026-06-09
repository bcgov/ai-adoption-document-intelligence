import { expect, Locator, Page } from "@playwright/test";

/**
 * Helpers for asserting/driving the React Flow canvas. We key off xyflow's
 * own stable DOM (`.react-flow__node[data-id]`, `.react-flow__edge`,
 * `.react-flow__handle`) rather than the app's templated `canvas-node-${id}`
 * testid, because that survives node-type swaps and never collides with the
 * `canvas-node-${id}-dyn-pill` / `-deleted-pill` prefixes.
 */

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Screen x below which the app's fixed left-nav sidebar overlays the canvas.
 * Nodes painted left of this are unclickable (clicks hit the nav), so tests pan
 * them into the clear area first.
 */
export const SIDEBAR_CLEAR_X = 340;

/**
 * Pans the React Flow viewport by (dx, dy) screen px via a pane drag. Starts the
 * drag from a point near the top-left of the canvas (right of the sidebar, above
 * the typical node band) so it grabs empty pane, not a node.
 */
export async function panBy(page: Page, dx: number, dy: number): Promise<void> {
  const startX = SIDEBAR_CLEAR_X + 20;
  const startY = 130;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

/**
 * Ensures the node's center is in the clickable canvas area (right of the
 * sidebar), panning the viewport if it isn't. Returns the resulting center.
 */
export async function bringNodeIntoClear(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number }> {
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  await node.waitFor({ state: "visible" });
  let bb = await node.boundingBox();
  if (!bb) throw new Error(`node ${nodeId} has no bounding box`);
  let cx = bb.x + bb.width / 2;
  if (cx < SIDEBAR_CLEAR_X) {
    await panBy(page, 760 - cx, 0);
    bb = await node.boundingBox();
    if (!bb) throw new Error(`node ${nodeId} lost its box after pan`);
    cx = bb.x + bb.width / 2;
  }
  return { x: cx, y: bb.y + bb.height / 2 };
}

export function rfNode(page: Page, id: string): Locator {
  return page.locator(`.react-flow__node[data-id="${id}"]`);
}

/** Wait until at least `min` nodes have mounted on the canvas. */
export async function waitForCanvasReady(page: Page, min = 1): Promise<void> {
  await page.locator(".react-flow__node").first().waitFor({ state: "visible" });
  await expect
    .poll(() => page.locator(".react-flow__node").count(), {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(min);
}

/** Screen-space bounding boxes of every rendered node, keyed by node id. */
export async function readNodeBoxes(page: Page): Promise<Box[]> {
  const nodes = page.locator(".react-flow__node");
  const count = await nodes.count();
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const n = nodes.nth(i);
    const id = (await n.getAttribute("data-id")) ?? `idx-${i}`;
    const bb = await n.boundingBox();
    if (bb) boxes.push({ id, x: bb.x, y: bb.y, w: bb.width, h: bb.height });
  }
  return boxes;
}

/** Count rendered edges. */
export async function edgeCount(page: Page): Promise<number> {
  return page.locator(".react-flow__edge").count();
}

/** Do two boxes overlap by more than `tol` px on both axes? */
function overlaps(a: Box, b: Box, tol = 4): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y);
  return xOverlap > tol && yOverlap > tol;
}

/**
 * Asserts the nodes are laid out, not stacked. The pre-fix bug rendered
 * position-less nodes piled at the same coordinate; a real layout spreads them
 * across distinct positions with no two nodes fully overlapping.
 */
export function expectLaidOut(boxes: Box[]): void {
  expect(boxes.length, "expected nodes on canvas").toBeGreaterThan(1);

  const distinctX = new Set(boxes.map((b) => Math.round(b.x))).size;
  const distinctY = new Set(boxes.map((b) => Math.round(b.y))).size;
  expect(
    distinctX > 1 || distinctY > 1,
    "all nodes share one coordinate — layout did not run (stacked)",
  ).toBeTruthy();

  let overlapping = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i], boxes[j])) overlapping++;
    }
  }
  // A laid-out graph may have incidental adjacency, but the bug produced a
  // fully-stacked pile. Require the large majority of pairs to be disjoint.
  const totalPairs = (boxes.length * (boxes.length - 1)) / 2;
  expect(
    overlapping,
    `${overlapping}/${totalPairs} node pairs overlap — looks stacked`,
  ).toBeLessThan(totalPairs / 2);
}

/**
 * Drives a real drag from a source node's output handle to a target node's
 * input handle. This is the genuine React Flow connection gesture — flaky by
 * nature, so reserve it for a couple of smoke tests and use the API path for
 * breadth.
 */
export async function dragConnect(
  page: Page,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const sourceHandle = page.locator(
    `.react-flow__node[data-id="${sourceId}"] .react-flow__handle.source`,
  );
  const targetHandle = page.locator(
    `.react-flow__node[data-id="${targetId}"] .react-flow__handle.target`,
  );
  const from = await sourceHandle.boundingBox();
  const to = await targetHandle.boundingBox();
  if (!from || !to) throw new Error("handle not found for drag-connect");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Two-step move so xyflow registers the connection-in-progress.
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}
