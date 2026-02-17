import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Create Split Dialog
 */
export class CreateSplitDialog {
  readonly page: Page;

  // Dialog elements
  readonly dialog: Locator;
  readonly splitNameInput: Locator;
  readonly splitTypeSelect: Locator;
  readonly splitSamplesMultiselect: Locator;
  readonly selectedSamplesCount: Locator;
  readonly createSplitError: Locator;
  readonly cancelBtn: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dialog = page.locator('[data-testid="create-split-dialog"]');
    this.splitNameInput = page.locator('[data-testid="split-name-input"]');
    this.splitTypeSelect = page.locator('[data-testid="split-type-select"]');
    this.splitSamplesMultiselect = page.locator('[data-testid="split-samples-multiselect"]');
    this.selectedSamplesCount = page.locator('[data-testid="selected-samples-count"]');
    this.createSplitError = page.locator('[data-testid="create-split-error"]');
    this.cancelBtn = page.locator('[data-testid="create-split-cancel-btn"]');
    this.submitBtn = page.locator('[data-testid="create-split-submit-btn"]');
  }

  /**
   * Wait for dialog to be visible
   */
  async waitForDialog() {
    // Wait for the name input to be visible (inside the modal)
    // This is more reliable than waiting for the modal root with Mantine transitions
    await this.splitNameInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Fill split name
   * @param name - The split name
   */
  async fillName(name: string) {
    await this.splitNameInput.fill(name);
  }

  /**
   * Select split type
   * @param type - The split type (Train, Validation, Test, Golden Regression)
   */
  async selectType(type: string) {
    await this.splitTypeSelect.click();
    // Wait for dropdown to open
    await this.page.waitForTimeout(300);
    // Find and click the option
    const option = this.page.getByRole('option', { name: type, exact: true });
    await option.click();
  }

  /**
   * Select samples by clicking the multiselect and choosing options
   * @param sampleIds - Array of sample IDs to select
   */
  async selectSamples(sampleIds: string[]) {
    // Click multiselect to open dropdown
    await this.splitSamplesMultiselect.click();
    await this.page.waitForTimeout(500);

    // Select each sample
    for (const sampleId of sampleIds) {
      const option = this.page.getByRole('option', { name: sampleId, exact: true });
      await option.click();
    }

    // Click outside to close dropdown
    await this.page.keyboard.press('Escape');
  }

  /**
   * Submit the form to create split
   */
  async submit() {
    await this.submitBtn.click();
  }

  /**
   * Cancel and close the dialog
   */
  async cancel() {
    await this.cancelBtn.click();
  }

  /**
   * Create a split with the given details
   * @param name - Split name
   * @param type - Split type
   * @param sampleIds - Array of sample IDs
   */
  async createSplit(name: string, type: string, sampleIds: string[]) {
    await this.fillName(name);
    await this.selectType(type);
    await this.selectSamples(sampleIds);
    await this.submit();
    // Wait for dialog to close
    await this.dialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /**
   * Check if dialog is visible
   */
  async isVisible(): Promise<boolean> {
    return await this.dialog.isVisible();
  }

  /**
   * Check if error message is displayed
   */
  async hasError(): Promise<boolean> {
    return await this.createSplitError.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorText(): Promise<string> {
    return await this.createSplitError.textContent() || '';
  }
}
