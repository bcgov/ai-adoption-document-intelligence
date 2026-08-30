/**
 * BEFORE / AFTER frames for the 2026-08-14 workflow-designer review fixes.
 *
 * Two reviews landed the same day (Inderdeep, items I1–I5; Dylan, items
 * D1–D34 — see `CHECKLIST.md`). The illustrated write-up puts a "before" frame
 * next to an "after" frame for each item that has a visible surface, so the
 * two runs have to be the SAME script pointed at the same routes and the same
 * UI states — otherwise the pair differs by framing rather than by the fix.
 *
 *   npm run dev                  # frontend :3000, backend :3002, temporal worker
 *   npm run seed:demos           # the demo workflows the shots open
 *
 *   node feature-docs/20260814-workflow-designer-fixes/capture-screenshots.mjs --phase before
 *   …                                                                          --phase after
 *
 * Output goes to `screenshots/<phase>/<itemId>-<slug>.png`. Pass item ids to
 * re-take only those:
 *
 *   node …/capture-screenshots.mjs --phase after I3 D13
 *
 * VIEWPORT — 1920x1080, the same as the 2026-08-06 batch and the walkthrough,
 * so a frame from either batch can be laid beside a frame from this one.
 *
 * The API key is the seeded dev default, read from the environment or from
 * playwright.config.ts's fallback, and never printed.
 */

import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");

const FRONTEND = "http://localhost:3000";
const VIEWPORT = { width: 1920, height: 1080 };

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const phaseIndex = argv.indexOf("--phase");
const PHASE = phaseIndex === -1 ? "before" : argv[phaseIndex + 1];
if (PHASE !== "before" && PHASE !== "after") {
  throw new Error(`--phase must be "before" or "after" (got ${PHASE})`);
}
const requested = argv.filter(
  (a, i) => a !== "--phase" && i !== phaseIndex + 1 && !a.startsWith("--"),
);

const OUT = join(HERE, "screenshots", PHASE);
mkdirSync(OUT, { recursive: true });

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

/**
 * A backend call made from the script itself rather than from the page —
 * used only to build and then destroy the scratch lineage D11 needs. The key
 * is passed as a header from the variable above and never interpolated into
 * a command line or printed.
 */
async function api(path, init = {}) {
  const res = await fetch(`http://localhost:3002${path}`, {
    ...init,
    headers: {
      "x-api-key": API_KEY,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

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

/**
 * Auth interception, per `.claude/skills/app-browser-auth`.
 *
 * Origin-agnostic globs on purpose: the visual editor calls the API through
 * the FRONTEND origin (Vite proxy), so a route registered on :3002 never
 * fires and the page lands on the IDIR login screen.
 */
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

/** The box that contains every one of `subject` — one selector or a list. */
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
 * Needed before any hard zoom: xyflow does not clip to the pane, so a card
 * zoomed near the right edge grows *under* the settings panel and the crop
 * comes back with half the subject missing. Panning is a drag on empty pane,
 * in <=300px steps, started from a point `elementFromPoint` confirms is bare
 * pane rather than a card.
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
 * the cursor — the subject stays put while everything else grows away.
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
  // Park the cursor off the graph: zooming leaves it on a card, and hovering
  // a port opens the hover-extend popover, which photobombs the frame.
  await page.mouse.move(4, VIEWPORT.height - 4);
  await page.waitForTimeout(900);
}

/** The canvas's current zoom, read off xyflow's own viewport transform. */
async function canvasZoom(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!viewport) return 0;
    return new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
  });
}

/**
 * Turns a bounding box into a screenshot clip. `pad` is either one number for
 * all four sides or `{ left, right, up, down }`, and the result is clamped to
 * the viewport so a subject near an edge crops rather than throwing.
 */
function clipFor(box, pad = 12) {
  const sides = typeof pad === "number"
    ? { left: pad, right: pad, up: pad, down: pad }
    : { left: 0, right: 0, up: 0, down: 0, ...pad };
  const { left: l, right: r, up: u, down: d } = sides;
  const x = Math.max(0, box.x - l);
  const y = Math.max(0, box.y - u);
  return {
    x,
    y,
    width: Math.min(VIEWPORT.width - x, box.width + l + r),
    height: Math.min(VIEWPORT.height - y, box.height + u + d),
  };
}

