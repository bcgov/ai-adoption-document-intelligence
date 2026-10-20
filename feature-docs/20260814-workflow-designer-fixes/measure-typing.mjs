/**
 * D7 — what a keystroke costs in one box of a step's settings, measured in the
 * browser on the running editor.
 *
 *   npm run dev                  # frontend :3000, backend :3002, temporal worker
 *
 *   node feature-docs/20260814-workflow-designer-fixes/measure-typing.mjs \
 *     <workflowId> <nodeId> <fieldTestId> [rounds] [caret]
 *
 * `nodeId` is the step whose settings hold the box; `group:<id>` selects a
 * group's header instead. `fieldTestId` is the box's test id. `caret` is `end`
 * (the default: 24 characters typed at the end of the box) or `beforeLast`
 * (six digits typed before the last character, for a duration such as `10s`).
 * Each round types at 60 ms a key, then deletes what it typed and leaves the
 * box, so the workflow ends as it began; nothing is saved.
 *
 * Two measures per keystroke:
 *   - key to frame: from the keydown's timestamp to the first task after the
 *     next animation frame, so it covers fast keys too;
 *   - Event Timing: a PerformanceObserver on `event` entries with
 *     `durationThreshold: 16`. The browser does not report a keydown faster
 *     than 16 ms at all, so those count as "under 16".
 * It also counts DOM changes inside the canvas cards while typing.
 *
 * The API key is the seeded dev default, read from the environment or from
 * playwright.config.ts's fallback, and never printed.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const require = createRequire(join(REPO, "package.json"));
const { chromium } = require("playwright");

const FRONTEND = "http://localhost:3000";
const TEXT = " lag check abcdefghijklm"; // 24 characters
const DIGITS = "000000";

const [workflowId, nodeId, fieldTestId, roundsArg, caretArg] =
  process.argv.slice(2);
if (!fieldTestId) {
  throw new Error(
    "usage: measure-typing.mjs <workflowId> <nodeId> <fieldTestId> [rounds] [end|beforeLast]",
  );
}
const rounds = Number(roundsArg ?? 3);
const caret = caretArg ?? "end";

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
 * The mock user is an ADMIN of the seed group holding every permission the
 * frontend knows, as `tests/e2e/helpers/auth.ts` signs in.
 */
const PERMISSIONS = [
  ...readFileSync(
    join(REPO, "apps", "frontend", "src", "auth", "permissions.ts"),
    "utf8",
  ).matchAll(/= "([A-Z_]+)"/g),
].map((m) => m[1]);
const MOCK_USER = {
  sub: "test-user",
  name: "Test User",
  preferred_username: "testuser",
  email: "test@example.com",
  roles: ["user"],
  isAdmin: false,
  expires_in: 3600,
  groups: [
    {
      id: "seeddefaultgroup",
      name: "Default",
      role: "ADMIN",
      permissions: PERMISSIONS,
    },
  ],
};

function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 1000 } })
).newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
// Origin-agnostic, general route first: the most recent registration wins,
// so the two auth routes below take precedence for their own URLs.
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

await page.goto(`${FRONTEND}/workflows/${workflowId}/edit`, {
  waitUntil: "networkidle",
});
const isGroup = nodeId.startsWith("group:");
const cardSelector = isGroup
  ? `[data-testid="group-container-header-${nodeId.slice(6)}"]`
  : `.react-flow__node[data-id="${nodeId}"]`;
await page.waitForSelector(cardSelector, { timeout: 60000 });
await page.waitForTimeout(1500);
if (isGroup) await page.locator(cardSelector).click();
else await page.locator(cardSelector).click({ position: { x: 20, y: 12 } });
const field = page.getByTestId(fieldTestId);
await field.waitFor({ timeout: 20000 });
await field.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);

await page.evaluate(() => {
  window.__keys = [];
  window.__events = [];
  window.__mutations = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__events.push({ name: e.name, duration: e.duration });
    }
  }).observe({ type: "event", durationThreshold: 16, buffered: false });
  document.addEventListener(
    "keydown",
    (event) => {
      const at = event.timeStamp;
      requestAnimationFrame(() => {
        setTimeout(() => window.__keys.push(performance.now() - at), 0);
      });
    },
    true,
  );
  const cards = document.querySelector(".react-flow__nodes");
  if (cards) {
    new MutationObserver((records) => {
      if (window.__counting) window.__mutations += records.length;
    }).observe(cards, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
  }
});

const results = [];
for (let round = 1; round <= rounds; round++) {
  const typed = caret === "beforeLast" ? DIGITS : TEXT;
  await field.click();
  await page.keyboard.press("End");
  if (caret === "beforeLast") await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__keys = [];
    window.__events = [];
    window.__mutations = 0;
    window.__counting = true;
  });
  await page.keyboard.type(typed, { delay: 60 });
  const mutations = await page.evaluate(() => {
    window.__counting = false;
    return window.__mutations;
  });
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => ({
    keys: window.__keys,
    events: window.__events,
  }));
  const keydowns = data.events
    .filter((e) => e.name === "keydown")
    .map((e) => e.duration);
  results.push({
    round,
    keys: typed.length,
    keyToFrameMedianMs: Math.round(median(data.keys) * 10) / 10,
    keyToFrameMaxMs: Math.round(Math.max(...data.keys) * 10) / 10,
    eventTimingOver16: keydowns.length,
    eventTimingMedianMs: median(keydowns),
    cardMutationsWhileTyping: mutations,
  });
  // Delete what was typed and leave the box, so every round starts from the
  // same text and the workflow ends as it began.
  await field.click();
  await page.keyboard.press("End");
  if (caret === "beforeLast") await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < typed.length; i++) await page.keyboard.press("Backspace");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1500);
}

for (const r of results) {
  console.log(
    `round ${r.round}: key to frame median ${r.keyToFrameMedianMs} ms, max ${r.keyToFrameMaxMs} ms` +
      ` | Event Timing: ${r.eventTimingOver16}/${r.keys} keys over 16 ms` +
      (r.eventTimingMedianMs === null
        ? ""
        : `, median of those ${r.eventTimingMedianMs} ms`) +
      ` | card changes while typing ${r.cardMutationsWhileTyping}`,
  );
}
if (pageErrors.length > 0) console.log("page errors:", pageErrors);
await browser.close();
