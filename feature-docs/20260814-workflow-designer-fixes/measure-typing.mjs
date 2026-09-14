/**
 * D7 — what typing in a node-settings field costs, measured in the browser.
 *
 * The fix gave free-text fields a local draft that commits on a quiet moment
 * (`use-debounced-text-commit.ts`, wired into `VariablePicker` and
 * `JsonSchemaForm`). The claim under it is that a keystroke no longer rewrites
 * the whole workflow config — which re-ran the auto-wire graph walk, rewrote
 * downstream bindings and re-projected every card on the canvas.
 *
 * ## What is compared, and why it is honest
 *
 * There is no pre-fix build to measure: the fix is in the working tree and
 * `git stash` is not available here (shared tree). So the comparison is
 * between two fields **on the same panel of the same node of the same graph**,
 * typed identically in the same page load:
 *
 *   A. `node-settings-label` — the **Node label** field, which was NOT part of
 *      the D7 change. It still calls `updateNode` on every keystroke
 *      (`NodeSettingsPanel.tsx:324` → `:214`), i.e. one whole-config write per
 *      character. That is the pre-fix path, still live, in the shipped build.
 *
 *   B. `map-node-settings-item-ctx-key` — a `VariablePicker`, which now drafts
 *      locally and commits once the typing stops (`VariablePicker.tsx:216`).
 *      That is the post-fix path.
 *
 * A is not a *recording* of the old build; it is a field that takes the old
 * code path. B additionally re-expands its option list against the draft on
 * every keystroke, work that A does not do at all — so the comparison is
 * loaded AGAINST the fix, and any win it shows is a floor rather than a
 * ceiling.
 *
 * ## What is counted
 *
 *   - **React commits** — a stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` installed
 *     before the app loads counts `onCommitFiberRoot` calls. Every commit of
 *     every root, so it is the app's real commit count and not a sample.
 *   - **Long tasks** — `PerformanceObserver({ entryTypes: ["longtask"] })`:
 *     count, total duration, longest. A long task is >50ms of blocked main
 *     thread, which is what "laggy" means in a keystroke.
 *   - **Burst wall time** — how long the 30 keystrokes take to dispatch with
 *     no delay between them. Playwright awaits each key event, so a blocked
 *     main thread shows up here directly.
 *   - **Settle time** — from the last keystroke to the main thread going quiet
 *     (a 400ms window with no long task), which is where the debounced field
 *     does its one expensive commit.
 *
 * ## Read the numbers as dev-build numbers
 *
 * This runs against the Vite dev server and a development React, which is the
 * build Dylan was typing into. A production build would be faster in both
 * columns; the ratio is the point, not the absolute figures.
 *
 *   node feature-docs/20260814-workflow-designer-fixes/measure-typing.mjs
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");

const FRONTEND = "http://localhost:3000";
const VIEWPORT = { width: 1920, height: 1080 };
/** A 16-node seeded graph with a map node — the shape D7 was reported on. */
const SLUG = "multi-page-report";
const MAP_NODE = "processSegments";
const ROUNDS = 3;
const BURST = "alphabravocharliedeltaechofoxt"; // 30 characters

function apiKey() {
  if (process.env.TEST_API_KEY) return process.env.TEST_API_KEY;
  const config = readFileSync(join(REPO, "playwright.config.ts"), "utf8");
  const match = /process\.env\.TEST_API_KEY = '([^']+)'/.exec(config);
  if (!match) throw new Error("no TEST_API_KEY available");
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

const INSTRUMENT = () => {
  window.__metrics = { commits: 0, longTasks: [] };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot() {
      window.__metrics.commits += 1;
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    emit() {},
    on() {},
    off() {},
    sub() {
      return () => {};
    },
    getFiberRoots() {
      return new Set();
    },
    setStrictMode() {},
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__metrics.longTasks.push({
        start: entry.startTime,
        duration: entry.duration,
      });
    }
  }).observe({ entryTypes: ["longtask"] });
};