/** Crops to an element with a little air around it. */
async function shootElement(page, selector, file, pad = 12) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing to shoot at ${selector}`);
  await page.screenshot({ path: join(OUT, file), clip: clipFor(box, pad) });
}

/** Crops to the box containing ALL of `selectors` — for shots about a pair. */
async function shootUnion(page, selectors, file, pad = 16) {
  const box = await subjectBox(page, selectors);
  if (!box) throw new Error(`nothing to shoot at ${selectors.join(" + ")}`);
  await page.screenshot({ path: join(OUT, file), clip: clipFor(box, pad) });
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
  await page.waitForTimeout(1000);
}

/**
 * Runs the open workflow through the Run drawer's "Try on canvas" tab and
 * waits for a node to reach a terminal state.
 *
 * `NodeFailureChip` (I4) and the failed `NoOutputNotice` (I5) both render
 * nothing without an `activeRunId` on `RunStateContext` — deliberately, so a
 * design-time canvas is not littered with stale statuses. There is therefore
 * no way to photograph either without really running something, which is the
 * point: the frame has to be of the real thing.
 */
async function runViaTry(page, { expect = "any" } = {}) {
  await page.getByTestId("run-this-workflow-button").click();
  await page.waitForSelector('[data-testid="run-drawer-try-section"]', {
    timeout: 15000,
  });
  await page.getByTestId("try-workflow-button").click();
  const wanted =
    expect === "failed"
      ? '[data-testid="node-status-badge"][data-status="failed"]'
      : '[data-testid="node-status-badge"][data-status="succeeded"], ' +
        '[data-testid="node-status-badge"][data-status="failed"]';
  await page.locator(wanted).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(5000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
}

/**
 * The rectangle of the editor's left rail (`ActivityPalette`) or right rail
 * (`NodeSettingsPanel`).
 *
 * Neither root carries a test id — the ids in those two components are on the
 * rows and fields INSIDE them — so the rails are located structurally: the
 * editor's body is one flex row whose three children are, in order, the
 * palette, the canvas box and the settings panel. Reading the row off the
 * canvas's own parent means the lookup survives anything that changes the
 * page above it.
 */
async function railBox(page, side) {
  const box = await page.evaluate((which) => {
    const flow = document.querySelector(".react-flow");
    if (!flow) return null;
    let canvasBox = flow;
    while (canvasBox && canvasBox.parentElement?.children.length !== 3) {
      canvasBox = canvasBox.parentElement;
    }
    const row = canvasBox?.parentElement;
    if (!row || row.children.length !== 3) return null;
    const el = which === "left" ? row.children[0] : row.children[2];
    const r = el.getBoundingClientRect();
    if (r.width < 40) return null;
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, side);
  if (!box) throw new Error(`could not locate the ${side} rail`);
  return box;
}

async function shootRail(page, side, file) {
  const box = await railBox(page, side);
  await page.screenshot({ path: join(OUT, file), clip: clipFor(box, 0) });
}

/** Opens the top-bar More menu and clicks one of its items. */
async function openFromMoreMenu(page, testId) {
  await page.getByTestId("topbar-more-button").click();
  await page.getByTestId(testId).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByTestId(testId).click();
  await page.waitForTimeout(1500);
}

/** Clicks a node card so its settings panel opens on the right. */
async function selectNode(page, nodeId) {
  await page.locator(`[data-testid="canvas-node-${nodeId}"]`).first().click();
  await page.waitForTimeout(1200);
}

// ── shots ───────────────────────────────────────────────────────────────────
//
// Each entry is keyed by the CHECKLIST.md item id. The file name carries the
// id so a before/after pair is matched by name, not by order.

const SHOTS = {
  /**
   * I1 — "the assistant isn't configured on this server".
   *
   * ## This frame is INTERCEPTED, and the manifest says so
   *
   * The state is real code on a real page, but it is reachable only on a
   * backend with **no** model provider credentials at all, and this dev stack
   * has Azure OpenAI configured — so `GET /api/agent/models` answers with a
   * model and the drawer is correctly in its `ready` state. The route is
   * therefore fulfilled with the body an unconfigured backend really sends:
   * an empty `items` list plus the `missingConfig` table naming the
   * environment variables (NAMES only — the backend never puts a value in
   * that response, and neither does this).
   *
   * Nothing else is stubbed: the drawer, the notice, the disabled send and
   * its tooltip wrapper are the shipped components rendering that body.
   *
   * There is no "before" for this: before the fix an empty list rendered as
   * the label "Server default model" with a live composer, and that build no
   * longer exists in the tree to photograph.
   */
  I1: async (browser) => {
    const page = await newPage(browser);
    // Registered AFTER newPage's `**/api/**` pass-through: Playwright runs
    // route handlers most-recently-registered first, so this one wins for
    // this URL and everything else still reaches the real backend.
    await page.route("**/api/agent/models", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          missingConfig: [
            {
              provider: "azure",
              variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
            },
            { provider: "openai", variables: ["OPENAI_API_KEY"] },
          ],
        }),
      }),
    );
    await openAgentChat(page);
    await page.waitForSelector('[data-testid="agent-chat-unconfigured"]', {
      timeout: 15000,
    });
    await page.waitForTimeout(800);
    const column = await page.locator(".mantine-Drawer-content").boundingBox();
    await page.screenshot({
      path: join(OUT, "I1-assistant-unconfigured.png"),
      clip: clipFor(column, 0),
    });
    await page.close();
  },

  /**
   * D11 — the restore toast, which now names the version restore CREATED.
   *
   * ## Why this runs against a scratch lineage
   *
   * Restoring writes: it appends the old config as a new version and moves
   * the head. Doing that to `demo-versioning-history-revert-part-12` would
   * leave the seeded demo on a v3 nobody seeded, so instead the script
   * builds its own lineage from a copy of the `probe-clean-failure` config,
   * saves once to reach v2, restores v1 through the real UI — and deletes
   * the lineage again in a `finally`. No seeded row is read or written, and
   * the workflow list is back to its seeded count before the process exits.
   *
   * The toast is the app's own notification: the version numbers in it come
   * from the backend's response to a real `revert-head` call.
   */
  D11: async (browser) => {
    // `by-slug` answers `{ workflow }`; the create endpoint wants the config
    // itself.
    const { workflow: source } = await api(
      "/api/workflows/by-slug/probe-clean-failure",
    );
    const created = await api("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: "🧪 Scratch — restore probe (deleted by capture-screenshots.mjs)",
        description:
          "Temporary lineage for the D11 restore frame. Created and deleted by the screenshot script.",
        config: source.config,
        groupId: "seeddefaultgroup",
      }),
    });
    const workflow = created.workflow;
    let page = null;
    try {
      // A second save, so the lineage has a v1 to restore and a v2 to be on.
      // The config has to actually DIFFER: a save whose config hashes to the
      // same value does not mint a version, which is why an identical body
      // left the lineage on v1 with its only row disabled ("already the
      // head"). Renaming one node is the smallest honest change.
      const edited = JSON.parse(JSON.stringify(source.config));
      const firstNodeId = Object.keys(edited.nodes)[0];
      edited.nodes[firstNodeId].label =
        `${edited.nodes[firstNodeId].label} (v2 — edited)`;
      const saved = await api(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        body: JSON.stringify({
          description: "Second version, so v1 is something to restore.",
          config: edited,
          expectedVersion: workflow.version,
        }),
      });
      if (saved.workflow.version !== 2) {
        throw new Error(
          `expected the scratch lineage to be on v2, got v${saved.workflow.version}`,
        );
      }
      page = await newPage(browser);
      await openEditor(page, workflow.slug);
      await openFromMoreMenu(page, "topbar-menu-history");
      await page.waitForSelector('[data-testid="history-drawer-list"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(700);
      // The LAST row is v1 — the head's own row has no restore to offer.
      await page.locator('[data-testid^="history-row-revert-"]').last().click();
      await page.getByTestId("revert-confirm-button").waitFor({ timeout: 10000 });
      await page.getByTestId("revert-confirm-button").click();
      const toast = page.locator(".mantine-Notification-root").first();
      await toast.waitFor({ timeout: 30000 });
      await page.waitForTimeout(1200);
      const text = await toast.innerText();
      if (!/Restored v\d+ as v\d+/.test(text)) {
        throw new Error(`the toast did not name a new version: ${text}`);
      }
      process.stdout.write(`[${text.split("\n")[0]}] `);
      await shootElement(page, ".mantine-Notification-root", "D11-restore-toast.png", 14);
    } finally {
      if (page) await page.close();
      await api(`/api/workflows/${workflow.id}`, { method: "DELETE" });
    }
  },

  /**
   * I3 — the composer footer strip (attach / model / send).
   *
   * Inderdeep's mock-up moves the attach `+` to the far left, puts the model
   * name and its tier inline next to it, and leaves send at the right; the
   * frame is cropped to the composer alone because the item is about that
   * strip's layout, not about the thread above it.
   */
  I3: async (browser) => {
    const page = await newPage(browser);
    await openAgentChat(page);
    await shootElement(page, '[data-testid="agent-chat-composer"]', "I3-chat-composer-footer.png", 10);
    await page.close();
  },

  /**
   * I2 — send versus stop while a reply is in flight.
   *
   * Two frames of the WHOLE drawer column, not of the composer alone, because
   * the claim under review is about WHERE the stop control is: *"the stop
   * icon is still at the top."* A crop of the composer could not show the
   * header it is being compared against.
   *
   *   I2-composer-idle.png     — nothing sent; the primary action is a send
   *                              arrow, and the drawer header carries its
   *                              three controls (history, new, close).
   *   I2-composer-in-flight.png — a turn in flight.
   *
   * ## Why the request is held open
   *
   * The agent errors immediately in this environment — the same symptom as
   * I1, and the drawer renders "The agent could not complete this request"
   * within about a tenth of a second. The in-flight state is therefore real
   * but unphotographable: `waitForSelector` catches the stop control and it
   * has already gone by the next call.
   *
   * So the POST to `/api/agent/chat` is delayed on the way OUT, not faked on
   * the way back. Nothing about the response is invented: the same request
   * reaches the same backend and fails the same way a moment later. What the
   * frame shows is the app's own `isRunning` rendering, held still long
   * enough to photograph. Both phases of this script do it identically, so
   * the before/after pair differs only by the fix.
   */
  I2: async (browser) => {
    const page = await newPage(browser);
    await page.route("**/api/agent/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 9000));
      await route.continue();
    });
    await openAgentChat(page);
    const column = await page.locator(".mantine-Drawer-content").boundingBox();
    await page.screenshot({
      path: join(OUT, "I2-composer-idle.png"),
      clip: clipFor(column, 0),
    });
    await page.getByTestId("agent-chat-textarea").fill(
      "List the activity types available in this workflow catalog.",
    );
    await page.getByTestId("agent-chat-send").click();
    await page.waitForSelector('[data-testid="agent-chat-stop"]', {
      timeout: 30000,
    });
    // Park the cursor off the drawer: the stop button carries a "Stop this
    // response" tooltip that otherwise sits across the composer it is meant
    // to be photographed in.
    await page.mouse.move(20, VIEWPORT.height - 20);
    await page.waitForTimeout(900);
    if ((await page.locator('[data-testid="agent-chat-stop"]').count()) === 0) {
      throw new Error("the turn ended before the in-flight frame was taken");
    }
    await page.screenshot({
      path: join(OUT, "I2-composer-in-flight.png"),
      clip: clipFor(column, 0),
    });
    await page.close();
  },

  /**
   * I4 — the node failure chip's icon/text alignment.
   *
   * `NodeFailureChip` renders only for a node whose status is `failed` during
   * a live run, so the frame is taken from a real failing run of the seeded
   * `probe-clean-failure` workflow (a `file.prepare` pointed at a blob that
   * does not exist). Zoomed hard, because the chip is ~16px tall and an
   * alignment complaint is unreadable at canvas scale.
   */
  I4: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "probe-clean-failure");
    await runViaTry(page, { expect: "failed" });
    const chip = '[data-testid^="node-failure-chip-"]';
    await page.waitForSelector(chip, { timeout: 20000 });
    await centreInCanvas(page, chip);
    await zoomOnto(page, chip, 420);
    const zoom = await canvasZoom(page);
    process.stdout.write(`[canvas at ${zoom.toFixed(2)}x] `);
    await shootElement(page, chip, "I4-node-error-chip.png", 26);
    await page.close();
  },

  /**
   * I5 — the failed-step notice and its red "Re-run workflow" button.
   *
   * Same failing run as I4; the notice is the node card's preview widget once
   * the step has failed. Frame is the notice alone plus a little card around
   * it, so the red filled button and the alert's own red are both in shot.
   */
  I5: async (browser) => {
    const page = await newPage(browser);
    // A DIFFERENT failing workflow from I4's, and the difference is the point:
    // `NoOutputNotice` is a preview surface, so it renders only for a step
    // that DECLARES an output — `probe-clean-failure`'s nodes declare none, so
    // its failed step draws "this step doesn't produce a previewable output"
    // instead of the error card. Part 7's `prep` declares `preparedData`, and
    // fails the same way on an empty ctx.
    await openEditor(page, "demo-typed-i-o-coloured-handles-type-pills-part-7");
    await runViaTry(page, { expect: "failed" });
    // The notice lives in the result strip's EXPANDED detail, not on the card
    // face: the card carries a fixed-height one-line band ("Not run yet",
    // "Failed"), and opening it is what renders `NoOutputNotice`. So the shot
    // has to click the strip on the failed node, exactly as a person does.
    const card = '[data-testid="canvas-node-prep"]';
    await centreInCanvas(page, card);
    await zoomOnto(page, card, 520);
    await page.locator('[data-testid="node-result-strip-prep"]').click();
    const notice = '[data-testid="no-output-failed"]';
    await page.waitForSelector(notice, { timeout: 20000 });
    await page.waitForTimeout(900);
    const zoom = await canvasZoom(page);
    process.stdout.write(`[canvas at ${zoom.toFixed(2)}x] `);
    await shootElement(page, notice, "I5-no-output-error-card.png", 18);
    await page.close();
  },

  /**
   * D12 — the dynamic-nodes empty state's doubled plus.
   *
   * Before the fix the button carried `IconPlus` as its `leftSection` AND a
   * literal "+" at the head of the label, so it read "+ + Create your first".
   *
   * ## Two honesty caveats, both repeated in the manifest
   *
   * **(1) The empty state is INTERCEPTED into existence.** It renders only
   * when the calling group owns no custom node, and this database's one group
   * owns `demo-uppercase`, which the Part 14 demo depends on. Deleting it to
   * take a screenshot is not on. So `GET /api/dynamic-nodes` is fulfilled
   * with `{"items": []}` — the exact body the endpoint returns for a group
   * with none — and the page renders its own empty state from it. Nothing
   * about the button, its label or its icon is stubbed, and no row is
   * touched: the interception lives in the browser context and dies with it.
   *
   * **(2) The `--phase before` frame is a RECONSTRUCTION.** The fix is in the
   * working tree and `git stash` is not available here (the tree is shared
   * with other agents), so the pre-fix label cannot be rendered by checking
   * it out. Instead the shipped button is photographed with its label text
   * set back to the pre-fix string — the same `<Button>`, the same
   * `leftSection` icon, the same theme and metrics, with the one string the
   * diff changed put back:
   *
   *     -              + Create your first
   *     +              Create your first custom node
   *
   * That is a faithful render of the old markup and nothing else about it is
   * real, which is why the manifest labels it a reconstruction rather than a
   * before-shot.
   */
  D12: async (browser) => {
    const page = await newPage(browser);
    await page.route("**/api/dynamic-nodes", async (route, request) => {
      if (request.method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
    });
    await page.goto(`${FRONTEND}/dynamic-nodes`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector('[data-testid="dynamic-nodes-list-empty"]', {
      timeout: 20000,
    });
    await page.waitForTimeout(1200);
    if (PHASE === "before") {
      // The reconstruction, and the ONLY thing it changes: the label string
      // the diff replaced. Asserted first, so this can never silently
      // "reconstruct" a build that already has the old text.
      const label = page.locator(
        '[data-testid="dynamic-nodes-list-empty-cta"] .mantine-Button-label',
      );
      const shipped = (await label.innerText()).trim();
      if (shipped !== "Create your first custom node") {
        throw new Error(
          `expected the fixed label to reconstruct from, found: ${shipped}`,
        );
      }
      await label.evaluate((el) => {
        el.textContent = "+ Create your first";
      });
      await page.waitForTimeout(300);
    }
    await shootElement(
      page,
      '[data-testid="dynamic-nodes-list-empty"] .mantine-Card-root',
      "D12-empty-state-cta.png",
      10,
    );
    await page.close();
  },

  /**
   * D13 — Simplified view off, then on.
   *
   * Two frames of the SAME graph at the same fit-view zoom, so the only
   * difference between them is what the toggle did. The demo built for the
   * feature is the subject, because it is the one whose grouping the
   * simplified projection is supposed to collapse.
   */
  D13: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "demo-grouping-simplified-view-node-swap-part-6");
    const pane = await page.locator(".react-flow").boundingBox();
    await page.locator(".react-flow__controls-fitview").click();
    await page.waitForTimeout(1500);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "D13-simplified-off.png"), clip: pane });
    // `simplified-view-toggle` is on the Mantine Switch's visually-hidden
    // <input> — off-viewport, so neither `click` nor `check` reaches it. The
    // track is the thing a person actually clicks.
    await page
      .locator('[data-testid="topbar-menu-simplified-view"] .mantine-Switch-track')
      .click();
    // `attached`, not the default `visible`: the input this asserts on is the
    // hidden one, so a visibility wait can never resolve.
    await page.waitForSelector('[data-testid="simplified-view-toggle"]:checked', {
      state: "attached",
      timeout: 10000,
    });
    await page.waitForTimeout(3000);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "D13-simplified-on.png"), clip: pane });

    // ── the two frames the before pass does not have ──────────────────────
    //
    // The off/on pair above cannot show this fix and never could: what the
    // toggle broke was not the simplified projection but the workflow behind
    // it — flipping the switch re-ran the server-hydration effect, which
    // replaced the measured layout with the loose pre-mount fallback and
    // discarded an unsaved rename. Both of those are only visible on the way
    // BACK, so the before pass (which stopped at "on") has no counterpart to
    // either frame. Said so in the manifest rather than cropped away.
    await page
      .locator('[data-testid="topbar-menu-simplified-view"] .mantine-Switch-track')
      .click();
    await page.waitForSelector('[data-testid="simplified-view-toggle"]:checked', {
      state: "detached",
      timeout: 10000,
    });
    await page.waitForTimeout(3000);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: join(OUT, "D13-simplified-off-again.png"),
      clip: pane,
    });

    // An unsaved rename, then a full round trip of the toggle. Nothing is
    // saved: the edit lives in canvas state and dies with the context.
    const title = page.locator('[data-testid="workflow-title"]');
    await title.click();
    const input = page.locator('[data-testid="workflow-title-input"]');
    await input.waitFor({ timeout: 10000 });
    await input.fill("🎯 Demo — renamed but not saved");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    for (const state of ["attached", "detached"]) {
      await page
        .locator('[data-testid="topbar-menu-simplified-view"] .mantine-Switch-track')
        .click();
      await page.waitForSelector('[data-testid="simplified-view-toggle"]:checked', {
        state,
        timeout: 10000,
      });
      await page.waitForTimeout(2000);
    }
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(800);
    const shown = await page.locator('[data-testid="workflow-title"]').innerText();
    process.stdout.write(`[title after round trip: ${shown.trim()}] `);
    await shootUnion(
      page,
      ['[data-testid="workflow-title"]', '[data-testid="topbar-menu-simplified-view"]'],
      "D13-unsaved-rename-survives.png",
      { left: 12, right: 12, up: 14, down: 14 },
    );
    await page.close();
  },

  /**
   * D22 / D23 — the condition editor: the Ref list and the operator list.
   *
   * Both come from the SAME panel Dylan photographed
   * (`source/dylan-ref-picker-operators.png`): the standard workflow's Poll
   * OCR Results node, whose termination condition is a comparison. D22 is
   * that the Ref rows do not read as "previous steps and their outputs";
   * D23 is that the operator list is developer shorthand (`not-equals`,
   * `gte`). D22's frame runs from "Expression type" down through the Ref
   * rows, which is his crop; D23's is the operator select with its dropdown
   * open, so the shorthand is legible rather than implied.
   */
  D22: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    const base = await openConditionEditor(page, "pollOcrResults");
    await shootUnion(
      page,
      [`[data-testid="${base}-kind"]`, '[data-testid="condition-producer-picker"]'],
      "D22-ref-picker.png",
      { left: 16, right: 16, up: 34, down: 34 },
    );
    await page.close();
  },

  D23: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    const base = await openConditionEditor(page, "pollOcrResults");
    await page.getByTestId(`${base}-comparison-op`).click();
    await page.waitForTimeout(900);
    const dropdown = page.locator('[role="listbox"]:visible').first();
    await dropdown.waitFor({ timeout: 8000 });
    await shootUnion(
      page,
      [`[data-testid="${base}-comparison-op"]`, '[role="listbox"]:visible'],
      "D23-operator-dropdown.png",
      16,
    );
    await page.close();
  },

  /**
   * D26 — where the custom-step editor puts its green validation tick.
   *
   * Dylan: *"Instructions make it sound like the green tick should be on the
   * right, but it's below."* The frame is the code pane plus the strip under
   * it, so the tick's position relative to the editor is what is in shot.
   */
  D26: async (browser) => {
    const page = await newPage(browser);
    // `/dynamic-nodes/new` rather than an existing node: GALLERY step 14 —
    // the step Dylan was on — starts on the blank editor, and this
    // environment's `GET /api/dynamic-nodes` is 500ing (a stale generated
    // Prisma client: `DynamicNodeRepository.listForGroup` calls `findMany`
    // on an undefined delegate), so the list page cannot offer a row to open.
    await page.goto(`${FRONTEND}/dynamic-nodes/new`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector('[data-testid="code-pane"]', { timeout: 25000 });
    await page.waitForTimeout(3000);
    await shootElement(page, '[data-testid="code-pane"]', "D26-validation-tick-position.png", 16);
    await page.close();
  },

  /**
   * D28 — run-order connectors at differing heights and sizes.
   *
   * Dylan's example is the Poll OCR Results / Extract OCR Results pair in the
   * standard workflow. The frame is a canvas region rather than one card,
   * because the item is about the connectors DISAGREEING with each other, and
   * a crop of a single card cannot show a disagreement.
   */
  D28: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    const pair = [
      '[data-testid="canvas-node-pollOcrResults"]',
      '[data-testid="canvas-node-extractResults"]',
    ];
    await centreInCanvas(page, pair);
    await zoomOnto(page, pair, 680);
    // Re-centre AFTER the zoom: xyflow zooms toward the cursor, which leaves
    // the pair drifted toward one edge, and a crop taken there runs off the
    // pane and into the palette — which is how the first attempt at this
    // frame lost the left-hand card.
    await centreInCanvas(page, pair);
    const zoom = await canvasZoom(page);
    process.stdout.write(`[canvas at ${zoom.toFixed(2)}x] `);
    const pane = await page.locator(".react-flow").boundingBox();
    const band = await subjectBox(page, pair);
    if (band.x < pane.x || band.x + band.width > pane.x + pane.width) {
      throw new Error("the pair is not wholly inside the graph pane — the crop would clip a card");
    }
    await shootUnion(page, pair, "D28-run-order-connectors.png", 60);
    await page.close();
  },

  /**
   * D29 — the CARD BORDERS group of the canvas legend.
   *
   * Whole popover, not just the group: *"what's a 'Judgement about a
   * document'?"* is a question about one row's wording, and the row only
   * reads oddly next to the rows it is grouped with.
   */
  D29: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    await page.getByTestId("canvas-legend-button").click();
    await page.waitForSelector('[data-testid="canvas-legend"]', { timeout: 10000 });
    await page.waitForTimeout(700);
    await shootElement(page, '[data-testid="canvas-legend"]', "D29-card-borders-legend.png", 10);
    await page.close();
  },

  /**
   * D30 — Poll OCR Results' field stack next to Extract OCR Results'.
   *
   * Two frames of the two settings panels at the same width, because the item
   * is a comparison — *"why does Poll OCR Results have so many more fields?"*
   * — and one panel on its own answers nothing.
   */
  D30: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    await selectNode(page, "pollOcrResults");
    await shootRail(page, "right", "D30-poll-ocr-fields.png");
    await selectNode(page, "extractResults");
    await shootRail(page, "right", "D30-extract-ocr-fields.png");
    await page.close();
  },

  /**
   * D31 — Compare to Head, which prints both versions in full.
   *
   * Full window: the finding is that the modal is two JSON dumps side by side
   * with nothing marking what changed, and a crop to one column would hide
   * exactly that.
   */
  D31: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "demo-versioning-history-revert-part-12");
    await openFromMoreMenu(page, "topbar-menu-history");
    await page.waitForSelector('[data-testid="history-drawer-list"]', { timeout: 20000 });
    await page.waitForTimeout(700);
    // The LAST row, not the first: "Compare to Head" is disabled on the head
    // row itself (comparing head to head has nothing to show), so the first
    // row's button never accepts a click.
    const compare = page.locator('[data-testid^="history-row-compare-"]').last();
    await compare.click();
    // `compare-to-head-modal` is on Mantine's Modal ROOT, a zero-size wrapper
    // that never becomes "visible" and has no rectangle to crop; the panel is
    // `.mantine-Modal-content`. Both are asserted: the testid says the right
    // modal opened, the content element is what gets photographed.
    await page.locator('[data-testid="compare-to-head-modal"]').waitFor({
      state: "attached",
      timeout: 20000,
    });
    await page.locator(".mantine-Modal-content").waitFor({ timeout: 20000 });
    // AFTER the fix the modal opens on a **Changes** tab, so the frame is of
    // the diff rather than of the two JSON columns — the columns are still
    // there under "Both versions in full", but photographing them would hide
    // the whole of what changed. Before the fix there was no tab strip at
    // all and `compare-left-json` was the only thing to wait for; whichever
    // exists is what this waits on, so one script serves both phases.
    const diff = page.locator('[data-testid="config-diff"]');
    const rawJson = page.locator('[data-testid="compare-left-json"]');
    await Promise.race([
      diff.waitFor({ timeout: 25000 }).catch(() => {}),
      rawJson.waitFor({ timeout: 25000 }).catch(() => {}),
    ]);
    if ((await diff.count()) > 0) {
      await diff.waitFor({ timeout: 25000 });
      process.stdout.write("[Changes tab] ");
    } else {
      await rawJson.waitFor({ timeout: 25000 });
      process.stdout.write("[side-by-side JSON] ");
    }
    await page.waitForTimeout(1500);
    await shootElement(page, ".mantine-Modal-content", "D31-compare-to-head.png", 0);
    await page.close();
  },

  /**
   * D32 — the sidebar node list, which does not use the legend's colours.
   *
   * The palette rail full height, so the run of uniformly-coloured rows is
   * what the frame shows — that is the whole of Dylan's suggestion.
   */
  D32: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, "standard-ocr");
    await shootRail(page, "left", "D32-sidebar-node-list.png");
    await page.close();
  },

  /**
   * D33 — the workflows list, which has no search field.
   *
   * Full window rather than the table: the absence of a control is a claim
   * about the whole page, and a crop of the table cannot make it.
   */
  D33: async (browser) => {
    const page = await newPage(browser);
    await page.goto(`${FRONTEND}/workflows`, {
      waitUntil: "networkidle",
      timeout: 45000,
    });
    await page.waitForSelector('[data-testid="workflow-name-link"]', { timeout: 25000 });
    await page.waitForTimeout(1200);
    // Same file name in both phases so the pair matches by name; the name
    // describes the BEFORE state, and the after frame at it is the same
    // window with the field that was missing.
    await page.screenshot({ path: join(OUT, "D33-workflow-list-no-search.png") });
    // A second frame the before phase cannot have: the field in use. Only
    // taken where the field exists, so `--phase before` on an old build
    // still completes instead of failing on a control that is not there.
    const search = page.locator('[data-testid="workflow-search"] input');
    if ((await search.count()) === 0) {
      process.stdout.write("[no search field on this build] ");
      await page.close();
      return;
    }
    await search.click();
    // Typed a character at a time, because the caption counts what the
    // filter matched and a `fill` would not exercise the filter at all.
    await search.pressSequentially("ocr", { delay: 90 });
    await page.waitForTimeout(1200);
    const caption = page.locator("table caption").first();
    await caption.waitFor({ timeout: 10000 });
    process.stdout.write(`[${(await caption.innerText()).trim()}] `);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, "D33-search-in-use.png") });
    await page.close();
  },
};

