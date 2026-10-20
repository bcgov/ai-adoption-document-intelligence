import { expect, type Page, type Route, test } from "@playwright/test";
import { bringNodeIntoClear } from "../helpers/canvas";
import {
  BACKEND_URL,
  SEED_GROUP_ID,
  setupWorkflowBuilderTest,
  TEST_API_KEY,
} from "../helpers/wb-test";
import { getWorkflow, listWorkflows } from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — "Edit script" on a custom step opens that step's own script.
 *
 * ## What this guards
 *
 * The builder opens the custom-node editor in a window, from the step's
 * settings or from its context menu, and the editor fetches the lineage's
 * script when the window opens. The editor must be created from that script.
 * An editor created before the script arrives starts from the create-mode
 * starter template (`@name my-custom-node`) and reports that text up as soon
 * as it mounts. The app runs under React's StrictMode, which runs a newly
 * mounted component's effects a second time after its parent's, so the
 * template lands after the fetched script and replaces it: the window says
 * "Editing demo-uppercase" while the editor, the signature strip and the
 * preview all show the template, and Publish would send it.
 *
 * ## Why this has to be a browser test
 *
 * The failure needs the dev server's StrictMode, the real data fetch and the
 * real Monaco together. `DynamicNodeEditor.spec.tsx` covers the same rule in
 * jsdom under `<StrictMode>`; this checks it on the page an author uses.
 *
 * ## Timing
 *
 * The step's settings fetch the same lineage detail the window does, as soon
 * as the step is selected. When that fetch lands before Edit script is
 * clicked, the window opens with the script already cached and there is
 * nothing to race. Each test therefore holds the detail response until the
 * window shows its loading state, so the window always opens first, which is
 * the case that matters.
 *
 * ## Scope
 *
 * Uses the seeded custom-node demo ("🎯 Demo — Dynamic (custom-code) node",
 * from `node scripts/seed-feature-demos.mjs`) and its `dyn.demo-uppercase`
 * step. Nothing is published or saved; the tests skip when the demo has not
 * been seeded, which is the case right after the default database reset.
 */

const DEMO_NAME_PREFIX = "🎯 Demo — Dynamic";
const ACTIVITY_TYPE = "dyn.demo-uppercase";
const SLUG = "demo-uppercase";

interface Demo {
  workflowId: string;
  nodeId: string;
  /** The lineage's head script, as the server holds it. */
  headScript: string;
}

/** Finds the seeded demo and its custom step through the API, or null. */
async function findDemo(
  request: Parameters<typeof listWorkflows>[0],
): Promise<Demo | null> {
  const workflows = await listWorkflows(request, `&groupId=${SEED_GROUP_ID}`);
  const demo = workflows.find((w) => w.name.startsWith(DEMO_NAME_PREFIX));
  if (!demo) return null;
  const workflow = await getWorkflow(request, demo.id);
  const node = Object.values(workflow.config.nodes).find(
    (n) => n.activityType === ACTIVITY_TYPE,
  );
  if (!node) return null;
  const detail = await request.get(
    `${BACKEND_URL}/api/dynamic-nodes/${SLUG}?groupId=${SEED_GROUP_ID}`,
    { headers: { "x-api-key": TEST_API_KEY } },
  );
  if (!detail.ok()) return null;
  const body = (await detail.json()) as { versions: { script: string }[] };
  const headScript = body.versions[0]?.script;
  if (headScript === undefined) return null;
  return { workflowId: demo.id, nodeId: node.id, headScript };
}

/**
 * Holds the browser's request for the lineage detail until `release()` is
 * called; the request then goes on to the real backend unchanged. Register it
 * after `setupWorkflowBuilderTest`: Playwright runs the most recently
 * registered matching route first, and `fallback()` then hands the request to
 * the setup's handler, which adds the API key.
 */
async function holdDetailResponse(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname.endsWith(`/api/dynamic-nodes/${SLUG}`),
    async (route: Route) => {
      await released;
      await route.fallback();
    },
  );
  return release;
}

