/**
 * Photographs the workflow builder's RUN-TIME surfaces, against the real runs
 * `npm run seed:demo-runs` leaves behind.
 *
 *   npm run dev                  # frontend :3000, backend :3002, worker, deno-runner
 *   npm run seed:demos           # the demo workflows (only if they are missing)
 *   npm run seed:demo-runs       # the runs these shots are of
 *   node feature-docs/20260809-run-replay-demo/capture-screenshots.mjs
 *
 * Optional: pass shot ids to re-take only those.
 *
 *   node …/capture-screenshots.mjs 6 13
 *
 * Modelled on `feature-docs/20260806-inderdeep-ux-review-batch-four/
 * capture-screenshots.mjs` — same viewport, same auth interception, same
 * pan/zoom/crop helpers, same rule that **every shot asserts before it
 * saves**. The assertions here are mostly about run state (a badge's
 * `data-status`, an edge's computed stroke, the banner's version pin, the
 * peeked value), read out of the DOM and refused if they do not match what
 * the caption in ILLUSTRATED.md claims.
 *
 * TIME-SENSITIVE: shot 6 needs a genuinely in-flight run, and a graph run
 * started through `POST /:id/runs` carries a hard
 * `workflowExecutionTimeout: "30 minutes"` (temporal-client.service.ts) — so
 * the human gate the seeder parks dies half an hour after it is parked. Run
 * `npm run seed:demo-runs` immediately before this script if shot 6 fails
 * with "no run is currently running".
 *
 * The API key is the seeded dev default, read from the environment or from
 * `apps/backend-services/.env` or from playwright.config.ts's fallback, and
 * never printed.
 */

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const OUT = join(HERE, "screenshots");
mkdirSync(OUT, { recursive: true });

const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");

const FRONTEND = "http://localhost:3000";
const BACKEND = "http://localhost:3002";
const VIEWPORT = { width: 1920, height: 1080 };

/** Slugs of the four demos the run seeder executes against. */
const SLUG = {
  tryPreview: "demo-try-in-place-run-a-workflow-see-previews-part-9",
  branchError: "demo-run-states-a-taken-branch-and-a-taken-error-path-part-9",
  humanGate: "demo-run-states-a-run-waiting-on-a-person-part-9",
  replayVersions: "demo-run-states-replay-against-an-older-version-part-12",
};

/**
 * The taken-path stroke (`TAKEN_STROKE` in `canvas/WorkflowEdge.tsx`) and the
 * live-hop stroke (`ACTIVE_STROKE`), as Chromium reports them. Several shots
 * turn on "this edge is drawn as taken and that one is not", which is a claim
 * about a colour and so is checked as one.
 */
const TAKEN_STROKE = "rgb(193, 221, 252)";
const ACTIVE_STROKE = "rgb(85, 149, 217)";

// ---------------------------------------------------------------------------
// API side — picking WHICH run each shot replays.
//
// Run ids are Temporal execution ids minted fresh on every seed, so nothing
// here can be hard-coded. Each shot instead states the run STATE it needs
// ("the one whose `prep` is `skipped` with a cacheHit") and this half finds
// the newest run that matches. A shot whose run does not exist fails loudly
// with what to re-run, rather than photographing a different run's canvas.
// ---------------------------------------------------------------------------

function candidateKeys() {
  const shellKey = process.env.TEST_API_KEY;
  const backendEnv = resolve(REPO, "apps/backend-services/.env");
  try {
    if (existsSync(backendEnv)) process.loadEnvFile(backendEnv);
  } catch {
    // Older Node, or unreadable — fall through to the other sources.
  }
  const config = readFileSync(join(REPO, "playwright.config.ts"), "utf8");
  const fallback = /process\.env\.TEST_API_KEY = '([^']+)'/.exec(config)?.[1];
  return [
    ...new Set([shellKey, process.env.TEST_API_KEY, fallback].filter(Boolean)),
  ];
}

/** Resolved once in `main`. Never logged — not in an error message either. */
let API_KEY = "";

async function resolveApiKey() {
  for (const candidate of candidateKeys()) {
    const res = await fetch(`${BACKEND}/api/workflows?limit=1`, {
      headers: { "x-api-key": candidate },
    }).catch(() => null);
    if (res && res.status !== 401 && res.status !== 403) return candidate;
  }
  throw new Error(
    "the backend accepted none of the candidate API keys — is it up on :3002?",
  );
}

