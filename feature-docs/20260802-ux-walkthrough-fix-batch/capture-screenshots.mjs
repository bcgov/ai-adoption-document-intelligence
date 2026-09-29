/**
 * Re-shoots the screenshots ILLUSTRATED_REVIEW.md embeds.
 *
 * Every shot in that document used to be taken by hand, which is why some of
 * them went stale without anyone noticing: a batch would change what a panel
 * looks like and the review kept showing the old one. This makes the set
 * reproducible — run it after a batch and diff the images.
 *
 *   npm run dev                                  # frontend :3000, backend :3002
 *   node feature-docs/20260802-ux-walkthrough-fix-batch/capture-screenshots.mjs
 *
 * Optional: pass shot ids to re-take only those.
 *
 *   node …/capture-screenshots.mjs 19 21 22
 *
 * VIEWPORT — 1920x1080, deliberately. At 1600 and below the editor's top bar
 * overflows and the disabled Undo button sits on top of the Simplified switch
 * (measured 2026-08-03: 19x16px of overlap, and `elementFromPoint` at the
 * switch's centre returns the Undo button), so a script — or a person — cannot
 * click it. That is a real defect, tracked separately; capturing at 1920 works
 * around it rather than hiding it.
 *
 * The API key is the seeded dev default. It is read from the environment, or
 * from playwright.config.ts's fallback, and never printed.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = join(HERE, "screenshots");

const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");

const FRONTEND = "http://localhost:3000";
const VIEWPORT = { width: 1920, height: 1080 };

function apiKey() {
  if (process.env.TEST_API_KEY) return process.env.TEST_API_KEY;
  const config = readFileSync(join(REPO, "playwright.config.ts"), "utf8");
  const match = /process\.env\.TEST_API_KEY = '([^']+)'/.exec(config);
  if (!match) {
    throw new Error(
      "No TEST_API_KEY in the environment and no fallback in playwright.config.ts",
    );
  }
  return match[1];
}

const API_KEY = apiKey();

const MOCK_USER = {
  sub: "test-user",
  name: "Test User",
  preferred_username: "testuser",
  email: "test@example.com",
  roles: ["user"],
  isAdmin: false,
  expires_in: 3600,
  groups: [{ id: "seeddefaultgroup", name: "Default" }],
};

/** Auth interception, per `.claude/skills/app-browser-auth`. */
async function newPage(browser) {
  const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
  await page.route("**/api/**", async (route, request) => {
    const headers = { ...request.headers(), "x-api-key": API_KEY };
    delete headers.authorization;
    await route.continue({ headers });
  });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_USER),
    }),
  );
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expires_in: 3600 }),
    }),
  );
  return page;
}

async function openEditor(page, slug) {
  await page.goto(`${FRONTEND}/workflows/by-slug/${slug}/edit`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForSelector(".react-flow__node", { timeout: 25000 });
  // Give the arrange-on-load pass and the card measurements a beat to settle;
  // the group boxes re-fit once xyflow has measured, and a shot taken before
  // that shows the fallback estimates.
  await page.waitForTimeout(2500);
}

/** Clicks the Simplified switch by its track — the input itself is visually hidden. */
async function toggleSimplified(page) {
  await page.locator(".mantine-Switch-track").first().click();
  await page.waitForTimeout(1500);
}

/**
 * Zooms the canvas in on `selector` until it is at least `minWidth` wide on
 * screen, keeping it in frame.
 *
 * Fit-view sizes the whole graph into the viewport, which for a ten-node
 * workflow renders every card as an unreadable smudge — the first pass at
 * these shots came out that way. Zooming is done with the wheel positioned
 * OVER the subject, because xyflow zooms toward the cursor: the subject stays
 * put while everything else grows away from it. Panning with a drag was the
 * first attempt and it is worse — a drag that starts on a card moves the card,
 * and a drag that starts on the pane also selects whatever it lands on.
 */
async function zoomOnto(page, selector, minWidth = 620, maxSteps = 14) {
  for (let i = 0; i < maxSteps; i++) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return;
    if (box.width >= minWidth) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(220);
  }
}

/**
 * Crops a window around `selector` rather than to it — for shots whose subject
 * is the RELATIONSHIP between an element and its neighbours (two group boxes
 * not touching, say), where cropping to the element alone would cut the
 * neighbours out. Derived from the element's live box so the framing survives
 * a different zoom level.
 */
async function shootAround(page, selector, file, { left, right, up, down }) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to shoot around ${selector}`);
  const x = Math.max(0, box.x - left);
  const y = Math.max(0, box.y - up);
  await page.screenshot({
    path: join(OUT, file),
    clip: {
      x,
      y,
      width: Math.min(VIEWPORT.width - x, box.width + left + right),
      height: Math.min(VIEWPORT.height - y, box.height + up + down),
    },
  });
}

/**
 * Clips to the canvas viewport itself — palette and right rail excluded.
 * For shots whose subject is the arrangement of the whole graph rather than
 * one card, where any hand-tuned pixel window ends up framing the rail.
 */
async function shootCanvas(page, file) {
  const box = await page.locator(".react-flow").first().boundingBox();
  if (!box) throw new Error("no canvas to shoot");
  await page.screenshot({ path: join(OUT, file), clip: box });
}

/** Crops to an element with a little air around it. */
async function shootElement(page, selector, file, pad = 12) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to shoot at ${selector}`);
  await page.screenshot({
    path: join(OUT, file),
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(VIEWPORT.width - box.x + pad, box.width + pad * 2),
      height: Math.min(VIEWPORT.height - box.y + pad, box.height + pad * 2),
    },
  });
}

