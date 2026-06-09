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
  readonly tryButton: Locator;
  readonly runButton: Locator;
  readonly moreButton: Locator;
  readonly menuHistory: Locator;
  readonly menuRunHistory: Locator;
  readonly menuSaveAsLibrary: Locator;
  readonly menuAutoArrange: Locator;
  readonly menuGroupSelected: Locator;
  readonly menuWorkflowSettings: Locator;

  // Drawers / modals
  readonly historyDrawer: Locator;
  readonly runDrawer: Locator;
  readonly saveAsLibraryModal: Locator;

  // Agent
  readonly agentIcon: Locator;

  constructor(page: Page) {
    this.page = page;
    this.saveButton = page.getByTestId("save-button");
    this.tryButton = page.getByTestId("try-button");
    this.runButton = page.getByTestId("run-this-workflow-button");
    this.moreButton = page.getByTestId("topbar-more-button");
    this.menuHistory = page.getByTestId("topbar-menu-history");
    this.menuRunHistory = page.getByTestId("topbar-menu-run-history");
    this.menuSaveAsLibrary = page.getByTestId("topbar-menu-save-as-library");
    this.menuAutoArrange = page.getByTestId("topbar-menu-auto-arrange");
    this.menuGroupSelected = page.getByTestId("topbar-menu-group-selected");
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
    await this.menuAutoArrange.waitFor({ state: "visible" });
  }

  async autoArrange(): Promise<void> {
    await this.openMoreMenu();
    await this.menuAutoArrange.click();
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
    const { x, y } = await bringNodeIntoClear(this.page, nodeId);
    await this.page.mouse.click(x, y);
    // Confirm selection landed (universal across node types) — the panel
    // testid is type-specific, so each test asserts its own.
    await this.page
      .locator(`.react-flow__node[data-id="${nodeId}"].selected`)
      .waitFor({ state: "visible" });
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