async function newPage(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(INSTRUMENT);
  const page = await context.newPage();
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

/** Zeroes the counters and returns the page clock reading they start from. */
async function resetMetrics(page) {
  return page.evaluate(() => {
    window.__metrics.commits = 0;
    window.__metrics.longTasks = [];
    return performance.now();
  });
}

/**
 * Types `BURST` into `selector` with no inter-key delay, then waits for the
 * main thread to go quiet, and returns everything that happened.
 */
async function measureField(page, selector) {
  const input = page.locator(selector).first();
  await input.click();
  // Start from a known, empty field so both runs commit the same number of
  // characters. Ctrl+A then type replaces whatever is there.
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(1500); // let that edit's own commit finish

  const t0 = await resetMetrics(page);
  const wallStart = Date.now();
  await input.pressSequentially(BURST, { delay: 0 });
  const burstMs = Date.now() - wallStart;
  const lastKeystrokeAt = await page.evaluate(() => performance.now());

  // Settle: wait until 400ms passes with no new long task, up to 5s.
  const settleStart = Date.now();
  let quietSince = Date.now();
  let lastCount = -1;
  while (Date.now() - settleStart < 5000) {
    const count = await page.evaluate(() => window.__metrics.longTasks.length);
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    } else if (Date.now() - quietSince > 400) {
      break;
    }
    await page.waitForTimeout(50);
  }

  const metrics = await page.evaluate(() => ({
    commits: window.__metrics.commits,
    longTasks: window.__metrics.longTasks,
  }));
  const during = metrics.longTasks.filter((t) => t.start >= t0);
  const afterLast = during.filter((t) => t.start >= lastKeystrokeAt);
  const total = (rows) => rows.reduce((sum, t) => sum + t.duration, 0);
  return {
    commits: metrics.commits,
    burstMs,
    perCharMs: burstMs / BURST.length,
    longTaskCount: during.length,
    longTaskMs: Math.round(total(during)),
    longestTaskMs: Math.round(Math.max(0, ...during.map((t) => t.duration))),
    afterLastKeyCount: afterLast.length,
    afterLastKeyMs: Math.round(total(afterLast)),
  };
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function report(name, runs) {
  const pick = (key) => median(runs.map((r) => r[key]));
  console.log(`\n  ${name}`);
  console.log(`    React commits for 30 keystrokes : ${pick("commits")}`);
  console.log(
    `    burst wall time                 : ${pick("burstMs")} ms  (${pick("perCharMs").toFixed(1)} ms/char)`,
  );
  console.log(
    `    long tasks (>50ms)              : ${pick("longTaskCount")}, ${pick("longTaskMs")} ms total, longest ${pick("longestTaskMs")} ms`,
  );
  console.log(
    `    …of those, after the last key   : ${pick("afterLastKeyCount")}, ${pick("afterLastKeyMs")} ms`,
  );
  console.log(`    raw runs: ${JSON.stringify(runs)}`);
  return {
    commits: pick("commits"),
    burstMs: pick("burstMs"),
    longTaskCount: pick("longTaskCount"),
    longTaskMs: pick("longTaskMs"),
  };
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await newPage(browser);
  await page.goto(`${FRONTEND}/workflows/by-slug/${SLUG}/edit`, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  await page.waitForSelector(".react-flow__node", { timeout: 25000 });
  await page.waitForTimeout(3000);
  const nodeCount = await page.locator(".react-flow__node").count();
  await page.locator(`[data-testid="canvas-node-${MAP_NODE}"]`).first().click();
  await page.waitForSelector('[data-testid="map-node-settings"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(2000);
  console.log(`  graph: ${SLUG} — ${nodeCount} cards on canvas`);
  console.log(`  panel: ${MAP_NODE} (map node)`);
  console.log(`  burst: ${BURST.length} characters, no delay between keys`);

  const oldPath = [];
  const newPath = [];
  // Alternated, so a warm-up or a drift affects both columns equally.
  for (let i = 0; i < ROUNDS; i++) {
    process.stdout.write(`  round ${i + 1} … `);
    oldPath.push(await measureField(page, '[data-testid="node-settings-label"]'));
    newPath.push(
      await measureField(page, '[data-testid="map-node-settings-item-ctx-key"]'),
    );
    console.log("done");
  }

  const a = report(
    "A — Node label (writes the whole config on every keystroke; NOT changed by D7)",
    oldPath,
  );
  const b = report(
    "B — Map item ctx key (VariablePicker: local draft, one commit per burst; the D7 path)",
    newPath,
  );
  console.log("\n  ratio (A ÷ B)");
  console.log(`    commits    : ${(a.commits / b.commits).toFixed(1)}×`);
  console.log(`    burst time : ${(a.burstMs / b.burstMs).toFixed(1)}×`);
  console.log(
    `    long-task ms: ${b.longTaskMs === 0 ? "B had none" : (a.longTaskMs / b.longTaskMs).toFixed(1) + "×"}`,
  );
  // Nothing is saved: every edit above lives in unsaved canvas state and dies
  // with the context.
  await page.close();
} finally {
  await browser.close();
}