const SHOTS = {
  /** §13 — group container boxes, sized from measured cards (D-1). */
  19: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    // Frame the three boxes that used to COLLIDE — Post-Processing against
    // Quality Gate, and Post-Processing against OCR Extraction, both measured
    // overlapping before D-1. A single five-card group can be legible or
    // wholly in frame but not both, and "the boxes no longer touch" is the
    // thing this section now has to show.
    await zoomOnto(
      page,
      '[data-group-container="true"]:has-text("Post-Processing")',
      330,
    );
    await shootAround(page, '[data-group-container="true"]:has-text("Post-Processing")', "19-group-container-boxes.png", {
      left: 430,
      right: 430,
      up: 110,
      down: 110,
    });
    await page.close();
  },

  /** §17 — the Inputs panel: optional disclosure + the full-width value field (D-2). */
  21: async (browser) => {
    const page = await newPage(browser);
    await page.goto(`${FRONTEND}/workflows/create`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector("text=Prepare File", { timeout: 20000 });
    await page.click("text=Prepare File");
    await page.waitForSelector('[data-testid="inputs-section"]', {
      timeout: 20000,
    });
    await page.click('[data-testid="optional-inputs-toggle"]');
    await page.waitForTimeout(600);
    await shootElement(page, '[data-testid="inputs-section"]', "21-optional-inputs-disclosure.png");
    await page.close();
  },

  /** §18 — simplified view after Auto-arrange (W-1). */
  22: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    await toggleSimplified(page);
    await page.click('[data-testid="topbar-menu-auto-arrange"]');
    await page.waitForTimeout(1600);
    await zoomOnto(page, '[data-testid^="canvas-group-chip-"]', 230);
    await shootCanvas(page, "22-simplified-arrange.png");
    await page.close();
  },

  /** §15 — the workflows list, Name as the focus column (S-2). */
  24: async (browser) => {
    const page = await newPage(browser);
    await page.goto(`${FRONTEND}/workflows`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector('[data-testid="workflow-slug"]', {
      timeout: 20000,
    });
    await page.waitForTimeout(600);
    await shootElement(page, "table", "24-list-columns.png");
    await page.close();
  },

  /** §20 (new) — the right-click menu acting on a multi-selection (W-3 / S-1). */
  25: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    const cards = page.locator(".react-flow__node.react-flow__node-activity");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    const third = await cards.nth(2).boundingBox();
    // CONTROL, not Shift. xyflow's `multiSelectionKeyCode` defaults to
    // Meta/Control and its `selectionKeyCode` — Shift — draws a marquee
    // instead, so shift-CLICK adds nothing to the selection. Measured
    // 2026-08-03: shift-click leaves 1 node selected, ctrl-click leaves 2,
    // shift-drag marquees 9. The docs said shift-click for months.
    await page.mouse.click(first.x + first.width / 2, first.y + 20);
    for (const box of [second, third]) {
      await page.keyboard.down("Control");
      await page.mouse.click(box.x + box.width / 2, box.y + 20);
      await page.keyboard.up("Control");
    }
    await page.waitForTimeout(400);
    await page.mouse.click(third.x + third.width / 2, third.y + 20, {
      button: "right",
    });
    await page.waitForSelector('[data-testid="node-context-menu"]', {
      timeout: 10000,
    });
    await page.waitForTimeout(400);
    await shootElement(page, '[data-testid="node-context-menu"]', "25-selection-context-menu.png", 20);
    await page.close();
  },

  /** §21 (new) — a group chip dragged to its own place in simplified view. */
  26: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    await toggleSimplified(page);
    await zoomOnto(page, '[data-testid^="canvas-group-chip-"]', 230);
    // A chip in the MIDDLE of the row: dragging the last one down proves
    // nothing, because there is nothing beside it to be out of line with.
    const chip = page.locator('[data-testid^="canvas-group-chip-"]').nth(2);
    const box = await chip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 150, {
      steps: 18,
    });
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 200, {
      steps: 18,
    });
    await page.mouse.up();
    await page.waitForTimeout(900);
    // Deselect so the shot is the canvas, not the group settings panel the
    // selection opens in the right rail. Escape rather than a click, because
    // any "empty" point picked by arithmetic eventually lands on a chip.
    await page.keyboard.press("Escape");
    await page.mouse.click(box.x, box.y + 420);
    await page.waitForTimeout(400);
    await shootCanvas(page, "26-chip-dragged.png");
    await page.close();
  },
};

const requested = process.argv.slice(2);
const ids = requested.length > 0 ? requested : Object.keys(SHOTS);

const browser = await chromium.launch({ headless: true });
const failures = [];
for (const id of ids) {
  const shot = SHOTS[id];
  if (!shot) {
    failures.push(`${id}: no such shot`);
    continue;
  }
  try {
    await shot(browser);
    console.log(`✓ ${id}`);
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
    console.log(`✗ ${id} — ${error.message}`);
  }
}
await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} shot(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\n${ids.length} shot(s) written to ${OUT}`);
