import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Baseline Threshold Configuration Dialog
 * Triggered by "Promote to Baseline" or "Edit Thresholds" buttons on Run Detail page
 */
export class BaselineThresholdDialog {
  readonly page: Page;

  // Dialog elements
  readonly dialog: Locator;
  readonly closeButton: Locator;

  // Warning alert
  readonly existingBaselineWarning: Locator;

  // Action buttons
  readonly cancelBtn: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Dialog container
    this.dialog = page.locator('[data-testid="baseline-threshold-dialog"]');
    this.closeButton = this.dialog.locator('button[aria-label="Close"]');

    // Warning
    this.existingBaselineWarning = page.locator('[data-testid="existing-baseline-warning"]');

    // Actions
    this.cancelBtn = page.locator('[data-testid="cancel-threshold-btn"]');
    this.submitBtn = page.locator('[data-testid="submit-threshold-btn"]');
  }

  /**
   * Get the threshold type dropdown for a specific metric
   */
  getThresholdTypeDropdown(metricName: string): Locator {
    return this.page.locator(`[data-testid="threshold-type-${metricName}"]`);
  }

  /**
   * Get the threshold value input for a specific metric
   */
  getThresholdValueInput(metricName: string): Locator {
    return this.page.locator(`[data-testid="threshold-value-${metricName}"]`);
  }

  /**
   * Set threshold configuration for a metric
   * @param metricName - Name of the metric
   * @param type - "relative" or "absolute"
   * @param value - Threshold value
   */
  async setThreshold(metricName: string, type: 'relative' | 'absolute', value: number) {
    const typeDropdown = this.getThresholdTypeDropdown(metricName);
    const valueInput = this.getThresholdValueInput(metricName);

    // Select threshold type
    await typeDropdown.click();
    const typeText = type === 'relative' ? 'Relative (%)' : 'Absolute';
    await this.page.getByRole('option', { name: typeText }).click();

    // Set threshold value
    await valueInput.clear();
    await valueInput.fill(value.toString());
  }

  /**
   * Click the cancel button
   */
  async clickCancel() {
    await this.cancelBtn.click();
  }

  /**
   * Click the submit button
   */
  async clickSubmit() {
    await this.submitBtn.click();
  }

  /**
   * Wait for the dialog to be visible
   * Note: Mantine modals have hidden root elements, so we wait for the submit button instead
   */
  async waitForDialog() {
    await this.submitBtn.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Wait for the dialog to be hidden
   * Wait for the submit button to be hidden as indicator the dialog closed
   */
  async waitForDialogClose() {
    await this.submitBtn.waitFor({ state: 'hidden', timeout: 10000 });
  }
}
