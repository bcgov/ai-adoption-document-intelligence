/**
 * Re-shoots the screenshots ILLUSTRATED.md embeds.
 *
 * Same idea as the 2026-08-02 batch's capture script: the shots go stale the
 * moment a later batch changes what they show, so they are taken by a script
 * that can be re-run rather than by hand.
 *
 *   npm run dev                  # frontend :3000, backend :3002, temporal worker
 *   npm run seed:demos           # the demo workflows the shots open
 *   node feature-docs/20260806-inderdeep-ux-review-batch-four/capture-screenshots.mjs
 *
 * Optional: pass shot ids to re-take only those.
 *
 *   node …/capture-screenshots.mjs 2 3
 *
 * VIEWPORT — 1920x1080, for the reason the previous script documented: below
 * ~1600 the editor's top bar overflows and the disabled Undo button covers the
 * Simplified switch, which is a separately-tracked defect rather than something
 * to hide.
 *
 * The API key is the seeded dev default, read from the environment or from
 * playwright.config.ts's fallback, and never printed.
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
  const page = await (
    await browser.newContext({ viewport: VIEWPORT })
  ).newPage();
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
  // Let arrange-on-load and the card measurements settle before shooting.
  await page.waitForTimeout(2500);
}

/**
 * Runs the open workflow through the Try drawer and waits for the node status
 * badges to stop being "pending".
 *
 * The badges are the subject of shot 1 and they only exist while a run is
 * active — `NodeStatusBadgeOverlay` renders nothing without an `activeRunId`,
 * deliberately, so that a design-time canvas is not littered with gray dots.
 * There is therefore no way to photograph them without really running
 * something, which is the point: the shot has to be of the real thing.
 */
async function runViaTry(page) {
  await page.getByTestId("try-button").click();
  await page.waitForSelector('[data-testid="run-drawer-try-section"]', {
    timeout: 15000,
  });
  await page.getByTestId("try-workflow-button").click();
  // Poll until at least one node has settled into a terminal state.
  await page
    .locator(
      '[data-testid="node-status-badge"][data-status="succeeded"], ' +
        '[data-testid="node-status-badge"][data-status="failed"]',
    )
    .first()
    .waitFor({ timeout: 90000 });
  // Give the rest of the graph a beat to finish reporting.
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
}

/**
 * Zooms the canvas in on `selector` until it is at least `minWidth` wide.
 * Wheel-zooms with the cursor over the subject, because xyflow zooms toward
 * the cursor — the subject stays put while everything else grows away from it.
 */
async function zoomOnto(page, selector, minWidth = 620, maxSteps = 14) {
  for (let i = 0; i < maxSteps; i++) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return;
    if (box.width >= minWidth) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(220);
  }
  // Park the cursor off the graph. Zooming leaves it sitting on a card, and
  // hovering a port opens the hover-extend popover — which then photobombs the
  // shot with an explanation of a port nobody was asking about.
  await page.mouse.move(4, VIEWPORT.height - 4);
  await page.waitForTimeout(900);
}

/** Crops a window around `selector` — for shots whose subject is a relationship. */
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

/** Crops to an element with a little air around it. */
async function shootElement(page, selector, file, pad = 12) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to shoot at ${selector}`);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  await page.screenshot({
    path: join(OUT, file),
    clip: {
      x,
      y,
      width: Math.min(VIEWPORT.width - x, box.width + pad * 2),
      height: Math.min(VIEWPORT.height - y, box.height + pad * 2),
    },
  });
}

/** Opens the agent chat drawer from the header bubble. */
async function openAgentChat(page) {
  await page.goto(`${FRONTEND}/workflows`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.getByTestId("agent-chat-icon").click();
  await page.waitForSelector('[data-testid="agent-chat-textarea"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(800);
}

const SHOTS = {
  /** §1 — run-status badges: bare glyph inside the filled disc. */
  1: async (browser) => {
    const page = await newPage(browser);
    // The workflow-as-API demo, which is the one Inderdeep had open when he
    // reported the badge. It carries a `source.api` node, so the Try button is
    // visible (the try-in-place demo is upload-driven and hides Try behind
    // "Upload & Try"), and its later steps fail without Azure credentials —
    // which is what puts a green check and a red cross in the same frame.
    await openEditor(page, "demo-workflow-as-api-trigger-url-schema-part-11");
    await runViaTry(page);
    const failed =
      '.react-flow__node:has([data-testid="node-status-badge"][data-status="failed"])';
    const succeeded =
      '.react-flow__node:has([data-testid="node-status-badge"][data-status="succeeded"])';
    await zoomOnto(page, failed, 460);
    // Two tight crops rather than one wide one. A wide frame of this graph is
    // unreadable right now because the preview panels grow the cards mid-run
    // and they overlap their neighbours — that is checklist item 9, still
    // open, and it is not what this shot is about.
    await shootElement(page, failed, "01-node-status-badge-failed.png", 26);
    await shootElement(page, succeeded, "02-node-status-badge-succeeded.png", 26);
    await page.close();
  },

  /** §2 — chat header: plus, filled stop, bare cross. */
  2: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await shootAround(page, '[data-testid="agent-chat-reset"]', "03-agent-chat-header.png", {
      left: 470,
      right: 90,
      up: 26,
      down: 26,
    });
    await page.close();
  },

  /** §3 — composer: the send button in the theme's blue, focus ring to match. */
  3: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    // Type something so the composer is focused (showing the ring) and the
    // send button is in its enabled state rather than greyed out.
    await page.getByTestId("agent-chat-textarea").click();
    await page
      .getByTestId("agent-chat-textarea")
      .type("Build me a workflow that OCRs invoices", { delay: 12 });
    await page.waitForTimeout(500);
    await shootAround(page, '[data-testid="agent-chat-send"]', "04-agent-chat-composer.png", {
      left: 560,
      right: 30,
      up: 34,
      down: 30,
    });
    await page.close();
  },

  /** §4 — the whole chat panel, so the three icon changes are seen in place. */
  4: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await page.getByTestId("agent-chat-textarea").click();
    await page
      .getByTestId("agent-chat-textarea")
      .type("Build me a workflow that OCRs invoices", { delay: 12 });
    await page.waitForTimeout(500);
    await shootElement(page, ".mantine-Drawer-content", "05-agent-chat-panel.png", 0);
    await page.close();
  },
};

const requested = process.argv.slice(2);
const ids = requested.length > 0 ? requested : Object.keys(SHOTS);

const browser = await chromium.launch({ headless: true });
try {
  for (const id of ids) {
    const shot = SHOTS[id];
    if (!shot) {
      console.log(`  ? no shot ${id}`);
      continue;
    }
    process.stdout.write(`  shooting ${id} … `);
    await shot(browser);
    console.log("ok");
  }
} finally {
  await browser.close();
}
