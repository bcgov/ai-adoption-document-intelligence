/**
 * Re-shoots the screenshots ILLUSTRATED.md embeds.
 *
 * Same idea as the 2026-08-02 batch's capture script: the shots go stale the
 * moment a later batch changes what they show, so they are taken by a script
 * that can be re-run rather than by hand.
 *
 *   npm run dev                  # frontend :3000, backend :3002, temporal worker
 *   npm run seed:demos           # the demo workflows the shots open
 *   node feature-docs/20260806-ux-review-batch-four/capture-screenshots.mjs
 *
 * Optional: pass shot ids to re-take only those.
 *
 *   node …/capture-screenshots.mjs 2 3
 *
 * VIEWPORT — 1920x1080, matching the walkthrough. The reason the previous
 * script gave for pinning it — below ~1600 the editor's top bar overflowed and
 * the disabled Undo button covered the Simplified switch — was fixed with item
 * 14 on 2026-08-08: the bar now shrinks without overlap or overflow from
 * 1920px down to 1280px, verified by measuring every top-bar control's
 * rectangle in Chromium at seven widths.
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
  // Item 8 (2026-08-08) collapsed the top bar's "Try" and "Run this
  // workflow" into one `Run…` button; for a workflow with a non-upload
  // input path the drawer opens on the "Try on canvas" tab already, so
  // the wait below still resolves without a tab click.
  await page.getByTestId("run-this-workflow-button").click();
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
 * The box that contains every one of `subject` — one CSS selector or a list of
 * them. Everything below that takes a "subject" takes either, because half
 * these shots are about a relationship between two elements (a node and the
 * popover explaining it, two nodes and the edge between them) and the frame,
 * the pan and the zoom all have to agree on what they are aiming at.
 */