/**
 * Selects the graph's switch/condition node and returns the testId base of
 * its condition editor, so the caller can reach the operator dropdown.
 */
/**
 * Selects a node carrying a condition editor and returns that editor's testId
 * base, so the caller can address the operator select and the Ref rows without
 * hard-coding which settings component (`switch-…`, `poll-until-…`) rendered
 * it.
 */
async function openConditionEditor(page, nodeId) {
  await page.locator(`[data-testid="canvas-node-${nodeId}"]`).first().click();
  await page.waitForTimeout(2000);
  const editor = page.locator('[data-testid$="-condition-comparison-op"]').first();
  await editor.waitFor({ timeout: 15000 });
  const testId = await editor.getAttribute("data-testid");
  return testId.replace(/-comparison-op$/, "");
}

// ── runner ──────────────────────────────────────────────────────────────────
const ids = requested.length > 0 ? requested : Object.keys(SHOTS);

const browser = await chromium.launch({ headless: true });
const failures = [];
console.log(`  phase: ${PHASE} → ${OUT}`);
try {
  for (const id of ids) {
    const shot = SHOTS[id];
    if (!shot) {
      console.log(`  ? no shot ${id}`);
      continue;
    }
    process.stdout.write(`  shooting ${id} … `);
    // Two attempts: the dev stack this shoots against is a watcher, and an
    // edit anywhere under `apps/` restarts nest or vite mid-shot, so a
    // half-loaded page is a property of the environment rather than of the
    // thing being photographed.
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await shot(browser);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          process.stdout.write(`retry … `);
          await new Promise((r) => setTimeout(r, 8000));
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
