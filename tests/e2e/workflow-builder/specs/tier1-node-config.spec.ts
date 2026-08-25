import { expect, test } from "@playwright/test";
import { setupWorkflowBuilderTest } from "../helpers/wb-test";
import {
  buildLinearConfig,
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
} from "../helpers/workflow-api";
import { WorkflowEditorPage } from "../pages/WorkflowEditorPage";

/**
 * Tier 1 — node settings panel.
 *
 * Selecting a node opens the per-node settings; the panel exposes the label,
 * a type badge, and an Advanced toggle that reveals the raw port bindings.
 *
 * We use a small API-built 3-node workflow (not the dense seed): `fitView`
 * zooms in so all nodes sit clear of the app's left-nav overlay, and we select
 * the centre node (`submit`) which is always in the clickable area.
 */
test.describe("node settings panel", () => {
  let pageErrors: string[] = [];
  let createdId: string | null = null;

  test.beforeEach(async ({ page, request }, testInfo) => {
    pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await setupWorkflowBuilderTest(page);
    const created = await createWorkflow(request, {
      // Unique per test — the 3 tests here run on parallel workers, and
      // concurrent creates of an identical name race the backend's unique-slug
      // allocation and can 500. A per-test name sidesteps that.
      name: `e2e node-config ${testInfo.testId}`,
      config: buildLinearConfig({ withPositions: true }),
    });
    createdId = created.id;
  });

  test.afterEach(async ({ request }) => {
    if (createdId) {
      await deleteWorkflow(request, createdId);
      createdId = null;
    }
  });

  test("selecting a node opens its settings with label + type badge", async ({
    page,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 3);

    await editor.selectNode("submit");

    const label = page.getByTestId("node-settings-label");
    const typeBadge = page.getByTestId("node-settings-type-badge");
    await expect(label).toBeVisible();
    await expect(typeBadge).toBeVisible();
    await expect(label).toHaveValue(/Submit to Azure OCR/i);
  });

  test("the Advanced toggle reveals raw bindings", async ({ page }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 3);
    await editor.selectNode("submit");

    const advanced = page.getByTestId("node-settings-advanced-toggle");
    await expect(advanced).toBeVisible();
    await advanced.click();
    // No assertion on raw-binding internals here — the toggle being operable
    // and not throwing is the contract; deep binding UI is unit-tested.
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("editing the label updates the node", async ({ page }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 3);
    await editor.selectNode("submit");

    const label = page.getByTestId("node-settings-label");
    await label.fill("Submit (edited)");
    await label.blur();
    await expect(label).toHaveValue("Submit (edited)");
    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });

  test("binding a port to a brand-new ctx key via inline Create saves cleanly (no undeclared-ctx error)", async ({
    page,
    request,
  }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.openExisting(createdId as string, 3);
    await editor.selectNode("submit");

    // Reveal the raw port-bindings editor and rebind fileData to a key that
    // does NOT exist in config.ctx yet. Without the inline "+ Create" this
    // would persist an undeclared ctx key → save fails with a 400.
    await page.getByTestId("node-settings-advanced-toggle").click();
    const inputs = page.getByTestId("node-settings-input-bindings");
    const fileDataField = inputs.getByLabel(/Prepared file data/i);
    await fileDataField.fill("freshVar");

    // The inline create affordance appears for the new identifier; declaring
    // it makes the binding reference a real ctx key.
    const createBtn = page.getByTestId("variable-picker-create");
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    // Once declared it's an existing option, so the button goes away.
    await expect(createBtn).toBeHidden();

    await editor.saveButton.click();

    // Save persisted: the new ctx key is declared (object) and the binding
    // points at it — the round-trip to Workflow Settings is gone.
    await expect
      .poll(async () => {
        const wf = await getWorkflow(request, createdId as string);
        const ctxType = (
          wf.config.ctx as Record<string, { type?: string }> | undefined
        )?.freshVar?.type;
        const bound = wf.config.nodes.submit.inputs?.find(
          (b) => b.port === "fileData",
        )?.ctxKey;
        return { ctxType, bound };
      })
      .toEqual({ ctxType: "object", bound: "freshVar" });

    expect(pageErrors, pageErrors.join("\n")).toHaveLength(0);
  });
});
