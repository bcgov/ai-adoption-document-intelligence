import { expect, Locator, Page } from "@playwright/test";
import { bringNodeIntoClear, waitForCanvasReady } from "../helpers/canvas";
import { FRONTEND_URL } from "../helpers/wb-test";

/**
 * Page Object for the V2 visual workflow editor
 * (/workflows/:id/edit and /workflows/create).
 */
export class WorkflowEditorPage {
  readonly page: Page;

  // Top bar
  readonly saveButton: Locator;
  // One run entry point since batch-four item 8 (2026-08-08): the separate
  // "Try" button (testid `try-button`) is gone — it opened the same drawer
  // this one does, on a different tab.
  readonly runButton: Locator;
  readonly moreButton: Locator;
  readonly menuHistory: Locator;
  readonly menuRunHistory: Locator;
  readonly menuSaveAsLibrary: Locator;
  readonly menuGroupSelected: Locator;
  readonly menuWorkflowSettings: Locator;

  // Visible centre-zone controls. Simplified view and Auto-arrange left the
  // More menu in the 2026-08-03 top-bar rebuild; both kept their old testids,
  // so the selectors still resolve — what changed is that they are reachable
  // without opening a menu first.
  readonly simplifiedViewToggle: Locator;
  readonly simplifiedViewWrapper: Locator;
  readonly autoArrangeButton: Locator;
  readonly fitViewButton: Locator;

  // Drawers / modals
  readonly historyDrawer: Locator;
  readonly runDrawer: Locator;
  readonly saveAsLibraryModal: Locator;

  // Agent
  readonly agentIcon: Locator;

  constructor(page: Page) {
    this.page = page;
    this.saveButton = page.getByTestId("save-button");
    this.runButton = page.getByTestId("run-this-workflow-button");
    this.moreButton = page.getByTestId("topbar-more-button");
    this.menuHistory = page.getByTestId("topbar-menu-history");
    this.menuRunHistory = page.getByTestId("topbar-menu-run-history");
    this.menuSaveAsLibrary = page.getByTestId("topbar-menu-save-as-library");
    this.menuGroupSelected = page.getByTestId("topbar-menu-group-selected");
    this.simplifiedViewToggle = page.getByTestId("simplified-view-toggle");
    this.simplifiedViewWrapper = page.getByTestId(
      "topbar-menu-simplified-view",
    );
    this.autoArrangeButton = page.getByTestId("topbar-menu-auto-arrange");
    this.fitViewButton = page.getByTestId("topbar-fit-view");
    this.menuWorkflowSettings = page.getByTestId(
      "topbar-menu-workflow-settings",
    );
    this.historyDrawer = page.getByTestId("history-drawer");
    this.runDrawer = page.getByTestId("run-workflow-drawer");
    this.saveAsLibraryModal = page.getByTestId("save-as-library-modal");
    this.agentIcon = page.getByTestId("agent-chat-icon");
  }

  /** Open an existing workflow by id and wait for the canvas to mount. */
  async openExisting(workflowId: string, minNodes = 1): Promise<void> {
    await this.page.goto(`${FRONTEND_URL}/workflows/${workflowId}/edit`);
    await this.page.waitForLoadState("networkidle");
    await waitForCanvasReady(this.page, minNodes);
  }

  async openMoreMenu(): Promise<void> {
    await this.moreButton.click();
    // Wait on an item the menu still owns. Auto-arrange used to be the anchor
    // here and is now a visible top-bar button, so waiting on it would hang.
    await this.menuWorkflowSettings.waitFor({ state: "visible" });
  }

  /** Click the visible Auto-arrange control (no menu involved). */
  async autoArrange(): Promise<void> {
    await this.autoArrangeButton.click();
  }

  /**
   * Drive the visible Simplified-view switch to an explicit state.
   *
   * The Mantine `Switch`'s real `<input>` is visually hidden off-viewport, so
   * the click has to land on its painted track. The switch is idempotent by
   * intent, not by construction — reading `isChecked()` first keeps a caller
   * that asks for `true` twice from toggling it back off.
   */
  async setSimplifiedView(on: boolean): Promise<void> {
    if ((await this.simplifiedViewToggle.isChecked()) === on) return;
    await this.simplifiedViewWrapper.locator(".mantine-Switch-track").click();
    await expect(this.simplifiedViewToggle).toBeChecked({ checked: on });
  }