async function api(path) {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { "x-api-key": API_KEY },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const workflowCache = new Map();

/** The lineage row for a demo slug, by name — the API has no by-slug read. */
async function workflowBySlug(slug) {
  if (workflowCache.has(slug)) return workflowCache.get(slug);
  const list = await api("/api/workflows?limit=200");
  const items = Array.isArray(list)
    ? list
    : (list.workflows ?? list.data ?? list.items ?? []);
  for (const w of items) if (w.slug) workflowCache.set(w.slug, w);
  const found = workflowCache.get(slug);
  if (!found) {
    throw new Error(
      `no workflow with slug "${slug}" — run \`npm run seed:demos\` then \`npm run seed:demo-runs\``,
    );
  }
  return found;
}

/**
 * Newest run of `slug` whose (row, node-status map) pair satisfies `matches`.
 *
 * Returns `{ workflow, run, nodes }`. `describe` is only used to name the
 * state in the failure message, so a broken shot says "no run with a
 * cache-hit `prep`" rather than "undefined".
 */
async function pickRun(slug, describe, matches) {
  const workflow = await workflowBySlug(slug);
  const { runs } = await api(`/api/workflows/${workflow.id}/runs?limit=50`);
  for (const run of runs) {
    let nodes;
    try {
      nodes = await api(
        `/api/workflows/${workflow.id}/runs/${run.runId}/node-statuses`,
      );
    } catch {
      continue; // history gone (retention) — not a candidate
    }
    if (matches(run, nodes)) return { workflow, run, nodes };
  }
  throw new Error(
    `no run on "${slug}" matching: ${describe} — re-run \`npm run seed:demo-runs\``,
  );
}

// ---------------------------------------------------------------------------
// Browser side — lifted from the batch-four capture script.
// ---------------------------------------------------------------------------

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
  await page.waitForTimeout(2500);
}

/** Opens the run-history drawer from the top bar's More menu. */
async function openRunHistory(page) {
  await page.getByTestId("topbar-more-button").click();
  await page.getByTestId("topbar-menu-run-history").click();
  await page.waitForSelector('[data-testid="run-history-drawer-list"]', {
    timeout: 25000,
  });
  await page.waitForTimeout(900);
}

/**
 * Clicks one named run's row, which is the whole gesture (per `RunRow`'s
 * `onClick`), and waits for the replay banner to mount.
 *
 * Addressed by run id rather than by position: "the newest row" changes
 * meaning every time the seeder runs, and every shot here is about a
 * particular run's particular state.
 */
async function replayRun(page, runId) {
  await page.locator(`[data-testid="run-row-${runId}"]`).first().click();
  await page.waitForSelector('[data-testid="replay-mode-indicator"]', {
    timeout: 20000,
  });
  // The status map, the taken-edge projection and the preview batch all land
  // asynchronously after the banner; give them a beat before asserting.
  await page.waitForTimeout(3000);
}

/** Every node's badge status, keyed by node id. Absent nodes render `pending`. */
async function badgeStatuses(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [
        ...document.querySelectorAll(
          '[data-testid^="node-status-badge-wrapper-"]',
        ),
      ].map((el) => [
        el.getAttribute("data-testid").replace("node-status-badge-wrapper-", ""),
        el.querySelector("[data-status]")?.getAttribute("data-status") ?? null,
      ]),
    ),
  );
}

/** One edge's computed stroke colour and width. */
async function edgeStroke(page, edgeId) {
  return page.evaluate((id) => {
    const path = document.querySelector(
      `.react-flow__edge[data-id="${id}"] .react-flow__edge-path`,
    );
    if (!path) return null;
    const style = getComputedStyle(path);
    return { stroke: style.stroke, width: style.strokeWidth };
  }, edgeId);
}

/** Refuses the frame unless every node's badge reads what the caption claims. */
async function assertBadges(page, expected) {
  const actual = await badgeStatuses(page);
  for (const [node, status] of Object.entries(expected)) {
    if (actual[node] !== status) {
      throw new Error(
        `node "${node}" badge reads ${actual[node]}, expected ${status} ` +
          `(all: ${JSON.stringify(actual)})`,
      );
    }
  }
  return actual;
}

/** Refuses the frame unless `edgeId` is / is not drawn as the taken path. */
async function assertTaken(page, edgeId, taken) {
  const style = await edgeStroke(page, edgeId);
  if (!style) throw new Error(`no edge "${edgeId}" on the canvas`);
  const isTaken = style.stroke === TAKEN_STROKE;
  if (isTaken !== taken) {
    throw new Error(
      `edge "${edgeId}" is drawn ${isTaken ? "" : "NOT "}taken ` +
        `(stroke ${style.stroke}, width ${style.width}) — expected the opposite`,
    );
  }
  return style;
}

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

/** Pans the canvas until `subject` sits in the middle of the graph pane. */
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

/** The canvas's current zoom, read off xyflow's own viewport transform. */
async function canvasZoom(page) {
  return page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    if (!viewport) return 0;
    return new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a;
  });
}

/**
 * Zooms in on the whole graph until one more step would push a card outside
 * the pane, then stops — and refuses to go on below `minZoom`.
 *
 * The floor is the point of it. A status badge is a 20px disc; at fit-view on
 * these little graphs the canvas can sit near 0.5x, where the disc is 10px and
 * the glyph inside it is 7px, and a frame in which the reader cannot tell a
 * check from a cross does not show what the caption says it shows.
 */
