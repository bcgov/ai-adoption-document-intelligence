import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for Create Definition Form Dialog
 * Opened from project detail page
 */
export class CreateDefinitionFormDialog {
  readonly page: Page;

  // Dialog
  readonly dialogTitle: Locator;
  readonly closeBtn: Locator;

  // Required fields
  readonly nameInput: Locator;
  readonly datasetVersionSelect: Locator;
  readonly splitSelect: Locator;
  readonly workflowSelect: Locator;
  readonly evaluatorTypeSelect: Locator;

  // Optional fields
  readonly evaluatorConfigTextarea: Locator;

  // Runtime settings
  readonly maxParallelDocsInput: Locator;
  readonly perDocTimeoutInput: Locator;
  readonly productionQueueNo: Locator;
  readonly productionQueueYes: Locator;

  // Artifact policy
  readonly artifactPolicyFull: Locator;
  readonly artifactPolicyFailures: Locator;
  readonly artifactPolicySampled: Locator;

  // Action buttons
  readonly cancelBtn: Locator;
  readonly createBtn: Locator;

  // Validation messages
  readonly nameError: Locator;
  readonly jsonError: Locator;

  constructor(page: Page) {
    this.page = page;

    // Dialog
    this.dialogTitle = page.getByRole('heading', { level: 2, name: 'Create Benchmark Definition' });
    this.closeBtn = page.locator('button').filter({ has: page.locator('img') }).first();

    // Required fields
    this.nameInput = page.locator('[data-testid="definition-name-input"]');
    this.datasetVersionSelect = page.locator('[data-testid="dataset-version-select"]');
    this.splitSelect = page.locator('[data-testid="split-select"]');
    this.workflowSelect = page.locator('[data-testid="workflow-select"]');
    this.evaluatorTypeSelect = page.locator('[data-testid="evaluator-type-select"]');

    // Optional fields
    this.evaluatorConfigTextarea = page.locator('[data-testid="evaluator-config-textarea"]');

    // Runtime settings
    this.maxParallelDocsInput = page.locator('[data-testid="max-parallel-documents-input"]');
    this.perDocTimeoutInput = page.locator('[data-testid="per-document-timeout-input"]');
    this.productionQueueNo = page.locator('[data-testid="production-queue-no"]');
    this.productionQueueYes = page.locator('[data-testid="production-queue-yes"]');

    // Artifact policy
    this.artifactPolicyFull = page.locator('[data-testid="artifact-policy-full"]');
    this.artifactPolicyFailures = page.locator('[data-testid="artifact-policy-failures"]');
    this.artifactPolicySampled = page.locator('[data-testid="artifact-policy-sampled"]');

    // Action buttons
    this.cancelBtn = page.locator('[data-testid="cancel-definition-btn"]');
    this.createBtn = page.locator('[data-testid="submit-definition-btn"]');

    // Validation messages
    this.nameError = page.getByText('Name is required');
    // Use role=alert to target the error message specifically
    this.jsonError = page.locator('p[id$="-error"]', { hasText: 'Invalid JSON' });
  }

  async waitForDialogToOpen() {
    await this.dialogTitle.waitFor({ state: 'visible' });
  }

  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  async selectDatasetVersion(versionText: string) {
    await this.datasetVersionSelect.click();
    await this.page.getByText(versionText, { exact: false }).first().click();
  }

  async selectSplit(splitText: string) {
    await this.splitSelect.click();
    await this.page.getByText(splitText, { exact: false }).first().click();
  }

  async selectWorkflow(workflowText: string) {
    await this.workflowSelect.click();
    await this.page.getByText(workflowText, { exact: false }).first().click();
  }

  async selectEvaluatorType(evaluatorType: string) {
    await this.evaluatorTypeSelect.click();
    await this.page.getByText(evaluatorType, { exact: false }).first().click();
  }

  async fillEvaluatorConfig(jsonConfig: string) {
    await this.evaluatorConfigTextarea.fill(jsonConfig);
  }

  async setMaxParallelDocs(value: string) {
    await this.maxParallelDocsInput.fill(value);
  }

  async setPerDocTimeout(value: string) {
    await this.perDocTimeoutInput.fill(value);
  }

  async selectProductionQueue(useProduction: boolean) {
    if (useProduction) {
      await this.productionQueueYes.click();
    } else {
      await this.productionQueueNo.click();
    }
  }

  async selectArtifactPolicy(policy: 'full' | 'failures' | 'sampled') {
    switch (policy) {
      case 'full':
        await this.artifactPolicyFull.click();
        break;
      case 'failures':
        await this.artifactPolicyFailures.click();
        break;
      case 'sampled':
        await this.artifactPolicySampled.click();
        break;
    }
  }

  async clickCreate() {
    const createRequestPromise = this.page.waitForResponse(
      response => response.url().includes('/definitions') && response.request().method() === 'POST',
      { timeout: 10000 }
    );

    await this.createBtn.click();

    // Wait for the POST request to complete
    const createResponse = await createRequestPromise;

    // Wait a bit for the refetch to complete
    await this.page.waitForLoadState('networkidle');

    return createResponse;
  }

  async clickCancel() {
    await this.cancelBtn.click();
  }

  /**
   * Complete helper to create a definition with all parameters
   */
  async createDefinition(params: {
    name: string;
    datasetVersion: string;
    split?: string;
    workflow: string;
    evaluatorType?: string;
    evaluatorConfig?: string;
    maxParallelDocs?: string;
    perDocTimeout?: string;
    useProductionQueue?: boolean;
    artifactPolicy?: 'full' | 'failures' | 'sampled';
  }) {
    await this.fillName(params.name);
    await this.selectDatasetVersion(params.datasetVersion);

    if (params.split) {
      await this.selectSplit(params.split);
    }

    await this.selectWorkflow(params.workflow);

    if (params.evaluatorType) {
      await this.selectEvaluatorType(params.evaluatorType);
    }

    if (params.evaluatorConfig) {
      await this.fillEvaluatorConfig(params.evaluatorConfig);
    }

    if (params.maxParallelDocs) {
      await this.setMaxParallelDocs(params.maxParallelDocs);
    }

    if (params.perDocTimeout) {
      await this.setPerDocTimeout(params.perDocTimeout);
    }

    if (params.useProductionQueue !== undefined) {
      await this.selectProductionQueue(params.useProductionQueue);
    }

    if (params.artifactPolicy) {
      await this.selectArtifactPolicy(params.artifactPolicy);
    }

    await this.clickCreate();
  }
}