  async openHistory(): Promise<void> {
    await this.openMoreMenu();
    await this.menuHistory.click();
    // The Mantine Drawer root (`history-drawer`) stays in the DOM but hidden;
    // wait for its body content (list/empty/loading) which only mounts on open.
    await this.page
      .locator(
        '[data-testid="history-drawer-list"], [data-testid="history-drawer-empty"], [data-testid="history-drawer-loading"]',
      )
      .first()
      .waitFor({ state: "visible" });
  }

  /** Open the Run history drawer and wait for its list (or empty state). */
  async openRunHistory(): Promise<void> {
    await this.openMoreMenu();
    await this.menuRunHistory.click();
    await this.page
      .locator(
        '[data-testid="run-history-drawer-list"], [data-testid="run-history-drawer-empty"]',
      )
      .first()
      .waitFor({ state: "visible" });
  }

  /**
   * Re-open the most recent run from Run history, putting the canvas into
   * replay mode.
   *
   * `RunStateProvider` starts every mount with `activeRunId = null` and
   * restores nothing, so after a reload this is the ONLY way back to a
   * finished run's statuses and cached previews — it is what the preview
   * surfaces' own copy tells the author to do ("re-open this run from the run
   * history"). Rows are newest-first; the row body itself is the replay
   * affordance (the Replay button on it fires the same handler).
   *
   * The `[data-status]` qualifier matters: several of a row's CHILDREN also
   * carry `run-row-`-prefixed testids (status dot, version pin, started,
   * input ctx, replay button), and only the row root has `data-status`.
   */
  async replayMostRecentRun(): Promise<void> {
    await this.openRunHistory();
    const firstRow = this.page
      .locator('[data-testid^="run-row-"][data-status]')
      .first();
    await firstRow.waitFor({ state: "visible" });
    await firstRow.click();
    await this.page
      .getByTestId("replay-mode-indicator")
      .waitFor({ state: "visible" });
  }

  async openSaveAsLibrary(): Promise<void> {
    await this.openMoreMenu();
    await this.menuSaveAsLibrary.click();
    // Mantine modal root stays hidden in the DOM; wait for the name field.
    await this.page
      .getByTestId("save-as-library-name")
      .waitFor({ state: "visible" });
  }

  /**
   * Select a node. React Flow drives selection off a real pointerdown→up at the
   * node's painted location (its `onSelectionChange` fires the panel), which a
   * Playwright `locator.click` (actionability-checked / force) doesn't reliably
   * produce. So we issue a genuine `mouse.click` at the node-center screen
   * coordinates.
   */
  async selectNode(nodeId: string): Promise<void> {
    // Under CPU load the fitView animation can still be moving nodes when the
    // click lands, so the coordinates read a beat earlier go stale and the
    // click hits empty pane. Re-read + re-click a few times before failing.
    const selected = this.page.locator(
      `.react-flow__node[data-id="${nodeId}"].selected`,
    );
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { x, y } = await bringNodeIntoClear(this.page, nodeId);
      await this.page.mouse.click(x, y);
      try {
        // Confirm selection landed (universal across node types) — the panel
        // testid is type-specific, so each test asserts its own.
        await selected.waitFor({ state: "visible", timeout: 5_000 });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /** Right-click a node to open its context menu. */
  async openNodeContextMenu(nodeId: string): Promise<void> {
    const { x, y } = await bringNodeIntoClear(this.page, nodeId);
    await this.page.mouse.click(x, y, { button: "right" });
    await this.page
      .getByTestId("node-context-menu")
      .waitFor({ state: "visible" });
  }

  async expectNoPageErrors(errors: string[]): Promise<void> {
    expect(errors, `page errors: ${errors.join("\n")}`).toHaveLength(0);
  }
}