async function zoomToFitGraph(page, minZoom = 0.75) {
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node")]
      .map((el) => el.getAttribute("data-id"))
      .filter((id) => id && !id.startsWith("container-")),
  );
  const selectors = cards.map((id) => `[data-testid="canvas-node-${id}"]`);
  await page.locator(".react-flow__controls-fitview").click();
  await page.waitForTimeout(900);
  for (let i = 0; i < 10; i++) {
    await page.locator(".react-flow__controls-zoomin").click();
    await page.waitForTimeout(400);
    await centreInCanvas(page, selectors);
    const box = await subjectBox(page, selectors);
    const pane = await page.locator(".react-flow").boundingBox();
    if (!box || box.width > pane.width - 40 || box.height > pane.height - 40) {
      await page.locator(".react-flow__controls-zoomout").click();
      await page.waitForTimeout(400);
      break;
    }
  }
  await centreInCanvas(page, selectors);
  const zoom = await canvasZoom(page);
  if (zoom < minZoom) {
    throw new Error(
      `canvas is at ${zoom.toFixed(2)}x — a 20px status badge would be ` +
        `${Math.round(20 * zoom)}px and the glyph inside it undecidable`,
    );
  }
  await page.mouse.move(4, VIEWPORT.height - 4);
  await page.waitForTimeout(800);
  process.stdout.write(`[canvas at ${zoom.toFixed(2)}x] `);
  return { selectors, zoom };
}

/**
 * Zooms in on `subject` until it is at least `minWidth` wide, wheeling with
 * the cursor over it so xyflow zooms toward it rather than away.
 *
 * Needed by the two branch shots. Their graph is six cards wide and only fits
 * the pane near 0.6x, where a 20px status badge is 12px — enough to see a
 * colour, not enough to decide a glyph. So each of those shots takes the wide
 * frame for the shape of the run AND a close frame for the badges.
 */
async function zoomOnto(page, subject, minWidth = 700, maxSteps = 14) {
  for (let i = 0; i < maxSteps; i++) {
    const box = await subjectBox(page, subject);
    if (!box) return;
    if (box.width >= minWidth) break;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(220);
  }
  await page.mouse.move(4, VIEWPORT.height - 4);
  await page.waitForTimeout(700);
}