async function subjectBox(page, subject) {
  const selectors = Array.isArray(subject) ? subject : [subject];
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return null;
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Pans the canvas until `subject` sits in the middle of the graph pane.
 *
 * Needed before any hard zoom. The pane is 1040px of a 1920px window — the
 * palette rail takes the first 520 and the settings panel the last 360 — and
 * xyflow does not clip to it: a card zoomed near the right-hand edge grows
 * *under* the settings panel and off the window, so the crop comes back with
 * the half of the card the shot was about missing. Centring first means the
 * card grows into free pane in every direction.
 *
 * Panning is a drag on empty pane (xyflow's default `panOnDrag`), done in
 * <=300px steps so both ends of every drag stay inside the pane, and started
 * from a point `elementFromPoint` confirms is bare pane rather than a card.
 */
async function centreInCanvas(page, subject) {
  const canvas = await page.locator(".react-flow").boundingBox();
  for (let i = 0; i < 8; i++) {
    const box = await subjectBox(page, subject);
    if (!box) return;
    const dx = canvas.x + canvas.width / 2 - (box.x + box.width / 2);
    const dy = canvas.y + canvas.height / 2 - (box.y + box.height / 2);
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) break;
    const stepX = Math.max(-300, Math.min(300, dx));
    const stepY = Math.max(-300, Math.min(300, dy));
    const start = await page.evaluate(
      ({ rect, sx, sy }) => {
        // Scan for bare pane, leaving room for the drag at both ends.
        for (let fx = 0.15; fx <= 0.85; fx += 0.1) {
          for (let fy = 0.15; fy <= 0.85; fy += 0.1) {
            const x = rect.x + rect.width * fx;
            const y = rect.y + rect.height * fy;
            if (
              x + sx < rect.x + 20 ||
              x + sx > rect.x + rect.width - 20 ||
              y + sy < rect.y + 20 ||
              y + sy > rect.y + rect.height - 20
            ) {
              continue;
            }
            const el = document.elementFromPoint(x, y);
            if (el?.classList.contains("react-flow__pane")) return { x, y };
          }
        }
        return null;
      },
      { rect: canvas, sx: stepX, sy: stepY },
    );
    if (!start) return;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + stepX, start.y + stepY, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
  await page.mouse.move(4, VIEWPORT.height - 4);
  await page.waitForTimeout(400);
}

/**
 * Zooms the canvas in on `subject` until it is at least `minWidth` wide.
 * Wheel-zooms with the cursor over the subject, because xyflow zooms toward
 * the cursor — the subject stays put while everything else grows away from it.
 */
async function zoomOnto(page, subject, minWidth = 620, maxSteps = 14) {
  for (let i = 0; i < maxSteps; i++) {
    const box = await subjectBox(page, subject);
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

/**
 * The canvas's current zoom, read off xyflow's own viewport transform.
 *
 * Needed because a shot of a 12px port dot is a shot of nothing at 0.35x, and
 * "the dots are legible" is a claim about a number rather than about a mood.
 * The shots that depend on it assert it and refuse the frame below a floor.
 */
async function canvasZoom(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!viewport) return 0;
    return new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
  });
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

/**
 * Crops to the box that contains ALL of `selectors` — for shots whose subject
 * is two things that must be seen together and that no single element wraps.
 * A hover popover renders through Mantine's portal, so it is not a descendant
 * of the node it explains; a union box is the only way to frame both.
 */
async function shootUnion(page, selectors, file, pad = 16) {
  const box = await subjectBox(page, selectors);
  if (!box) throw new Error(`nothing to shoot at ${selectors.join(" + ")}`);
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

/**
 * Opens the past-conversations panel and waits for the seeded demo row.
 *
 * The row's id is the seeder's own literal — `demo-agent-ocr-pipeline` — not a
 * generated cuid, which is what makes it addressable from a script at all.
 * Waiting for that exact row rather than for "the panel appeared" matters:
 * the panel renders "No prior conversations" perfectly happily, which is the
 * defect item 24 is about, so a shot that only waited for the panel would
 * photograph the bug and call it the fix.
 */
async function openConversationHistory(page) {
  await page.getByTestId("agent-chat-history-toggle").click();
  await page.waitForSelector(
    '[data-testid="agent-chat-conversation-demo-agent-ocr-pipeline"]',
    { timeout: 15000 },
  );
  await page.waitForTimeout(600);
}

/** Opens the run-history drawer from the top bar's More menu. */
async function openRunHistory(page) {
  await page.getByTestId("topbar-more-button").click();
  await page.getByTestId("topbar-menu-run-history").click();
  await page.waitForSelector('[data-testid="run-history-drawer-list"]', {
    timeout: 25000,
  });
  await page.waitForTimeout(700);
}

/**
 * Clicks the newest run-history row — the whole row is the gesture, per
 * `RunRow`'s `onClick`, not only its Replay button — and returns the three
 * rectangles the replay frame is cropped from.
 *
 * The measurement is the point, not a convenience. Item 13's ruling was that
 * replay should announce itself *between* the top bar and the canvas rather
 * than as a chip among the buttons it disables, and "between" is a claim about
 * coordinates. So the shot asks the page for the top bar's lowest control, the
 * banner and the canvas, and refuses to save a frame unless the banner really
 * does start below every top-bar control and end exactly where the canvas
 * begins. jsdom gives every box 0×0, so no unit test can make that check.
 */
async function enterReplayOnNewestRun(page) {
  await page.locator('[data-testid^="run-row-graph-"]').first().click();
  await page.waitForSelector('[data-testid="replay-mode-indicator"]', {
    timeout: 20000,
  });
  await page.waitForTimeout(900);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    return {
      topBar: rect('[data-testid="topbar-zone-right"]'),
      banner: rect('[data-testid="replay-mode-indicator"]'),
      canvas: rect(".react-flow"),
    };
  });
  if (!geometry.banner || !geometry.topBar || !geometry.canvas) {
    throw new Error("replay banner, top bar or canvas not measurable");
  }
  if (geometry.banner.top < geometry.topBar.bottom) {
    throw new Error(
      `banner top ${geometry.banner.top} is above the top bar's bottom ${geometry.topBar.bottom} — item 13 regressed`,
    );
  }
  if (Math.abs(geometry.canvas.top - geometry.banner.bottom) > 2) {
    throw new Error(
      `canvas starts at ${geometry.canvas.top}, banner ends at ${geometry.banner.bottom} — the banner is not taking its height out of the canvas`,
    );
  }
  // Printed because the caption quotes it. The frame cannot show the top bar
  // (see `shootReplayBand`), so the numbers are what carries the placement
  // claim in the document.
  process.stdout.write(
    `[measured: top bar ends ${Math.round(geometry.topBar.bottom)}px · ` +
      `banner ${Math.round(geometry.banner.top)}–${Math.round(geometry.banner.bottom)}px ` +
      `(${Math.round(geometry.banner.height)}px tall) · ` +
      `canvas starts ${Math.round(geometry.canvas.top)}px] `,
  );
  return geometry;
}

/**
 * Crops the replay frame: full window width, starting exactly at the banner's
 * top edge, running down through a band of canvas.
 *
 * Why the top bar is deliberately NOT in frame, even though the item is about
 * placement. The bar's right-hand zone carried both a Try button and a Run
 * button, and item 8 was collapsing the two into one `Run…` while this shot
 * was taken — so any frame containing them was stale the day it was taken; the
 * corner gets its own shot once it settles. The banner is
 * full width, and its "Leave replay" button sits at the far right, so a crop
 * narrow enough to exclude the Try/Run corner would also cut off one of the
 * two controls the item shipped. The frame therefore begins at the pixel the
 * top bar ends, and `enterReplayOnNewestRun` has already refused to save
 * anything unless that pixel really is the boundary. The measured numbers go
 * in the caption instead of the buttons.
 */
async function shootReplayBand(page, geometry, file, canvasBand = 460) {
  const y = Math.round(geometry.banner.top);
  await page.screenshot({
    path: join(OUT, file),
    clip: {
      x: 0,
      y,
      width: VIEWPORT.width,
      height: Math.min(
        VIEWPORT.height - y,
        Math.round(geometry.banner.height) + canvasBand,
      ),
    },
  });
}


/**
 * Runs the upload-driven try-in-place demo for real: picks the source card,
 * pushes a sample PDF through its "Upload & Try" affordance, and waits until
 * a result strip is actually carrying a value.
 *
 * There is no shortcut. A strip in its `ready` state is the one that shows the
 * value's first line — the thing Alex ruled on — and the only way to get one
 * is to make a run really produce a value.
 */
async function uploadAndRun(page) {
  const sourceId = await page.evaluate(() => {
    const el = document.querySelector('[data-node-type="source"]');
    return el?.getAttribute("data-testid")?.replace("canvas-node-", "") ?? null;
  });
  if (!sourceId) throw new Error("no source node on this workflow");
  await page.getByTestId(`canvas-node-${sourceId}`).click();
  await page
    .getByTestId("source-upload-button-section")
    .waitFor({ timeout: 15000 });
  await page
    .getByTestId("source-upload-button-input")
    .setInputFiles(join(REPO, "tests/e2e/workflow-builder/fixtures/documents/sample-invoice.pdf"));
  await page
    .getByTestId("source-upload-button-success")
    .waitFor({ timeout: 90000 });
  await page
    .locator('[data-testid^="node-result-strip-"][data-state="ready"]')
    .first()
    .waitFor({ timeout: 90000 });
  await page.waitForTimeout(2000);
  return sourceId;
}

const SHOTS = {
  /** §1 — run-status badges: bare glyph inside the filled disc. */
  1: async (browser) => {
    const page = await newPage(browser);
    // The workflow-as-API demo, which is the one the reviewer had open when he
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
    // ONE wide frame, since 2026-08-08. This was two tight crops, and the
    // script said why: "a wide frame of this graph is unreadable right now
    // because the preview panels grow the cards mid-run and they overlap
    // their neighbours". That was item 9, and item 9 is fixed — the cards now
    // keep their height and their width through a run, so both badges can be
    // shown in the same frame, in the graph they actually live in.
    await centreInCanvas(page, [failed, succeeded]);
    await zoomOnto(page, [failed, succeeded], 760);
    // Re-centre AFTER the zoom: zooming grows the pair about the cursor, so a
    // union that fitted the pane before is half outside it after, and the crop
    // comes back with the card the shot is about sliced down the middle.
    await centreInCanvas(page, [failed, succeeded]);
    await shootUnion(page, [failed, succeeded], "01-node-status-badges.png", 30);
    await page.close();
  },

  /** §2 — chat header: plus, filled stop, bare cross. */
  2: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await shootAround(
      page,
      '[data-testid="agent-chat-reset"]',
      "03-agent-chat-header.png",
      {
        left: 470,
        right: 90,
        up: 26,
        down: 26,
      },
    );
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
    await shootAround(
      page,
      '[data-testid="agent-chat-send"]',
      "04-agent-chat-composer.png",
      {
        left: 560,
        right: 30,
        up: 34,
        down: 30,
      },
    );
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
    await shootElement(
      page,
      ".mantine-Drawer-content",
      "05-agent-chat-panel.png",
      0,
    );
    await page.close();
  },

  /** §5 — the "+" on an unconnected port, next to a connected plain dot. */
  5: async (browser) => {
    const page = await newPage(browser);
    // The auto-wire demo, because its `submit` node carries the contrast on a
    // single card: `fileData` on the left is bound to the node before it, so
    // it stays a plain dot; `apimRequestId` on the right is required and goes
    // nowhere, so it gets the "+". Its two other outputs (`statusCode`,
    // `headers`) are optional, so they stay plain too — which is the second
    // half of the rule and would be invisible in a shot of an all-"+" node.
    await openEditor(page, "demo-auto-wire-typed-input-binding-states-part-8");
    const node = '[data-testid="canvas-node-submit"]';
    // 760px of a 1920px frame. An inviting dot is 16px at 1:1 and a canvas
    // fitted to a graph sits well below 1:1, so the shot has to be zoomed to
    // the level the change is arguing about, which is "can you tell it is a
    // plus".
    await centreInCanvas(page, node);
    await zoomOnto(page, node, 760);
    await shootElement(page, node, "06-port-plus-unconnected.png", 34);
    await page.close();
  },

  /** §6 — the error handle's popover, in error-path mode. */
  6: async (browser) => {
    const page = await newPage(browser);
    // The switch/error-edges demo: its `prep` node is the only seeded node
    // with `errorPolicy.onError === "fallback"`, which is what mounts the
    // bottom `error` handle at all.
    await openEditor(
      page,
      "demo-switch-error-edges-validatefields-editor-part-5",
    );
    const node = '[data-testid="canvas-node-prep"]';
    // Modest zoom, and centred high-ish: the popover opens *below* the handle
    // and is up to 500px tall, so the node has to leave room under itself.
    await centreInCanvas(page, node);
    await zoomOnto(page, node, 460);
    // Hover the handle itself, not the tooltip span around it — the mouse
    // handlers that open the popover are on the xyflow `<Handle>`.
    await page
      .locator('[data-testid="error-handle-tooltip-prep"] .react-flow__handle')
      .hover();
    await page.waitForSelector(
      '[data-testid="hover-extend-error-path-banner"]',
      {
        timeout: 15000,
      },
    );
    await page.waitForTimeout(700);
    // Three boxes, because item 5 asked for two things and hovering produces
    // both at once: the tooltip that names the red dot, and the popover that
    // now opens from it. Neither is a descendant of the node — both render
    // through Mantine's portal — so a union is the only frame that shows the
    // banner attached to the node it belongs to rather than floating alone.
    await shootUnion(
      page,
      [
        node,
        ".mantine-Tooltip-tooltip",
        '[data-testid="hover-extend-popover"]',
      ],
      "07-error-path-popover.png",
      20,
    );
    // NOT SHOT: the edge a pick draws.
    //
    // Landing a pick works — clicking a row really does add the node and wire
    // it from the `error` handle — but it is not photographable here. The new
    // node is dropped at an offset from its source with no re-layout, so on
    // this graph it lands ON TOP of `prep`, hiding both the source card and
    // the new edge; and fitting the view to recover puts the pair at a zoom
    // where no label is readable. Three framings were tried on 2026-08-08 and
    // all three produced a frame that argued the wrong thing. A shot that has
    // to be explained away is worse than no shot, so item 5's evidence is the
    // popover above and the checklist entry stands on the tests.
    await page.close();
  },

  /** §7 — failure named at the node's title, not only in the corner. */
  7: async (browser) => {
    const page = await newPage(browser);
    // Same demo and same reason as shot 1: it is the one that reliably puts a
    // real failure on the canvas, because its Azure steps have no credentials
    // here. The chip only exists during a live run, so this needs a real one.
    await openEditor(page, "demo-workflow-as-api-trigger-url-schema-part-11");
    await runViaTry(page);
    const failed = '.react-flow__node:has([data-testid^="node-failure-chip-"])';
    // Select the card first. xyflow's `elevateNodesOnSelect` raises the
    // selected node's z-index, and it has to be raised: mid-run this graph's
    // cards overlap (item 9, unfixed), and the neighbour that lands on top of
    // this one covers the title the shot is about. Clicked on the header
    // strip, which is the part no neighbour is sitting on.
    await page.locator(failed).click({ position: { x: 30, y: 14 } });
    await page.waitForTimeout(600);
    await centreInCanvas(page, failed);
    await zoomOnto(page, failed, 560);
    // The whole card, not a crop of the header: the point of item 7 is that
    // the title now carries the verdict *as well as* the corner badge, and a
    // frame that excluded the badge would be arguing the opposite case.
    await shootElement(page, failed, "08-node-failure-chip.png", 30);
    await page.close();
  },

  /** §8 — error handling as a radio group, all three options unclipped. */
  8: async (browser) => {
    const page = await newPage(browser);
    await openEditor(
      page,
      "demo-switch-error-edges-validatefields-editor-part-5",
    );
    // The settings panel is the right-hand column of the editor and it renders
    // for whatever node is selected — clicking the card is the whole gesture.
    // `prep` again, because a node with no policy shows the "Add error
    // handling" button instead of the radios.
    await page.locator('[data-testid="canvas-node-prep"]').click();
    await page.waitForSelector('[data-testid="error-policy-section"]', {
      timeout: 15000,
    });
    await page
      .locator('[data-testid="error-policy-section"]')
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    // The section whole, with air: the complaint was that the third option did
    // not fit, so a crop that clipped anything would be the defect, not the
    // fix.
    await shootElement(
      page,
      '[data-testid="error-policy-section"]',
      "09-error-policy-radio-group.png",
      18,
    );
    await page.close();
  },

  /** §9 — the group's own right-click menu. */
  9: async (browser) => {
    const page = await newPage(browser);
    // The grouping demo is the only seeded workflow with `nodeGroups` — two of
    // them, "OCR Extraction" (`ocr`) and "Finalize".
    await openEditor(page, "demo-grouping-simplified-view-node-swap-part-6");
    const header = '[data-testid="group-container-header-ocr"]';
    // Zoom before opening the menu. The header strip's label is drawn in
    // canvas units, so at the resting zoom of a five-node graph it is a few
    // pixels tall — and a frame in which the reader cannot tell what was
    // right-clicked does not show the thing item 19 is about.
    await centreInCanvas(page, '[data-testid="group-container-ocr"]');
    await zoomOnto(page, '[data-testid="group-container-ocr"]', 900);
    // Click near the strip's left end so the menu opens into the frame rather
    // than off the right-hand side of the pane.
    await page
      .locator(header)
      .click({ button: "right", position: { x: 60, y: 8 } });
    await page.waitForSelector('[data-testid="node-context-menu"]', {
      timeout: 15000,
    });
    await page.waitForTimeout(500);
    // The whole dashed container plus the menu. The menu is portalled, and a
    // shot of the menu alone would not show what was right-clicked — which is
    // the entire point of the item: the target, not the entry, was what was
    // missing. Framing the box rather than just its header also shows that the
    // three cards inside it are what "Ungroup … (steps stay)" is promising to
    // leave behind.
    await shootUnion(
      page,
      [
        '[data-testid="group-container-ocr"]',
        '[data-testid="node-context-menu"]',
      ],
      "10-group-context-menu.png",
      24,
    );
    await page.close();
  },

  /** §10 — the workflows table at full width, delete column intact. */
  10: async (browser) => {
    const page = await newPage(browser);
    await page.goto(`${FRONTEND}/workflows`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector('[data-testid="workflow-name-link"]', {
      timeout: 25000,
    });
    await page.waitForTimeout(1200);
    // This is the only real evidence for item 18. The unit tests assert the
    // column widths as strings; jsdom runs no table layout at all, so nothing
    // in the suite can tell whether the row actually fits. The browser can.
    //
    // The whole window, uncropped, and deliberately so: the complaint was a
    // horizontal scrollbar at full desktop width, and a scrollbar is a fact
    // about the window's right and bottom edges. A crop to the table would cut
    // off the evidence along with the frame.
    await page.screenshot({
      path: join(OUT, "11-workflows-table.png"),
      clip: { x: 0, y: 0, ...VIEWPORT },
    });
    await page.close();
  },

  /**
   * §11 — item 9, BEFORE. The one shot here that is of a defect rather than a
   * fix: pressing Try grows the cards to fit their preview panes and they
   * collide with their neighbours. It is unfixed and awaiting a ruling
   * (DECISIONS/09-try-reflow.md), so the evidence has to be taken now — every
   * option on the table removes exactly what this frame shows.
   */
  11: async (browser) => {
    const page = await newPage(browser);
    // The workflow-as-API demo again, and it is the right one rather than the
    // convenient one. The eight-node switch/error-edges demo was tried first,
    // on the theory that a bigger graph shows more collisions — it shows none.
    // Its nodes are authored ~570px apart on one horizontal rank, so a card
    // that grows 200px taller still hits nothing. The collision needs a
    // VERTICAL neighbour, which is what the 60px rank separation produces, and
    // this demo has one.
    await openEditor(page, "demo-workflow-as-api-trigger-url-schema-part-11");
    await runViaTry(page);
    // Find the collision rather than assume where it is. Which pair of cards
    // ends up on top of which depends on how far each preview grew, which
    // depends on what the run produced — so the shot asks the page which two
    // rectangles overlap most and frames those. If no two cards overlap, the
    // defect did not reproduce on this run and the shot fails loudly instead
    // of saving a frame of a graph that looks fine.
    const pair = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".react-flow__node")]
        .map((el) => ({
          id: el.getAttribute("data-id"),
          r: el.getBoundingClientRect(),
        }))
        .filter((c) => c.id);
      let best = null;
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i].r;
          const b = cards[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w <= 0 || h <= 0) continue;
          if (!best || w * h > best.area) {
            best = { area: w * h, ids: [cards[i].id, cards[j].id] };
          }
        }
      }
      return best;
    });
    // INVERTED on 2026-08-08. This shot used to hunt for the worst overlap
    // and frame it; `12-BEFORE-try-reflow-overlap.png` is that frame, kept as
    // the before-picture and never re-taken. Now the same search runs as an
    // ASSERTION: if any two cards still overlap after a Try, item 9 has
    // regressed and the shot fails loudly rather than saving a frame that
    // quietly contradicts its own caption.
    if (pair) {
      throw new Error(
        `item 9 has regressed — ${pair.ids.join(" and ")} overlap by ` +
          `${Math.round(pair.area)}px² after a Try`,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await shootAround(page, ".react-flow", "20-AFTER-try-no-reflow.png", {
      left: 0,
      right: 0,
      up: 0,
      down: 0,
    });
    await page.close();
  },

  /**
   * §12 — item 13, replay mode as a mode. Two frames: the ordinary blue
   * state, and the orange one that says the run's own version could not be
   * loaded.
   */
  12: async (browser) => {
    const page = await newPage(browser);
    // The workflow-as-API demo, because it is the only seeded workflow this
    // script has ever driven to a finish, so it is the one with run history
    // to click. Runs are what shots 1, 7 and 11 leave behind — which means
    // this shot depends on them having been taken at least once against this
    // database, and fails loudly rather than quietly if they have not.
    await openEditor(page, "demo-workflow-as-api-trigger-url-schema-part-11");
    await openRunHistory(page);
    const geometry = await enterReplayOnNewestRun(page);
    await shootReplayBand(page, geometry, "13-replay-mode-banner.png");
    await page.close();

    // The orange state, and it is FAULT-INJECTED — said plainly here and in
    // the caption, because a frame that looks spontaneous and is not is worse
    // than no frame.
    //
    // The banner turns orange when `useWorkflowVersion` errors, i.e. when the
    // run's recorded version cannot be fetched. Every one of the 18 runs in
    // this database points at a version that resolves 200 (checked by walking
    // every run of every workflow), so the state is unreachable by clicking:
    // it needs the backend to be down, or a version row to have been deleted
    // out from under a run. Rather than delete real rows, the version request
    // — and only that one request, matched to the exact endpoint — is failed
    // at the network layer. Everything the frame shows is the app's own real
    // rendering of a real condition; only the condition was arranged.
    //
    // It is worth having because it is the state that matters most: it is the
    // one where the graph on screen is NOT the graph that ran, and the whole
    // reason item 13 became a banner rather than a chip was that this
    // sentence had nowhere to fit.
    const failed = await newPage(browser);
    await failed.route(
      /\/api\/workflows\/[^/]+\/versions\/[^/?#]+(\?|$)/,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message:
              "Injected by capture-screenshots.mjs to photograph the version-unavailable state",
          }),
        }),
    );
    await openEditor(failed, "demo-workflow-as-api-trigger-url-schema-part-11");
    await openRunHistory(failed);
    await failed.locator('[data-testid^="run-row-graph-"]').first().click();
    // Wait on the attribute rather than on the element: the banner mounts
    // blue and only turns orange once the query has exhausted its one retry,
    // so waiting for the banner alone would photograph the wrong state.
    await failed.waitForSelector(
      '[data-testid="replay-mode-indicator"][data-version-unavailable="true"]',
      { timeout: 30000 },
    );
    await failed.waitForTimeout(900);
    const failedGeometry = await failed.evaluate(() => {
      const r = document
        .querySelector('[data-testid="replay-mode-indicator"]')
        .getBoundingClientRect();
      return { banner: { top: r.top, bottom: r.bottom, height: r.height } };
    });
    await shootReplayBand(
      failed,
      failedGeometry,
      "14-replay-mode-version-unavailable.png",
    );
    await failed.close();
  },

  /**
   * §13 — item 22, the agent says why it failed.
   *
   * The failure is real and costs nothing. Posting a turn to a seeded demo
   * conversation is refused by the backend before any model is called —
   * `AgentService.startChat` throws `AgentDemoConversationReadOnlyException`
   * (403, code `demo-conversation-read-only`) on the third statement of the
   * method, above every provider call — so this exercises exactly the path
   * item 22 built: a typed refusal, carried intact through Nest, parsed by
   * `describeAgentChatError`, rendered as `agent-chat-error` at the end of
   * the thread.
   *
   * It is deliberately NOT a plain send. This machine has a working Azure
   * deployment configured, so an ordinary turn would start a real billable
   * completion — and would succeed, which is the one thing that cannot
   * photograph an error.
   */
  13: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await openConversationHistory(page);
    await page
      .getByTestId("agent-chat-conversation-demo-agent-ocr-pipeline")
      .click();
    // The thread remounts and re-seeds from the conversation's stored
    // messages, so wait for the replayed turn before typing into it.
    await page.waitForTimeout(2500);
    // Close the history panel again: it is 200px of the drawer and it is not
    // what this shot is about — item 24 has its own frame below.
    await page.getByTestId("agent-chat-history-toggle").click();
    await page.waitForTimeout(400);
    await page.getByTestId("agent-chat-textarea").click();
    await page
      .getByTestId("agent-chat-textarea")
      .type("Can you add a validation step to this workflow?", { delay: 10 });
    await page.getByTestId("agent-chat-send").click();
    await page.waitForSelector('[data-testid="agent-chat-error"]', {
      timeout: 30000,
    });
    // The alert renders inside the thread's scroll viewport, last, so that a
    // failure reads as the turn's outcome rather than as panel chrome. That
    // placement is half of what the item shipped, and it is only visible if
    // the viewport is actually at the bottom — auto-scroll fires on message
    // changes and an error is not a message.
    await page.evaluate(() => {
      const viewport = document.querySelector(
        '[data-testid="agent-chat-thread"] .mantine-ScrollArea-viewport',
      );
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    await page.waitForTimeout(700);
    // The whole drawer, not a crop of the alert. The point of the item is
    // that the conversation now says something where it used to sit silent,
    // and that argument needs the conversation above it and the composer
    // below it in the same frame.
    const alert = await page
      .locator('[data-testid="agent-chat-error"]')
      .boundingBox();
    if (!alert || alert.y < 0 || alert.y + alert.height > VIEWPORT.height) {
      throw new Error("the error alert is outside the frame after scrolling");
    }
    await shootElement(
      page,
      ".mantine-Drawer-content",
      "15-agent-chat-error.png",
      0,
    );
    await page.close();
  },

  /** §14 — item 24, the seeded demo conversation is listed for a reader who did not create it. */
  14: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await openConversationHistory(page);
    // Park the cursor off the drawer. Opening the panel leaves the mouse on
    // the header button, whose "Hide past conversations" tooltip then lands
    // across the top of the list — an explanation of a different item's
    // control, photobombing this one.
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(700);
    // Header plus panel, as a union. The header is in frame because the
    // control that opens this list moved there in item 30 — a shot of the
    // list alone would not show what was clicked — and because the panel is
    // rendered below the header rather than inside it, so no single element
    // wraps both.
    await shootUnion(
      page,
      [
        '[data-testid="agent-chat-history-toggle"]',
        '[data-testid="agent-chat-conversation-switcher"]',
      ],
      "16-agent-chat-demo-conversation.png",
      14,
    );
    await page.close();
  },

  /**
   * §15 — item 23, the picker offers only what the backend can serve.
   *
   * Shot as the whole composer rather than the label alone, because the claim
   * is about a control that is no longer a control: `GET /api/agent/models`
   * returns one entry on this machine (`AZURE_OPENAI_DEPLOYMENT` names a
   * single deployment), so the picker renders a static line naming the model
   * instead of a dropdown whose only option is already chosen. A crop tight
   * to the text would show a label with nothing to compare it against.
   */
  15: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    // NOT hovered. The label carries a tooltip — "The only model this server
    // is configured for." — and it was tried in frame first, on the theory
    // that the reasoning belongs beside the evidence. Mantine centres that
    // tooltip above its target, which puts it straight across the composer's
    // placeholder, so the frame ended up hiding the input the label is meant
    // to be sitting under. The tooltip's words are in the caption instead.
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(500);
    await shootElement(
      page,
      '[data-testid="agent-chat-composer"]',
      "17-agent-chat-model-picker.png",
      16,
    );
    await page.close();
  },

  /**
   * §16 — the top bar, carrying items 14 and 8 in one frame.
   *
   * Deferred out of the wave-E pass on purpose: this corner was mid-change
   * then, and a frame of a control that is about to be replaced argues for a
   * design nobody shipped. Item 8 landed as `9cf679ff`, so it can be shot.
   *
   * Two claims, and both are checked before the frame is saved rather than
   * left to the reader's eye — a shot that has to be trusted is weaker than
   * one that has been measured:
   *
   *  - the standalone `try-button` no longer exists anywhere on the page
   *    (item 8 collapsed the pair into one `Run…`), and
   *  - `Run…` is enabled, because a greyed-out button photographs as "the
   *    feature is off" rather than "there is now one of these".
   */
  16: async (browser) => {
    const page = await newPage(browser);
    // "Standard OCR Workflow" rather than one of the demos, and the reason is
    // the subject of the shot. Item 14 is a claim about the workflow NAME, and
    // every seeded demo's name opens with a 🎯 that headless Chromium has no
    // font for — it renders as an empty box, which in a frame arguing "the
    // name is the first thing you see" is the worst possible first glyph. This
    // one has a plain name, is the workflow the reviewer was actually hunting for
    // when he hit item 16, and is long enough that the truncation the bar now
    // does under pressure is visible rather than hypothetical.
    await openEditor(page, "standard-ocr");
    if ((await page.locator('[data-testid="try-button"]').count()) > 0) {
      throw new Error(
        "a standalone Try button is still on the page — item 8 regressed",
      );
    }
    const runButton = page.getByTestId("run-this-workflow-button");
    if (await runButton.isDisabled()) {
      throw new Error(
        "Run… is disabled on this demo — the frame would argue the wrong thing",
      );
    }
    // Park the cursor: `openEditor` leaves it wherever the last action put it,
    // and a tooltip opening over the bar would cover the very controls the
    // frame is about.
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(600);
    // The union of the three zones IS the bar — there is no testid on the bar
    // itself. Framing all three rather than cropping to either end is the
    // whole point: item 14 is a claim about what is *leftmost*, and item 8 a
    // claim about how many buttons are on the *right*. Either crop alone
    // would show one item and hide the other.
    await shootUnion(
      page,
      [
        '[data-testid="topbar-zone-left"]',
        '[data-testid="topbar-zone-center"]',
        '[data-testid="topbar-zone-right"]',
      ],
      "18-topbar-name-first-one-run-button.png",
      16,
    );
    await page.close();
  },

  /**
   * §17 — the drawer `Run…` opens: the renamed tabs, and the sentence that
   * states the one real difference between a try and a run.
   *
   * This is also the live check on `runViaTry`, which another change rewired
   * for the new button: the first two steps of this shot are that helper's
   * first two steps, and it asserts `try-workflow-button` is really there
   * rather than trusting that the rewire worked.
   */
  17: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "demo-workflow-as-api-trigger-url-schema-part-11");
    await page.getByTestId("run-this-workflow-button").click();
    await page.waitForSelector('[data-testid="run-drawer-try-section"]', {
      timeout: 15000,
    });
    // The drawer opens on "Try on canvas" by itself here — `runDrawerOpenMode`
    // picks that tab whenever there is an input path that is not a file
    // upload, which a `source.api` node is. No tab is clicked, so the frame
    // shows the tab the user actually lands on.
    const activeTab = await page
      .getByTestId("run-drawer-tab-try")
      .getAttribute("aria-selected");
    if (activeTab !== "true") {
      throw new Error(
        `the drawer did not open on "Try on canvas" (aria-selected=${activeTab})`,
      );
    }
    if ((await page.getByTestId("try-workflow-button").count()) !== 1) {
      throw new Error(
        "no Try button inside the drawer — runViaTry would break",
      );
    }
    // The sentence is the entire point of item 8, so refuse the frame if it
    // is empty or missing rather than shipping a picture of a tab rename.
    const note = (
      await page.getByTestId("try-disposable-note").textContent()
    )?.trim();
    if (!note || note.length === 0) {
      throw new Error("the disposability note is missing or empty");
    }
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(600);
    // The Tabs root, which contains both the labels and the panel beneath
    // them. Cropped to it at 1:1 rather than scaled down, because the
    // disposability sentence is `size="xs"` dimmed text and the one thing
    // this frame must not do is make it unreadable.
    await shootElement(
      page,
      '[data-testid="run-drawer-tabs"]',
      "19-run-drawer-tabs-disposable-note.png",
      16,
    );
    await page.close();
  },
  /**
   * §18 — item 9, the result strip. Three frames of the same card: before any
   * run, after one, and with the popover open. The point of the set is that
   * the first two are the SAME SIZE — which is the whole fix — and that the
   * full value is still one click away rather than gone.
   */
  18: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "demo-try-in-place-run-a-workflow-see-previews-part-9");

    const sourceCard = '[data-node-type="source"]';
    await centreInCanvas(page, sourceCard);
    await zoomOnto(page, sourceCard, 620);
    await shootElement(page, sourceCard, "21-result-strip-at-rest.png", 22);

    // The upload panel needs the node selected, which the zoom above did not
    // do; `uploadAndRun` selects it, and selecting it also opens the settings
    // panel, so re-frame afterwards.
    const sourceId = await uploadAndRun(page);
    const card = `[data-testid="canvas-node-${sourceId}"]`;
    await centreInCanvas(page, card);
    await zoomOnto(page, card, 620);
    await shootElement(page, card, "22-result-strip-ready.png", 22);

    // The popover renders through Mantine's portal at 1:1, so it is legible
    // whatever the canvas zoom — but it is not a descendant of the card, so
    // the frame has to be the union of the two.
    await page.getByTestId(`node-result-strip-${sourceId}`).click();
    await page.waitForTimeout(1000);
    await shootUnion(
      page,
      [card, '[data-testid^="node-result-detail-"]'],
      "23-result-strip-popover.png",
      24,
    );
    await page.close();
  },

  /**
   * §19 — item 20, the port vocabulary on a real canvas.
   *
   * The switch/error-edges demo, because it is the one seeded graph that puts
   * all five port families on screen at once — a blue `Document` circle, a
   * violet `OcrResult` square, a yellow `ValidationResult` diamond, teal
   * `DocumentId`/`RequestId` bars and grey untyped hollows — together with the
   * two wire kinds the legend's first group names, the ordinary data wire and
   * the red error route out of `prep`.
   *
   * ZOOMED IN, and it does not fit. Fit-view on this graph lands at 0.35×,
   * where a 12px dot is four pixels and the shapes the item shipped are not
   * decidable — so the frame is the whole canvas pane at a zoom where the dots
   * are legible rather than the whole graph at a zoom where they are not. The
   * zoom is measured and the frame refused below 0.7×, so this cannot quietly
   * regress into an unreadable picture.
   */
  19: async (browser) => {
    const page = await newPage(browser);
    await openEditor(
      page,
      "demo-switch-error-edges-validatefields-editor-part-5",
    );
    // Centre on the pair that carries the contrast — the node with the blue
    // circle and the one with the yellow diamond — so the zoom grows the
    // interesting half of the graph into the pane rather than the empty half.
    // Four cards, chosen by what they carry rather than by where they sit:
    // `prep` and `submit` hold the blue `Document`/`PreparedFile` circle,
    // `extract` the violet `OcrResult` square, all four the teal `DocumentId`
    // and `RequestId` bars and the grey untyped hollows — and `prep` is the
    // node the red error route leaves from, landing on `fallback`, so both
    // wire kinds are in the same frame as the dots.
    //
    // `store` and `validateFields` are NOT in the anchor, and that is the one
    // real limitation of this frame: they are 740px further right at fit-view,
    // so an anchor that included them would hold the yellow diamond too but
    // could not be zoomed past 0.41x without running off the pane, and at
    // 0.41x a 12px dot is five pixels. The diamond gets its own close frame
    // below instead.
    const anchor = [
      '[data-testid="canvas-node-prep"]',
      '[data-testid="canvas-node-submit"]',
      '[data-testid="canvas-node-extract"]',
      '[data-testid="canvas-node-fallback"]',
    ];
    await centreInCanvas(page, anchor);
    // Zoom in as far as the three cards still fit the pane, then stop — one
    // xyflow step (1.2x) at a time, undone when the step overflows. Picking a
    // level by hand does not survive a layout change, and both failure modes
    // are silent in a PNG: too far out and the 12px dot is four pixels, too
    // far in and the leftmost card grows under the palette rail with its port
    // column sliced off.
    for (let i = 0; i < 8; i++) {
      await page.locator(".react-flow__controls-zoomin").click();
      await page.waitForTimeout(450);
      await centreInCanvas(page, anchor);
      const box = await subjectBox(page, anchor);
      const rect = await page.locator(".react-flow").boundingBox();
      if (box.width > rect.width - 24) {
        await page.locator(".react-flow__controls-zoomout").click();
        await page.waitForTimeout(450);
        break;
      }
    }
    await centreInCanvas(page, anchor);
    const zoom = await canvasZoom(page);
    if (zoom < 0.55) {
      throw new Error(
        `canvas is at ${zoom.toFixed(2)}x — the port dots would be under 7px`,
      );
    }
    process.stdout.write(`[canvas at ${zoom.toFixed(2)}x] `);
    // Park the cursor so no port tooltip or hover-extend popover opens over a
    // card while the frame is taken.
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(1200);
    const band = await subjectBox(page, anchor);
    const pane = await page.locator(".react-flow").boundingBox();
    if (band.x < pane.x - 1 || band.x + band.width > pane.x + pane.width + 1) {
      throw new Error(
        `a card is outside the graph pane at ${zoom.toFixed(2)}x — the frame would clip it`,
      );
    }
    const top = Math.max(pane.y, band.y - 40);
    const bottom = Math.min(pane.y + pane.height, band.y + band.height + 40);
    await page.screenshot({
      path: join(OUT, "24-port-vocabulary-canvas.png"),
      clip: { x: pane.x, y: top, width: pane.width, height: bottom - top },
    });
    await page.close();
  },

  /**
   * §20 — item 20, the SHAPES, close enough to decide them.
   *
   * TWO frames, from two cards of the same graph, and the reason is a finding
   * rather than a preference: no single seeded card carries more than three of
   * the five families. `prep` holds the blue circle, the teal bar and the grey
   * hollow; `validateFields` holds the violet square, the teal bar and the
   * yellow diamond. Between them all five silhouettes are photographed, each
   * beside a neighbour it has to be told apart from — which is the whole claim
   * of the shape half of item 20 and could not be made by one frame.
   *
   * Both are zoomed to ~900px of card, roughly 3x the authored width, which
   * puts the 12px dot near 36px. That is the size at which "is this a diamond
   * or a square" stops being a guess. The shapes each frame contains are read
   * off the DOM and asserted before the frame is saved.
   */
  20: async (browser) => {
    const page = await newPage(browser);
    await openEditor(
      page,
      "demo-switch-error-edges-validatefields-editor-part-5",
    );
    // The per-card zoom target is not decoration. `validateFields` is an
    // authored-wide card, so at the 900px `prep` is shot at it fills the pane
    // edge to edge and its right-hand diamond ends up UNDER the settings
    // panel — half a diamond, in the one frame whose whole job is that the
    // diamond is a diamond. 700px keeps it inside the pane.
    for (const [nodeId, file, expected, minWidth] of [
      [
        "prep",
        "25-port-shapes-circle-bar-hollow.png",
        ["circle", "bar", "hollow"],
        900,
      ],
      [
        "validateFields",
        "26-port-shapes-square-bar-diamond.png",
        ["square", "bar", "diamond"],
        700,
      ],
    ]) {
      const card = `[data-testid="canvas-node-${nodeId}"]`;
      const shapes = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        return [
          ...new Set(
            [...el.querySelectorAll("[data-port-shape]")].map((row) =>
              row.getAttribute("data-port-shape"),
            ),
          ),
        ];
      }, card);
      if (!shapes) throw new Error(`no card ${nodeId} on this graph`);
      const missing = expected.filter((shape) => !shapes.includes(shape));
      if (missing.length > 0) {
        throw new Error(
          `${nodeId} no longer carries ${missing.join(", ")} (it has ${shapes.join(", ")})`,
        );
      }
      process.stdout.write(`[${nodeId}: ${shapes.join(", ")}] `);
      await centreInCanvas(page, card);
      await zoomOnto(page, card, minWidth);
      await centreInCanvas(page, card);
      // Refuse the frame if the card is wider than the pane it sits in: the
      // port dots hang off both edges, so a card that overflows loses exactly
      // the thing being photographed.
      const shotBox = await subjectBox(page, card);
      const shotPane = await page.locator(".react-flow").boundingBox();
      if (
        shotBox.x < shotPane.x + 12 ||
        shotBox.x + shotBox.width > shotPane.x + shotPane.width - 12
      ) {
        throw new Error(
          `${nodeId} overflows the graph pane at this zoom — its edge dots would be cut`,
        );
      }
      await shootElement(page, card, file, 36);
      // Back to fit-view before the next card, so the second pan starts from a
      // canvas where the target is on screen rather than three zoom levels off
      // the side of it.
      await page.locator(".react-flow__controls-fitview").click();
      await page.waitForTimeout(900);
    }
    await page.close();
  },

  /**
   * §21 — the legend, rebuilt: four named groups instead of one list.
   *
   * Checked before the frame is saved, because "all four sections" is the
   * claim and a popover that scrolled or clipped one of them would photograph
   * as three. The four headings are read back, the five family rows, two ring
   * rows and five accent rows counted, so a frame can never quietly show a
   * half-rendered dropdown.
   */
  21: async (browser) => {
    const page = await newPage(browser);
    await openEditor(
      page,
      "demo-switch-error-edges-validatefields-editor-part-5",
    );
    await page.getByTestId("canvas-legend-button").click();
    await page.waitForSelector('[data-testid="canvas-legend"]', {
      timeout: 15000,
    });
    // The popover's transition is `duration: 0`, but Mantine still positions
    // it on the next frame; wait for that rather than shoot mid-placement.
    await page.waitForTimeout(800);
    const legend = await page.evaluate(() => {
      const rows = (testid) =>
        document.querySelectorAll(`[data-testid="${testid}"] > *`).length;
      return {
        headings: [
          ...document.querySelectorAll('[data-testid="canvas-legend"] > div > p'),
        ].map((el) => el.textContent?.trim()),
        families: rows("canvas-legend-families"),
        rings: rows("canvas-legend-rings"),
        accents: rows("canvas-legend-accents"),
      };
    });
    const expected = ["Wires", "Port dots", "Rings", "Card borders"];
    if (legend.headings.join("|") !== expected.join("|")) {
      throw new Error(
        `legend sections are [${legend.headings.join(", ")}], not the four expected`,
      );
    }
    if (legend.families !== 5 || legend.rings !== 2 || legend.accents !== 5) {
      throw new Error(
        `legend rows are ${legend.families} families / ${legend.rings} rings / ` +
          `${legend.accents} accents, not 5 / 2 / 5`,
      );
    }
    process.stdout.write(
      `[${legend.headings.join(" - ")}; ${legend.families}/${legend.rings}/${legend.accents}] `,
    );
    // Park the cursor: it is sitting on the Legend button, whose own tooltip
    // would otherwise land across the bottom of the dropdown.
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(700);
    // Button plus dropdown as a union — the popover is portalled, so a shot of
    // the dropdown alone would not show what opens it.
    await shootUnion(
      page,
      ['[data-testid="canvas-legend-button"]', '[data-testid="canvas-legend"]'],
      "27-canvas-legend-four-sections.png",
      14,
    );
    await page.close();
  },

  /**
   * §22 — the five card-border accents, in one graph.
   *
   * The control-flow demo is the only seeded workflow carrying every role at
   * once: `activity` (calm slate), `switch` and `pollUntil` (amber routing),
   * `map` and `join` (purple fan), `humanGate` (red person), `childWorkflow`
   * (green). The frame is the union of one card per role, so the ordinary
   * activity's slate is in shot beside the four that are not ordinary — which
   * is the argument of the accent merge: a coloured card is now exactly a card
   * that does something structurally unusual.
   *
   * The role of each card is read from xyflow's own `react-flow__node-<type>`
   * class rather than from a `data-` attribute, because the attribute lives on
   * the card body inside the wrapper and the activity renderer does not set it
   * at all. Any missing role fails the shot instead of producing a picture of
   * four accents captioned as five.
   */
  22: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "demo-control-flow-forms-condition-editor-part-4");
    const ROLE_OF_TYPE = {
      activity: "activity",
      switch: "routing",
      pollUntil: "routing",
      map: "fan",
      join: "fan",
      humanGate: "person",
      childWorkflow: "childWorkflow",
    };
    const byRole = await page.evaluate((roleOfType) => {
      const found = {};
      for (const card of document.querySelectorAll(".react-flow__node")) {
        const id = card.getAttribute("data-id");
        const type = [...card.classList]
          .find((name) => name.startsWith("react-flow__node-"))
          ?.slice("react-flow__node-".length);
        const role = roleOfType[type];
        if (!id || !role || found[role]) continue;
        found[role] = id;
      }
      return found;
    }, ROLE_OF_TYPE);
    const missing = ["activity", "routing", "fan", "person", "childWorkflow"]
      .filter((role) => !byRole[role]);
    if (missing.length > 0) {
      throw new Error(`no card on this graph for: ${missing.join(", ")}`);
    }
    process.stdout.write(
      `[${Object.entries(byRole)
        .map(([role, id]) => `${role}=${id}`)
        .join(" ")}] `,
    );
    // The stripe colours are MEASURED, not eyeballed. A 6px border at the
    // zoom this graph fits at is a few pixels of colour, and "those five are
    // different" is exactly the kind of claim a reader should not have to take
    // on trust from a thumbnail — so the shot reads each card's computed
    // border-left-color and refuses the frame if any of them is not the hex
    // `node-accents.ts` declares. The numbers are printed for the caption.
    const EXPECTED = {
      activity: "rgb(100, 116, 139)",
      routing: "rgb(217, 119, 6)",
      fan: "rgb(107, 33, 168)",
      person: "rgb(185, 28, 28)",
      childWorkflow: "rgb(6, 95, 70)",
    };
    const painted = await page.evaluate((ids) => {
      const out = {};
      for (const [role, id] of Object.entries(ids)) {
        const el = document.querySelector(`[data-testid="canvas-node-${id}"]`);
        out[role] = el ? getComputedStyle(el).borderLeftColor : null;
      }
      return out;
    }, byRole);
    const wrong = Object.entries(EXPECTED).filter(
      ([role, hex]) => painted[role] !== hex,
    );
    if (wrong.length > 0) {
      throw new Error(
        `accent stroke mismatch: ${wrong
          .map(([role, hex]) => `${role} painted ${painted[role]}, expected ${hex}`)
          .join("; ")}`,
      );
    }
    process.stdout.write(
      `[strokes: ${Object.entries(painted)
        .map(([role, hex]) => `${role} ${hex}`)
        .join(" · ")}] `,
    );
    // The WHOLE GRAPH, not a union crop of the five role cards. A tight union
    // was tried first and it is the wrong frame: at a zoom that makes one card
    // readable the five are ~2,600px apart, so the crop ran out over the
    // palette rail on one side and the settings panel on the other and sliced
    // three of the five in half. A claim about card BORDERS is read against
    // neighbouring cards, so every card has to be in shot.
    //
    // Fit-view lands at 0.50x with the graph in the middle third of a 968px
    // pane; one zoom step up fills the frame and keeps all eight cards, which
    // is the most readable version of this particular picture.
    const allCards = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node")]
        .map((el) => el.getAttribute("data-id"))
        .filter((id) => id && !id.startsWith("container-")),
    );
    const allSelectors = allCards.map(
      (id) => `[data-testid="canvas-node-${id}"]`,
    );
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1200);
    const accentZoom = await canvasZoom(page);
    process.stdout.write(`[canvas at ${accentZoom.toFixed(2)}x] `);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(900);
    // Full pane WIDTH, cropped vertically to the band the graph occupies.
    //
    // The width is not negotiable and that is the finding: zooming in far
    // enough to fill the frame pushes the outermost cards under the palette
    // rail and the settings panel, and a crop wide enough to hold them is a
    // crop that includes both. So the frame keeps fit-view's zoom — where
    // every card is whole and inside the pane — and only trims the empty
    // canvas above and below, which is where the wasted pixels actually were.
    const band = await subjectBox(page, allSelectors);
    const pane = await page.locator(".react-flow").boundingBox();
    if (band.x < pane.x - 1 || band.x + band.width > pane.x + pane.width + 1) {
      throw new Error(
        "a card is outside the graph pane at fit-view — the frame would clip it",
      );
    }
    const top = Math.max(pane.y, band.y - 34);
    const bottom = Math.min(pane.y + pane.height, band.y + band.height + 34);
    await page.screenshot({
      path: join(OUT, "28-node-accents-five-roles.png"),
      clip: {
        x: pane.x,
        y: top,
        width: pane.width,
        height: bottom - top,
      },
    });
    await page.close();
  },
};

const requested = process.argv.slice(2);
const ids = requested.length > 0 ? requested : Object.keys(SHOTS);

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const id of ids) {
    const shot = SHOTS[id];
    if (!shot) {
      console.log(`  ? no shot ${id}`);
      continue;
    }
    process.stdout.write(`  shooting ${id} … `);
    // Three attempts, because the dev stack this shoots against is a watcher:
    // an edit anywhere under `apps/` restarts nest or vite mid-shot and the
    // page that was loading gets a connection refused instead of a graph.
    // That is a property of the environment, not of the change being
    // photographed, so retry rather than record a broken frame — and if all
    // three fail, say which shot and why instead of leaving a stale image
    // silently in place.
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await shot(browser);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          process.stdout.write(`retry ${attempt} … `);
          await new Promise((r) => setTimeout(r, 30000));
        }
      }
    }
    if (lastError) {
      console.log(`FAILED — ${lastError.message.split("\n")[0]}`);
      failures.push(id);
    } else {
      console.log("ok");
    }
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.log(`\n  ${failures.length} shot(s) failed: ${failures.join(", ")}`);
  process.exitCode = 1;
}
