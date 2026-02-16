import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Edit Split Dialog
 */
export class EditSplitDialog {
  readonly page: Page;

  // Dialog elements
  readonly dialog: Locator;
  readonly editSplitTypeBadge: Locator;
  readonly editSplitCurrentCount: Locator;
  readonly editSplitSamplesMultiselect: Locator;
  readonly editSplitSelectedCount: Locator;
  readonly editSplitError: Locator;
  readonly cancelBtn: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dialog = page.locator('[data-testid="edit-split-dialog"]');
    this.editSplitTypeBadge = page.locator('[data-testid="edit-split-type-badge"]');
    this.editSplitCurrentCount = page.locator('[data-testid="edit-split-current-count"]');
    this.editSplitSamplesMultiselect = page.locator('[data-testid="edit-split-samples-multiselect"]');
    this.editSplitSelectedCount = page.locator('[data-testid="edit-split-selected-count"]');
    this.editSplitError = page.locator('[data-testid="edit-split-error"]');
    this.cancelBtn = page.locator('[data-testid="edit-split-cancel-btn"]');
    this.submitBtn = page.locator('[data-testid="edit-split-submit-btn"]');
  }

  /**
   * Wait for dialog to be visible
   */
  async waitForDialog() {
    // Wait for the type badge to be visible (inside the modal)
    // This is more reliable than waiting for the modal root with Mantine transitions
    await this.editSplitTypeBadge.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Select samples by clicking the multiselect and choosing options
   * @param sampleIds - Array of sample IDs to select
   */
  async selectSamples(sampleIds: string[]) {
    // Click multiselect to open dropdown
    await this.editSplitSamplesMultiselect.click();
    await this.page.waitForTimeout(500);

    // Select each sample
    for (const sampleId of sampleIds) {
      const option = this.page.getByRole('option', { name: sampleId });
      await option.click();
    }

    // Click outside to close dropdown
    await this.page.keyboard.press('Escape');
  }

  /**
   * Submit the form to update split
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
   * Update split with new sample selection
   * @param sampleIds - Array of sample IDs
   */
  async updateSplit(sampleIds: string[]) {
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
    return await this.editSplitError.isVisible();
  }

  /**
   * Get error message text
   */
  async getErrorText(): Promise<string> {
    return await this.editSplitError.textContent() || '';
  }
}