/**
 * The window's editor rows, top to bottom. Monaco positions its rows
 * absolutely and recycles them, so they are sorted by their box; it renders
 * spaces as non-breaking spaces. With word wrap on, each wrapped part of a
 * long line is a row of its own.
 */
async function windowEditorLines(page: Page): Promise<string[]> {
  return page
    .getByRole("dialog")
    .locator(".monaco-editor .view-lines .view-line")
    .evaluateAll((rows) =>
      rows
        .map((row) => ({
          top: row.getBoundingClientRect().top,
          text: (row.textContent ?? "").replace(/ /g, " "),
        }))
        .sort((a, b) => a.top - b.top)
        .map((row) => row.text),
    );
}

async function expectStepScript(page: Page, demo: Demo): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(`Editing ${SLUG}`)).toBeVisible();
  await expect(dialog.locator(".monaco-editor .view-lines")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () =>
      (await windowEditorLines(page)).find((line) => line.includes("@name")),
    )
    .toBe(` * @name ${SLUG}`);
  // Past the editor's 150 ms report-up debounce and the parent's echo: if
  // anything is going to overwrite the script, it has done so by now.
  await page.waitForTimeout(1_000);

  const lines = await windowEditorLines(page);
  // Compared without whitespace, so a line wrapped across rows reads the same
  // as the line it came from. The rows rendered are the top of the document.
  const squash = (text: string) => text.replace(/\s+/g, "");
  const shown = squash(lines.join(""));
  expect(shown.length, "the editor rendered almost nothing").toBeGreaterThan(
    200,
  );
  expect(
    squash(demo.headScript).slice(0, shown.length),
    "the editor should hold the step's own script",
  ).toBe(shown);
  expect(lines.join("\n")).not.toContain("@name my-custom-node");
  expect(lines.join("\n")).not.toContain("@description TODO");
  await expect(dialog.getByTestId("code-pane-strip-ok")).toContainText(
    `Signature OK: ${SLUG}`,
  );
}

test.describe("custom step — Edit script opens the step's own script", () => {
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
  });

  test.afterEach(() => {
    expect(pageErrors, "the page logged an uncaught error").toEqual([]);
  });

  test("from the step's settings", async ({ page, request }) => {
    test.setTimeout(90_000);
    const demo = await findDemo(request);
    test.skip(
      demo === null,
      "needs the seeded custom-node demo: run `node scripts/seed-feature-demos.mjs`",
    );
    if (demo === null) return;

    await setupWorkflowBuilderTest(page);
    const release = await holdDetailResponse(page);
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(demo.workflowId, 2);
    await editor.waitForViewToSettle();

    const { x, y } = await bringNodeIntoClear(page, demo.nodeId);
    await page.mouse.click(x, y);
    await page.getByTestId("dynamic-node-settings-edit-script").click();
    await expect(
      page.getByRole("dialog").getByTestId("dynamic-node-editor-loading"),
    ).toBeVisible();
    release();

    await expectStepScript(page, demo);
  });

  test("from the step's context menu", async ({ page, request }) => {
    test.setTimeout(90_000);
    const demo = await findDemo(request);
    test.skip(
      demo === null,
      "needs the seeded custom-node demo: run `node scripts/seed-feature-demos.mjs`",
    );
    if (demo === null) return;

    await setupWorkflowBuilderTest(page);
    const release = await holdDetailResponse(page);
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(demo.workflowId, 2);
    await editor.waitForViewToSettle();

    const { x, y } = await bringNodeIntoClear(page, demo.nodeId);
    await page.mouse.click(x, y, { button: "right" });
    await page.getByTestId("context-menu-edit-script").click();
    await expect(
      page.getByRole("dialog").getByTestId("dynamic-node-editor-loading"),
    ).toBeVisible();
    release();

    await expectStepScript(page, demo);
  });
});