/** Full pane width, cropped vertically to the band the graph occupies. */
async function shootGraphBand(page, selectors, file, pad = 46) {
  const band = await subjectBox(page, selectors);
  const pane = await page.locator(".react-flow").boundingBox();
  if (!band) throw new Error("no cards to frame");
  if (band.x < pane.x - 1 || band.x + band.width > pane.x + pane.width + 1) {
    throw new Error("a card is outside the graph pane — the frame would clip it");
  }
  const top = Math.max(pane.y, band.y - pad);
  const bottom = Math.min(pane.y + pane.height, band.y + band.height + pad);
  await page.screenshot({
    path: join(OUT, file),
    clip: { x: pane.x, y: top, width: pane.width, height: bottom - top },
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

/** Crops to the box containing ALL of `selectors` — portalled popovers etc. */
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

/** Full-width band starting at the replay banner and running into the canvas. */
async function shootBannerBand(page, file, canvasBand = 380) {
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
  if (!geometry.banner) throw new Error("no replay banner to frame");
  if (geometry.banner.top < geometry.topBar.bottom) {
    throw new Error("the banner is overlapping the top bar — item 13 regressed");
  }
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
  return geometry;
}

/** Selects a data wire by clicking its fat interaction path, opening the peek. */
async function peekWire(page, wireId) {
  const box = await page
    .locator(`.react-flow__edge[data-id="${wireId}"] .react-flow__edge-interaction`)
    .boundingBox();
  if (!box) throw new Error(`no data wire "${wireId}" on the canvas`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('[data-testid="wire-peek-popover"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const popover = document.querySelector('[data-testid="wire-peek-popover"]');
    return {
      state: popover.getAttribute("data-state"),
      text: popover.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
}

// ---------------------------------------------------------------------------
// The shots.
// ---------------------------------------------------------------------------

const SHOTS = {
  /**
   * 1 — a workflow with six real runs behind it, as it opens.
   *
   * Taken FIRST and deliberately, because it is the state every author lands
   * in and the one no earlier screenshot has ever shown: the canvas has no
   * badges, every strip says "Not run yet", and nothing anywhere hints that
   * this lineage has history. `RunStateProvider` mounts with
   * `activeRunId = null` by design. The shot asserts both halves — zero
   * badges on screen AND at least three runs returned by the API for this
   * very workflow — so the frame cannot be mistaken for a workflow that
   * genuinely has not run.
   */
  1: async (browser) => {
    const workflow = await workflowBySlug(SLUG.tryPreview);
    const { runs } = await api(`/api/workflows/${workflow.id}/runs?limit=50`);
    if (runs.length < 3) {
      throw new Error(
        `only ${runs.length} run(s) on the try-in-place demo — run \`npm run seed:demo-runs\``,
      );
    }
    const page = await newPage(browser);
    await openEditor(page, SLUG.tryPreview);
    const badges = await page.locator('[data-testid="node-status-badge"]').count();
    if (badges !== 0) {
      throw new Error(`${badges} status badge(s) on a freshly-opened canvas`);
    }
    const strip = (
      await page.getByTestId("node-result-strip-prep").textContent()
    )?.trim();
    if (strip !== "Not run yet") {
      throw new Error(`the prep strip reads "${strip}", expected "Not run yet"`);
    }
    process.stdout.write(`[${runs.length} runs exist, 0 badges shown] `);
    const { selectors } = await zoomToFitGraph(page);
    await shootGraphBand(page, selectors, "01-opens-as-never-run.png");
    await page.close();
  },

  /**
   * 2 — the succeeded run, replayed. Green on every node, the wire drawn as
   * the path that was taken.
   */
  2: async (browser) => {
    const { run } = await pickRun(
      SLUG.tryPreview,
      "prep succeeded",
      (row, nodes) => row.status === "succeeded" && nodes.prep?.status === "succeeded",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.tryPreview);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    await assertBadges(page, { upload1: "succeeded", prep: "succeeded" });
    // The `upload1 → prep` hop is drawn as a DATA wire, so its canvas id is
    // `wire:<consumer>:<input port>` rather than the config's `upload1-prep`.
    // The taken-path projection maps it back through `wire.edgeId`.
    await assertTaken(page, "wire:prep:blobKey", true);
    const { selectors } = await zoomToFitGraph(page);
    await shootGraphBand(page, selectors, "02-succeeded-run-canvas.png");
    await page.close();
  },

  /**
   * 3 — the failed node, with the tooltip that is supposed to say why.
   *
   * Two frames. The card, and the card with its error tooltip hovered — the
   * tooltip is the only place the canvas ever names a reason, and what it
   * names here is "Activity task failed", which is Temporal's wrapper and not
   * the cause. That is the point of the pair, so the shot asserts the string
   * rather than merely asserting that a tooltip appeared.
   */
  3: async (browser) => {
    const { run } = await pickRun(
      SLUG.tryPreview,
      "prep failed",
      (_row, nodes) => nodes.prep?.status === "failed",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.tryPreview);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    await assertBadges(page, { upload1: "succeeded", prep: "failed" });
    const { selectors } = await zoomToFitGraph(page);
    await shootGraphBand(page, selectors, "03-failed-node-canvas.png");

    await page.locator('[data-testid="node-status-badge-wrapper-prep"]').hover();
    await page.waitForSelector(".mantine-Tooltip-tooltip", { timeout: 10000 });
    await page.waitForTimeout(600);
    const tooltip = (
      await page.locator(".mantine-Tooltip-tooltip").first().textContent()
    )?.trim();
    if (tooltip !== "Activity task failed") {
      throw new Error(
        `the failure tooltip reads "${tooltip}" — the caption claims the ` +
          "generic Temporal wrapper, so check whether this got better",
      );
    }
    process.stdout.write(`[tooltip: "${tooltip}"] `);
    await shootUnion(
      page,
      ['[data-testid="canvas-node-prep"]', ".mantine-Tooltip-tooltip"],
      "04-failed-node-error-tooltip.png",
      24,
    );
    await page.close();
  },

  /**
   * 4 — the cache-served node. A violet bolt, and nothing on the canvas that
   * uses the word "cache".
   *
   * The absence is asserted, not assumed: the frame is refused if any visible
   * text on the page mentions caching, because the caption's whole claim is
   * that `skipped` plus two hashes in the API payload is the entire
   * vocabulary and the author is left to guess.
   */
  4: async (browser) => {
    const { run, nodes } = await pickRun(
      SLUG.tryPreview,
      "prep skipped with a cacheHit",
      (_row, n) => n.prep?.status === "skipped" && !!n.prep?.cacheHit,
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.tryPreview);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    await assertBadges(page, { upload1: "succeeded", prep: "skipped" });
    // There is nothing to hover. Only a `failed` badge with an error message
    // is wrapped in a tooltip and given pointer events; every other badge —
    // this one included — is explicitly click-through, so the violet bolt
    // cannot be interrogated at all. Asserted as the computed style rather
    // than by trying to hover it, which would just time out.
    const pointerEvents = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector(
            '[data-testid="node-status-badge-wrapper-prep"]',
          ),
        ).pointerEvents,
    );
    if (pointerEvents !== "none") {
      throw new Error(
        `the skipped badge takes pointer events (${pointerEvents}) — it may ` +
          "have gained an explanation the caption says it does not have",
      );
    }
    const saysCache = await page.evaluate(() =>
      /cach/i.test(document.body.innerText ?? ""),
    );
    if (saysCache) {
      throw new Error(
        'the canvas now says something containing "cache" — the caption ' +
          "claims it says nothing at all, so re-read it",
      );
    }
    process.stdout.write(
      `[skipped; API carries configHash ${nodes.prep.cacheHit.configHash.slice(0, 8)}… ` +
        `inputHash ${nodes.prep.cacheHit.inputHash.slice(0, 8)}…; ` +
        'the word "cache" appears nowhere on screen] ',
    );
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(500);
    const { selectors } = await zoomToFitGraph(page);
    await shootGraphBand(page, selectors, "05-cache-skipped-node.png");
    await page.close();
  },

  /**
   * 5 — the switch's taken case, with the un-taken one beside it.
   *
   * Asserts all three halves of the claim: `to-pdf` painted as taken,
   * `to-image` not, and `markImage` — the node on the branch that was not
   * chosen — carrying a grey "pending" dot rather than anything that says
   * "not applicable".
   */
  5: async (browser) => {
    const { run } = await pickRun(
      SLUG.branchError,
      'routeByType selected "to-pdf"',
      (_row, nodes) => nodes.routeByType?.selectedEdgeId === "to-pdf",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.branchError);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    await assertBadges(page, {
      upload1: "succeeded",
      prep: "succeeded",
      routeByType: "succeeded",
      markPdf: "succeeded",
      markImage: "pending",
      reject: "pending",
    });
    await assertTaken(page, "to-pdf", true);
    await assertTaken(page, "to-image", false);
    await assertTaken(page, "prep-reject", false);
    const { selectors } = await zoomToFitGraph(page, 0.5);
    await shootGraphBand(page, selectors, "06-switch-taken-branch.png");
    // Close on the decision itself: the switch and the two cases it chose
    // between. The wide frame above shows the SHAPE of the run; only this one
    // is at a zoom where "green check" and "grey dot" are decidable.
    const decision = [
      '[data-testid="canvas-node-routeByType"]',
      '[data-testid="canvas-node-markPdf"]',
      '[data-testid="canvas-node-markImage"]',
    ];
    await centreInCanvas(page, decision);
    await zoomOnto(page, decision, 820);
    await centreInCanvas(page, decision);
    await shootUnion(page, decision, "06a-switch-taken-branch-close.png", 34);
    await page.close();
  },

  /**
   * 6 — the error path really taken.
   *
   * `prep` fails, its `errorPolicy: "fallback"` diverts down `prep-reject`,
   * `reject` succeeds, and the RUN reads succeeded because the failure was
   * handled. The last part is the confusing bit, so the shot reads the run
   * row's own `data-status` before leaving the drawer and refuses the frame
   * unless it really does say `succeeded` over a canvas with a red cross on
   * it.
   */
  6: async (browser) => {
    const { run } = await pickRun(
      SLUG.branchError,
      'prep failed onto "prep-reject"',
      (_row, nodes) => nodes.prep?.selectedEdgeId === "prep-reject",
    );
    if (run.status !== "succeeded") {
      throw new Error(
        `the handled-failure run reads "${run.status}", not "succeeded" — ` +
          "the caption's point is that a handled failure reads green",
      );
    }
    const page = await newPage(browser);
    await openEditor(page, SLUG.branchError);
    await openRunHistory(page);
    const rowStatus = await page
      .locator(`[data-testid="run-row-${run.runId}"]`)
      .getAttribute("data-status");
    if (rowStatus !== "succeeded") {
      throw new Error(`the run row reads ${rowStatus}, expected succeeded`);
    }
    await replayRun(page, run.runId);
    await assertBadges(page, {
      upload1: "succeeded",
      prep: "failed",
      reject: "succeeded",
      routeByType: "pending",
      markPdf: "pending",
      markImage: "pending",
    });
    await assertTaken(page, "prep-reject", true);
    await assertTaken(page, "prep-route", false);
    const { selectors } = await zoomToFitGraph(page, 0.5);
    await shootGraphBand(page, selectors, "07-taken-error-path.png");
    const diversion = [
      '[data-testid="canvas-node-prep"]',
      '[data-testid="canvas-node-reject"]',
    ];
    await centreInCanvas(page, diversion);
    await zoomOnto(page, diversion, 820);
    await centreInCanvas(page, diversion);
    await shootUnion(page, diversion, "07a-taken-error-path-close.png", 34);
    await page.close();
  },

  /**
   * 7 — the in-flight canvas: a node genuinely running, beside a node served
   * from cache and a node that has not been reached.
   *
   * TIME-SENSITIVE. The gate is only alive for 30 minutes after it is parked
   * (`workflowExecutionTimeout: "30 minutes"`), so this shot resolves the run
   * from the live API and says what to re-run rather than photographing a
   * dead one.
   */
  7: async (browser) => {
    const { run } = await pickRun(
      SLUG.humanGate,
      "approve running",
      (row, nodes) =>
        row.status === "running" && nodes.approve?.status === "running",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.humanGate);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    const badges = await assertBadges(page, {
      upload1: "succeeded",
      approve: "running",
      complete: "pending",
    });
    if (!["succeeded", "skipped"].includes(badges.prep)) {
      throw new Error(`prep reads ${badges.prep}, expected succeeded or skipped`);
    }
    // The hop into the gate is finished, so it is drawn taken; the hop out is
    // the live one and stays inactive because the gate has not routed yet.
    await assertTaken(page, "prep-approve", true);
    const outward = await edgeStroke(page, "approve-complete");
    process.stdout.write(
      `[prep=${badges.prep}; approve-complete stroke ${outward.stroke}` +
        `${outward.stroke === ACTIVE_STROKE ? " (live hop)" : ""}] `,
    );
    const { selectors } = await zoomToFitGraph(page, 0.6);
    await shootGraphBand(page, selectors, "08-in-flight-run.png");
    await page.close();
  },

  /**
   * 8 — the gate that timed out: a run history row that reads FAILED over a
   * canvas whose gate node still reads RUNNING.
   *
   * Not a staged state. A graph run's `workflowExecutionTimeout` is a
   * hard-coded 30 minutes while a `humanGate`'s own timer is 30 days, so
   * every waiting gate is killed by Temporal half an hour in. The workflow
   * never got another workflow task, so the status map it answers queries
   * from still has the gate `running` — and the row above it says the run
   * failed. Both halves are asserted.
   */
  8: async (browser) => {
    const { run } = await pickRun(
      SLUG.humanGate,
      "a run whose row is failed while its approve node still reads running",
      (row, nodes) =>
        row.status === "failed" && nodes.approve?.status === "running",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.humanGate);
    await openRunHistory(page);
    const rowStatus = await page
      .locator(`[data-testid="run-row-${run.runId}"]`)
      .getAttribute("data-status");
    if (rowStatus !== "failed") {
      throw new Error(`the run row reads ${rowStatus}, expected failed`);
    }
    // The row on its own, because the canvas below is pixel-identical to the
    // genuinely-waiting run's canvas and this red dot is the only thing that
    // distinguishes them.
    await shootElement(
      page,
      `[data-testid="run-row-${run.runId}"]`,
      "09a-timed-out-run-row.png",
      10,
    );
    await replayRun(page, run.runId);
    await assertBadges(page, { approve: "running", complete: "pending" });
    process.stdout.write("[row=failed, approve badge=running] ");
    const { selectors } = await zoomToFitGraph(page, 0.6);
    await shootGraphBand(page, selectors, "09-timed-out-gate-still-running.png");
    await page.close();
  },

  /**
   * 9 — the cancelled run, where the gate node reads `failed` with "Workflow
   * cancelled" as its reason.
   */
  9: async (browser) => {
    const { run } = await pickRun(
      SLUG.humanGate,
      "a cancelled run",
      (row) => row.status === "cancelled",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.humanGate);
    await openRunHistory(page);
    await replayRun(page, run.runId);
    await assertBadges(page, { approve: "failed", complete: "pending" });
    // Close on the gate card alone. At the zoom this four-card graph fits at
    // the card is ~150px wide and the tooltip, which renders at 1:1 through a
    // portal, is twice the size of the node it is explaining.
    const gate = '[data-testid="canvas-node-approve"]';
    await centreInCanvas(page, gate);
    await zoomOnto(page, gate, 520);
    await centreInCanvas(page, gate);
    await page
      .locator('[data-testid="node-status-badge-wrapper-approve"]')
      .hover();
    await page.waitForSelector(".mantine-Tooltip-tooltip", { timeout: 10000 });
    await page.waitForTimeout(600);
    const tooltip = (
      await page.locator(".mantine-Tooltip-tooltip").first().textContent()
    )?.trim();
    if (tooltip !== "Workflow cancelled") {
      throw new Error(`the tooltip reads "${tooltip}", expected "Workflow cancelled"`);
    }
    process.stdout.write(`[approve=failed, tooltip "${tooltip}"] `);
    await shootUnion(
      page,
      ['[data-testid="canvas-node-approve"]', ".mantine-Tooltip-tooltip"],
      "10-cancelled-run-gate-node.png",
      24,
    );
    await page.close();
  },

  /**
   * 10 — Run history with mixed statuses, and the filters above it.
   *
   * The human-gate demo, because it is the one lineage that carries three
   * different run statuses at once (running, cancelled, failed). The shot
   * counts the distinct `data-status` values on the rows and refuses a frame
   * with fewer than three, so it cannot quietly become a picture of a list of
   * identical green rows.
   */
  10: async (browser) => {
    const page = await newPage(browser);
    await openEditor(page, SLUG.humanGate);
    await openRunHistory(page);
    const statuses = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="run-row-graph-"]')].map(
        (el) => el.getAttribute("data-status"),
      ),
    );
    const distinct = [...new Set(statuses)];
    if (distinct.length < 3) {
      throw new Error(
        `only ${distinct.length} distinct run status(es) in this drawer ` +
          `(${distinct.join(", ")}) — re-run \`npm run seed:demo-runs\``,
      );
    }
    process.stdout.write(`[${statuses.length} rows: ${statuses.join(", ")}] `);
    await page.mouse.move(4, VIEWPORT.height - 4);
    await page.waitForTimeout(500);
    await shootElement(page, ".mantine-Drawer-content", "11-run-history-mixed.png", 0);

    // The status filter, opened, so the four values it offers are legible.
    await page.getByTestId("run-history-filter-status").click();
    await page.waitForTimeout(700);
    const options = await page.evaluate(() =>
      [...document.querySelectorAll('[role="option"]')].map((el) =>
        el.textContent?.trim(),
      ),
    );
    for (const expected of ["All statuses", "Running", "Succeeded", "Failed", "Cancelled"]) {
      if (!options.includes(expected)) {
        throw new Error(
          `the status filter offers ${JSON.stringify(options)}, missing "${expected}"`,
        );
      }
    }
    // The dropdown is portalled, but Mantine positions it inside the drawer's
    // column, so the drawer's own rectangle is the frame that holds the
    // filter row and the open list together. Cropped to the top of the drawer
    // rather than all of it — the rows below are shot 10's business.
    const drawer = await page
      .locator(".mantine-Drawer-content")
      .first()
      .boundingBox();
    await page.screenshot({
      path: join(OUT, "12-run-history-filters.png"),
      clip: {
        x: drawer.x,
        y: drawer.y,
        width: drawer.width,
        height: Math.min(drawer.height, 330),
      },
    });
    await page.close();
  },

  /**
   * 11 — the replay banner with a real version pin, over the graph that
   * really ran.
   *
   * The replay demo's head is v2 (it adds `markProcessing` after `prep`) and
   * the seeded run is pinned to v1. So the banner names v1 AND the canvas
   * below it must be the two-node v1 graph — asserted, because a banner that
   * says v1 over the v2 graph is precisely the failure G-004 exists to
   * prevent and it would be invisible in a picture otherwise.
   */
  11: async (browser) => {
    const { workflow, run } = await pickRun(
      SLUG.replayVersions,
      "a run pinned to v1",
      (row) => row.versionNumber === 1,
    );
    const { versions } = await api(`/api/workflows/${workflow.id}/versions`);
    const head = Math.max(...versions.map((v) => v.versionNumber));
    if (head < 2) {
      throw new Error(`head is v${head} — this shot needs a newer head than the run`);
    }
    const page = await newPage(browser);
    await openEditor(page, SLUG.replayVersions);
    const liveNodes = await page.locator(".react-flow__node").count();
    await openRunHistory(page);
    await replayRun(page, run.runId);
    const banner = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="replay-mode-indicator"]');
      return {
        version: el.getAttribute("data-version-number"),
        unavailable: el.getAttribute("data-version-unavailable"),
        text: el.textContent?.replace(/\s+/g, " ").trim(),
      };
    });
    if (banner.version !== "1" || banner.unavailable !== "false") {
      throw new Error(`banner pins v${banner.version} (unavailable=${banner.unavailable})`);
    }
    if (!banner.text.includes("you are looking at v1, the graph this run used")) {
      throw new Error(`the banner says: ${banner.text}`);
    }
    const replayNodes = await page.locator(".react-flow__node").count();
    if (replayNodes !== liveNodes - 1) {
      throw new Error(
        `head shows ${liveNodes} cards and replay shows ${replayNodes} — ` +
          "replay is not rendering the older graph",
      );
    }
    const hasMarkProcessing = await page
      .locator('[data-testid="canvas-node-markProcessing"]')
      .count();
    if (hasMarkProcessing !== 0) {
      throw new Error("v2's markProcessing card is on screen during a v1 replay");
    }
    // The palette is NOT disabled while the banner says the canvas is
    // read-only. Printed rather than enforced — it is an observation for the
    // write-up, and a shot that failed on it would stop photographing the
    // thing it is meant to photograph.
    const palette = await page.evaluate(() => {
      const el = document.querySelector('[data-testid^="activity-palette-entry-"]');
      if (!el) return "no palette item found";
      const button = el.closest("button") ?? el.querySelector("button") ?? el;
      return `${button.tagName.toLowerCase()} disabled=${button.disabled === true} aria-disabled=${button.getAttribute("aria-disabled")}`;
    });
    process.stdout.write(
      `[head v${head}, run pinned v1; canvas ${liveNodes} cards → ${replayNodes} in replay; palette: ${palette}] `,
    );
    // Fit the two v1 cards under the banner, so the frame carries the claim
    // (a v1 banner over a v1 graph) rather than the banner over empty pane.
    const { selectors } = await zoomToFitGraph(page, 0.75);
    const band = await subjectBox(page, selectors);
    const bannerTop = await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="replay-mode-indicator"]')
          .getBoundingClientRect().top,
    );
    await page.screenshot({
      path: join(OUT, "13-replay-banner-version-pin.png"),
      clip: {
        x: 0,
        y: Math.round(bannerTop),
        width: VIEWPORT.width,
        height: Math.min(
          VIEWPORT.height - Math.round(bannerTop),
          Math.round(band.y + band.height + 40 - bannerTop),
        ),
      },
    });
    await page.close();
  },

  /**
   * 12 — a wire peek showing a value that really flowed, and the node result
   * strip that summarises the same value.
   *
   * Three frames off one replay: the peek popover attached to its wire, the
   * strip in its `ready` state, and the strip's detail popover.
   *
   * The peeked value is compared against the run's OWN recorded input ctx and
   * the mismatch, if any, is printed — see ILLUSTRATED.md, because previews
   * are read out of a lineage-scoped cache with a 5-second slack on the run
   * window and two runs seconds apart can therefore show each other's values.
   */
  12: async (browser) => {
    // The BRANCH demo, not the try-in-place one whose name promises previews.
    // Its `prep` is the only seeded activity that binds an output
    // (`outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }]`), so
    // it is the only one whose cache row holds anything: the try-in-place
    // demo's `prep` declares no outputs, its cached `outputCtx` is `{}`, and
    // its strip therefore reads "Not bound to a value" after a green run —
    // see shot 2's frame, and the note in ILLUSTRATED.md.
    const { workflow, run } = await pickRun(
      SLUG.branchError,
      'routeByType selected "to-pdf"',
      (_row, nodes) => nodes.routeByType?.selectedEdgeId === "to-pdf",
    );
    const page = await newPage(browser);
    await openEditor(page, SLUG.branchError);
    await openRunHistory(page);
    await replayRun(page, run.runId);

    // Zoom onto the two cards the wire joins BEFORE peeking. The popover
    // renders at 1:1 through a portal, but the wire and the cards do not — at
    // the 0.59x this six-node graph fits at, the frame that holds both is a
    // 1:1 popover beside a thumbnail, and the value it is pointing at is
    // unreadable.
    const pair = [
      '[data-testid="canvas-node-upload1"]',
      '[data-testid="canvas-node-prep"]',
    ];
    await centreInCanvas(page, pair);
    await zoomOnto(page, pair, 900);
    await centreInCanvas(page, pair);

    const peek = await peekWire(page, "wire:prep:blobKey");
    if (peek.text.length < 20) {
      throw new Error(
        `the wire peek shows nothing (state "${peek.state}"): ${peek.text}`,
      );
    }
    process.stdout.write(`[peek ${peek.state}: ${peek.text.slice(0, 90)}…] `);
    await shootUnion(
      page,
      ['[data-testid="canvas-node-prep"]', '[data-testid="wire-peek-popover"]'],
      "14-wire-peek-value.png",
      24,
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stripState = await page
      .getByTestId("node-result-strip-prep")
      .getAttribute("data-state");
    if (stripState !== "ready") {
      throw new Error(`the prep result strip is "${stripState}", expected "ready"`);
    }
    await shootElement(page, '[data-testid="canvas-node-prep"]', "15-node-result-strip.png", 26);

    await page.getByTestId("node-result-strip-prep").click();
    await page.waitForSelector('[data-testid="node-result-detail-prep"]', {
      timeout: 10000,
    });
    await page.waitForTimeout(900);
    await shootUnion(
      page,
      ['[data-testid="canvas-node-prep"]', '[data-testid="node-result-detail-prep"]'],
      "16-node-result-detail.png",
      24,
    );

    // PROVENANCE. Printed rather than enforced, and it is the reason this
    // shot exists in the shape it does: the previews behind the peek and the
    // strips are read out of a LINEAGE-scoped cache, filtered to the run's
    // execution window plus five seconds of slack
    // (`ActivityOutputCacheRepository.findManyInRunWindow`), newest row per
    // node wins. Two runs of the same lineage seconds apart — which is what
    // the seeder produces, and what a retry produces — therefore show each
    // other's values. The check compares the source card's own strip against
    // the run's recorded `initialCtx` and says which run the reader is
    // actually looking at.
    const uploadStrip = await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="node-result-strip-upload1"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
    );
    let ownCtx = "";
    try {
      const { initialCtx } = await api(
        `/api/workflows/${workflow.id}/runs/${run.runId}/input-ctx`,
      );
      ownCtx = String(initialCtx.documentUrl ?? JSON.stringify(initialCtx));
    } catch (error) {
      ownCtx = `(input-ctx unavailable: ${error.message.slice(0, 60)})`;
    }
    const sameRun = ownCtx.startsWith(uploadStrip.replace(/…$/, "").trim());
    process.stdout.write(
      `[upload strip "${uploadStrip}" vs this run's own documentUrl ` +
        `"${ownCtx.slice(0, 60)}…" → ${sameRun ? "SAME RUN" : "DIFFERENT RUN"}] `,
    );
    // The source card and its strip, at whatever the truth turns out to be —
    // the caption reports it either way.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await centreInCanvas(page, '[data-testid="canvas-node-upload1"]');
    await zoomOnto(page, '[data-testid="canvas-node-upload1"]', 620);
    await shootElement(
      page,
      '[data-testid="canvas-node-upload1"]',
      "17-source-strip-provenance.png",
      26,
    );
    await page.close();
  },
};

API_KEY = await resolveApiKey();

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
    // Two attempts. The dev stack is a watcher: an edit under `apps/`
    // restarts nest or vite mid-shot and the page that was loading gets a
    // connection refused instead of a graph. A shot that fails on its
    // assertion fails the same way twice, so this costs nothing.
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
