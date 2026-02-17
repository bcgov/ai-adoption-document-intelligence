import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import {
  FieldType,
  PrismaClient,
  ProjectStatus,
  DatasetVersionStatus,
  SplitType,
  BenchmarkRunStatus,
  AuditAction,
} from "../../backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../backend-services/src/utils/database-url";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const prisma = new PrismaClient({
  adapter: new PrismaPg(getPrismaPgOptions(process.env.DATABASE_URL)),
});

const SDPR_TEMPLATE_PROJECT_ID = "seed-sdpr-monthly-report-template";
const SDPR_TEMPLATE_PROJECT_NAME = "SDPR monthly report template";
const SDPR_TEMPLATE_PROJECT_DESCRIPTION =
  "Seeded labeling project for SDPR monthly report template training.";
const SDPR_TEMPLATE_PROJECT_CREATED_BY = "seed";

type SeedFieldDefinition = {
  fieldKey: string;
  fieldType: FieldType;
  fieldFormat?: string;
};

const SDPR_MONTHLY_REPORT_FIELDS: SeedFieldDefinition[] = [
  { fieldKey: "checkbox_need_assistance_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_need_assistance_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_family_assets_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_family_assets_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_shelter_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_shelter_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_dependants_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_dependants_no", fieldType: FieldType.selectionMark },

  {
    fieldKey: "checkbox_employment_changes_yes",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_no",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_spouse_yes",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_spouse_no",
    fieldType: FieldType.selectionMark,
  },

  { fieldKey: "checkbox_school_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_spouse_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_work_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_souse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_souse_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_moved_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_spouse_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_spouse_no", fieldType: FieldType.selectionMark },
  { fieldKey: "explain_changes", fieldType: FieldType.string },
  { fieldKey: "signature", fieldType: FieldType.string },
  { fieldKey: "spouse_signature", fieldType: FieldType.string },
  { fieldKey: "date", fieldType: FieldType.date, fieldFormat: "dmy" },
  { fieldKey: "spouse_date", fieldType: FieldType.date, fieldFormat: "dmy" },
  { fieldKey: "name", fieldType: FieldType.string },
  { fieldKey: "spouse_name", fieldType: FieldType.string },
  { fieldKey: "phone", fieldType: FieldType.string },
  { fieldKey: "spouse_phone", fieldType: FieldType.string },
  { fieldKey: "sin", fieldType: FieldType.string },
  { fieldKey: "spouse_sin", fieldType: FieldType.string },
  { fieldKey: "applicant_net_employment_income", fieldType: FieldType.number },
  { fieldKey: "applicant_employment_insurance", fieldType: FieldType.number },
  {
    fieldKey: "applicant_spousal_support_alimony",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_child_support", fieldType: FieldType.number },
  { fieldKey: "applicant_workbc_financial_support", fieldType: FieldType.number },
  {
    fieldKey: "applicant_student_funding_loans_bursaries",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_rental_income", fieldType: FieldType.number },
  { fieldKey: "applicant_room_board_income", fieldType: FieldType.number },
  { fieldKey: "applicant_workers_compensation", fieldType: FieldType.number },
  {
    fieldKey: "applicant_private_pensions_retirement_disability",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_oas_gis", fieldType: FieldType.number },
  { fieldKey: "applicant_trust_income", fieldType: FieldType.number },
  {
    fieldKey: "applicant_canada_pension_plan_cpp",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_tax_credits_gst_credit", fieldType: FieldType.number },
  { fieldKey: "applicant_child_tax_benefits", fieldType: FieldType.number },
  { fieldKey: "applicant_income_tax_refund", fieldType: FieldType.number },
  {
    fieldKey: "applicant_other_income_money_received",
    fieldType: FieldType.number,
  },
  {
    fieldKey: "applicant_income_of_dependent_children",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_net_employment_income", fieldType: FieldType.number },
  { fieldKey: "spouse_employment_insurance", fieldType: FieldType.number },
  { fieldKey: "spouse_spousal_support_alimony", fieldType: FieldType.number },
  { fieldKey: "spouse_child_support", fieldType: FieldType.number },
  { fieldKey: "spouse_workbc_financial_support", fieldType: FieldType.number },
  {
    fieldKey: "spouse_student_funding_loans_bursaries",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_rental_income", fieldType: FieldType.number },
  { fieldKey: "spouse_room_board_income", fieldType: FieldType.number },
  { fieldKey: "spouse_workers_compensation", fieldType: FieldType.number },
  {
    fieldKey: "spouse_private_pensions_retirement_disability",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_oas_gis", fieldType: FieldType.number },
  { fieldKey: "spouse_trust_income", fieldType: FieldType.number },
  { fieldKey: "spouse_canada_pension_plan_cpp", fieldType: FieldType.number },
  { fieldKey: "spouse_tax_credits_gst_credit", fieldType: FieldType.number },
  { fieldKey: "spouse_child_tax_benefits", fieldType: FieldType.number },
  { fieldKey: "spouse_income_tax_refund", fieldType: FieldType.number },
  { fieldKey: "spouse_other_income_money_received", fieldType: FieldType.number },
  { fieldKey: "spouse_income_of_dependent_children", fieldType: FieldType.number },
];

// ========== BENCHMARKING SEED DATA ==========

const SEED_WORKFLOW_ID = "seed-workflow-standard-ocr";
const SEED_DATASET_ID = "seed-dataset-invoices";
const SEED_DATASET_ID_2 = "seed-dataset-receipts";
const SEED_DATASET_ID_3 = "seed-dataset-forms";
const SEED_DATASET_VERSION_ID = "seed-dataset-version-v1.0";
const SEED_DATASET_VERSION_ID_DRAFT = "seed-dataset-version-v2.0-draft";
const SEED_DATASET_VERSION_ID_ARCHIVED = "seed-dataset-version-v0.9-archived";
const SEED_SPLIT_ID = "seed-split-train";
const SEED_SPLIT_ID_VAL = "seed-split-val";
const SEED_SPLIT_ID_TEST = "seed-split-test";
const SEED_SPLIT_ID_GOLDEN = "seed-split-golden-unfrozen";
const SEED_PROJECT_ID = "seed-project-invoice-extraction";
const SEED_DEFINITION_ID = "seed-definition-baseline";
const SEED_RUN_ID_COMPLETED = "seed-run-completed-001";
const SEED_RUN_ID_RUNNING = "seed-run-running-002";
const SEED_RUN_ID_FAILED = "seed-run-failed-003";
const SEED_RUN_ID_PASSING = "seed-run-passing-004";
const SEED_RUN_ID_REGRESSED = "seed-run-regressed-005";
const SEED_ARTIFACT_ID_JSON = "seed-artifact-json-001";
const SEED_ARTIFACT_ID_IMAGE = "seed-artifact-image-001";
const SEED_ARTIFACT_ID_TEXT = "seed-artifact-text-001";
const SEED_ARTIFACT_ID_UNSUPPORTED = "seed-artifact-unsupported-001";

/**
 * Create a test dataset repository with manifest and sample data
 * @returns The actual git commit hash of the created manifest
 */
async function createTestDatasetRepo(
  repoPath: string,
  manifestPath: string,
  sampleCount: number,
): Promise<string> {
  // Create directory if it doesn't exist
  if (!fs.existsSync(repoPath)) {
    fs.mkdirSync(repoPath, { recursive: true });
  }

  // Initialize Git repository
  try {
    execSync("git init", { cwd: repoPath, stdio: "ignore" });
    execSync('git config user.email "seed@test.com"', {
      cwd: repoPath,
      stdio: "ignore",
    });
    execSync('git config user.name "Seed Script"', {
      cwd: repoPath,
      stdio: "ignore",
    });
  } catch (error) {
    // Repo might already exist, continue
  }

  // Create manifest with samples
  const manifest = {
    schemaVersion: "1.0",
    samples: Array.from({ length: sampleCount }, (_, i) => ({
      id: `sample-${String(i + 1).padStart(3, "0")}`,
      inputs: [
        {
          path: `inputs/document_${String(i + 1).padStart(3, "0")}.pdf`,
          mimeType: "application/pdf",
        },
      ],
      groundTruth: [
        {
          path: `ground-truth/data_${String(i + 1).padStart(3, "0")}.json`,
          format: "json",
        },
      ],
      metadata: {
        docType: i % 3 === 0 ? "invoice" : i % 3 === 1 ? "receipt" : "form",
        pageCount: Math.floor(Math.random() * 5) + 1,
        language: "en",
        source: "synthetic",
      },
    })),
  };

  // Write manifest file
  const manifestFullPath = path.join(repoPath, manifestPath);
  const manifestDir = path.dirname(manifestFullPath);
  if (!fs.existsSync(manifestDir)) {
    fs.mkdirSync(manifestDir, { recursive: true });
  }
  fs.writeFileSync(manifestFullPath, JSON.stringify(manifest, null, 2));

  // Create actual ground truth JSON files
  const groundTruthDir = path.join(repoPath, "ground-truth");
  if (!fs.existsSync(groundTruthDir)) {
    fs.mkdirSync(groundTruthDir, { recursive: true });
  }

  for (let i = 0; i < sampleCount; i++) {
    const groundTruthData = {
      invoice_number: `INV-2024-${String(i + 1).padStart(3, "0")}`,
      total_amount: Math.round((Math.random() * 5000 + 100) * 100) / 100,
      date: new Date(2024, 0, i + 1).toISOString().split("T")[0],
      vendor: ["Acme Corp", "TechSupply Inc", "Office Depot", "Global Services"][
        i % 4
      ],
    };

    const groundTruthPath = path.join(
      groundTruthDir,
      `data_${String(i + 1).padStart(3, "0")}.json`,
    );
    fs.writeFileSync(groundTruthPath, JSON.stringify(groundTruthData, null, 2));
  }

  // Commit manifest and ground truth files
  try {
    execSync(`git add "${manifestPath}" ground-truth/`, {
      cwd: repoPath,
      stdio: "ignore",
    });
    execSync(`git commit -m "Add manifest with ${sampleCount} samples"`, {
      cwd: repoPath,
      stdio: "ignore",
    });
  } catch (error) {
    // Commit might already exist, continue
  }

  // Get the current commit hash
  const commitHash = execSync("git rev-parse HEAD", {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();

  return commitHash;
}

async function seedBenchmarkingData() {
  // Create a workflow if it doesn't exist
  const workflow = await prisma.workflow.upsert({
    where: { id: SEED_WORKFLOW_ID },
    update: {
      name: "Standard OCR Workflow",
      description: "Standard OCR processing workflow for testing",
      user_id: "test-user",
      config: {
        nodes: [
          { id: "start", type: "start" },
          { id: "ocr", type: "activity", activityType: "document.ocr" },
          { id: "end", type: "end" },
        ],
        edges: [
          { from: "start", to: "ocr" },
          { from: "ocr", to: "end" },
        ],
      },
      version: 1,
    },
    create: {
      id: SEED_WORKFLOW_ID,
      name: "Standard OCR Workflow",
      description: "Standard OCR processing workflow for testing",
      user_id: "test-user",
      config: {
        nodes: [
          { id: "start", type: "start" },
          { id: "ocr", type: "activity", activityType: "document.ocr" },
          { id: "end", type: "end" },
        ],
        edges: [
          { from: "start", to: "ocr" },
          { from: "ocr", to: "end" },
        ],
      },
      version: 1,
    },
  });

  // Create test dataset repositories with sample data
  // This enables e2e tests that require actual samples
  const invoiceRepoCommitHash = await createTestDatasetRepo(
    "/tmp/datasets/invoices",
    "data/invoices/manifest.json",
    25, // Create 25 samples to test pagination (>20)
  );

  // Create datasets
  const dataset = await prisma.dataset.upsert({
    where: { id: SEED_DATASET_ID },
    update: {
      name: "Invoice Test Dataset",
      description: "Sample invoice dataset for benchmarking OCR accuracy",
      metadata: { documentType: "invoice", language: "en" },
      repositoryUrl: "file:///tmp/datasets/invoices",
      dvcRemote: "local",
      createdBy: "test-user",
    },
    create: {
      id: SEED_DATASET_ID,
      name: "Invoice Test Dataset",
      description: "Sample invoice dataset for benchmarking OCR accuracy",
      metadata: { documentType: "invoice", language: "en" },
      repositoryUrl: "file:///tmp/datasets/invoices",
      dvcRemote: "local",
      createdBy: "test-user",
    },
  });

  const dataset2 = await prisma.dataset.upsert({
    where: { id: SEED_DATASET_ID_2 },
    update: {
      name: "Receipt Test Dataset",
      description: "Sample receipt dataset for testing point-of-sale OCR",
      metadata: { documentType: "receipt", language: "en" },
      repositoryUrl: "~/datasets/receipts",
      dvcRemote: "local",
      createdBy: "seed-user",
    },
    create: {
      id: SEED_DATASET_ID_2,
      name: "Receipt Test Dataset",
      description: "Sample receipt dataset for testing point-of-sale OCR",
      metadata: { documentType: "receipt", language: "en" },
      repositoryUrl: "~/datasets/receipts",
      dvcRemote: "local",
      createdBy: "seed-user",
    },
  });

  const dataset3 = await prisma.dataset.upsert({
    where: { id: SEED_DATASET_ID_3 },
    update: {
      name: "Government Forms Dataset",
      description: "Dataset for evaluating structured form extraction",
      metadata: { documentType: "government-form", language: "en" },
      repositoryUrl: "https://github.com/example/gov-forms-dataset.git",
      dvcRemote: "origin",
      createdBy: "seed-user",
    },
    create: {
      id: SEED_DATASET_ID_3,
      name: "Government Forms Dataset",
      description: "Dataset for evaluating structured form extraction",
      metadata: { documentType: "government-form", language: "en" },
      repositoryUrl: "https://github.com/example/gov-forms-dataset.git",
      dvcRemote: "origin",
      createdBy: "seed-user",
    },
  });

  // Create a dataset version - published (middle creation date)
  const datasetVersion = await prisma.datasetVersion.upsert({
    where: { id: SEED_DATASET_VERSION_ID },
    update: {
      version: "v1.0",
      gitRevision: invoiceRepoCommitHash,
      manifestPath: "data/invoices/manifest.json",
      documentCount: 25, // Matches the actual sample count created
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date", "vendor"],
      },
      status: DatasetVersionStatus.published,
      publishedAt: new Date("2026-01-15"),
      createdAt: new Date("2026-01-10T00:00:00Z"),
    },
    create: {
      id: SEED_DATASET_VERSION_ID,
      datasetId: dataset.id,
      version: "v1.0",
      gitRevision: invoiceRepoCommitHash,
      manifestPath: "data/invoices/manifest.json",
      documentCount: 25, // Matches the actual sample count created
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date", "vendor"],
      },
      status: DatasetVersionStatus.published,
      publishedAt: new Date("2026-01-15"),
      createdAt: new Date("2026-01-10T00:00:00Z"),
    },
  });

  // Create a draft version (newest creation date)
  await prisma.datasetVersion.upsert({
    where: { id: SEED_DATASET_VERSION_ID_DRAFT },
    update: {
      version: "v2.0-draft",
      gitRevision: "def789ghi012",
      manifestPath: "data/invoices/manifest-v2.json",
      documentCount: 200,
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date", "vendor", "line_items"],
      },
      status: DatasetVersionStatus.draft,
      publishedAt: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
    create: {
      id: SEED_DATASET_VERSION_ID_DRAFT,
      datasetId: dataset.id,
      version: "v2.0-draft",
      gitRevision: "def789ghi012",
      manifestPath: "data/invoices/manifest-v2.json",
      documentCount: 200,
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date", "vendor", "line_items"],
      },
      status: DatasetVersionStatus.draft,
      publishedAt: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
  });

  // Create an archived version (oldest creation date)
  await prisma.datasetVersion.upsert({
    where: { id: SEED_DATASET_VERSION_ID_ARCHIVED },
    update: {
      version: "v0.9",
      gitRevision: "xyz456abc789",
      manifestPath: "data/invoices/manifest-v0.9.json",
      documentCount: 100,
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date"],
      },
      status: DatasetVersionStatus.archived,
      publishedAt: new Date("2025-12-01"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    create: {
      id: SEED_DATASET_VERSION_ID_ARCHIVED,
      datasetId: dataset.id,
      version: "v0.9",
      gitRevision: "xyz456abc789",
      manifestPath: "data/invoices/manifest-v0.9.json",
      documentCount: 100,
      groundTruthSchema: {
        fields: ["invoice_number", "total_amount", "date"],
      },
      status: DatasetVersionStatus.archived,
      publishedAt: new Date("2025-12-01"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  });

  // Create splits for testing
  const split = await prisma.split.upsert({
    where: { id: SEED_SPLIT_ID },
    update: {
      name: "train",
      type: SplitType.train,
      sampleIds: Array.from({ length: 100 }, (_, i) => `sample-${i + 1}`),
      stratificationRules: { stratifyBy: "vendor" },
      frozen: true,
    },
    create: {
      id: SEED_SPLIT_ID,
      datasetVersionId: datasetVersion.id,
      name: "train",
      type: SplitType.train,
      sampleIds: Array.from({ length: 100 }, (_, i) => `sample-${i + 1}`),
      stratificationRules: { stratifyBy: "vendor" },
      frozen: true,
      createdAt: new Date("2026-01-05T00:00:00Z"),
    },
  });

  // Validation split (unfrozen, for testing edit functionality)
  await prisma.split.upsert({
    where: { id: SEED_SPLIT_ID_VAL },
    update: {
      name: "validation",
      type: SplitType.val,
      sampleIds: Array.from({ length: 30 }, (_, i) => `sample-${i + 101}`),
      frozen: false,
    },
    create: {
      id: SEED_SPLIT_ID_VAL,
      datasetVersionId: datasetVersion.id,
      name: "validation",
      type: SplitType.val,
      sampleIds: Array.from({ length: 30 }, (_, i) => `sample-${i + 101}`),
      frozen: false,
      createdAt: new Date("2026-01-10T00:00:00Z"),
    },
  });

  // Test split (frozen, to test that frozen splits can't be edited)
  await prisma.split.upsert({
    where: { id: SEED_SPLIT_ID_TEST },
    update: {
      name: "test",
      type: SplitType.test,
      sampleIds: Array.from({ length: 50 }, (_, i) => `sample-${i + 131}`),
      frozen: true,
    },
    create: {
      id: SEED_SPLIT_ID_TEST,
      datasetVersionId: datasetVersion.id,
      name: "test",
      type: SplitType.test,
      sampleIds: Array.from({ length: 50 }, (_, i) => `sample-${i + 131}`),
      frozen: true,
      createdAt: new Date("2026-01-15T00:00:00Z"),
    },
  });

  // Golden regression split (unfrozen, for testing freeze functionality)
  await prisma.split.upsert({
    where: { id: SEED_SPLIT_ID_GOLDEN },
    update: {
      name: "golden-regression-v1",
      type: SplitType.golden,
      sampleIds: Array.from({ length: 20 }, (_, i) => `sample-${i + 181}`),
      frozen: false,
    },
    create: {
      id: SEED_SPLIT_ID_GOLDEN,
      datasetVersionId: datasetVersion.id,
      name: "golden-regression-v1",
      type: SplitType.golden,
      sampleIds: Array.from({ length: 20 }, (_, i) => `sample-${i + 181}`),
      frozen: false,
      createdAt: new Date("2026-01-20T00:00:00Z"),
    },
  });

  // Create a benchmark project
  const project = await prisma.benchmarkProject.upsert({
    where: { id: SEED_PROJECT_ID },
    update: {
      name: "Invoice Extraction Benchmark",
      description: "Benchmarking OCR accuracy on invoice documents",
      mlflowExperimentId: "1",
      createdBy: "test-user",
    },
    create: {
      id: SEED_PROJECT_ID,
      name: "Invoice Extraction Benchmark",
      description: "Benchmarking OCR accuracy on invoice documents",
      mlflowExperimentId: "1",
      createdBy: "test-user",
    },
  });

  // Create a benchmark definition
  const definition = await prisma.benchmarkDefinition.upsert({
    where: { id: SEED_DEFINITION_ID },
    update: {
      name: "Baseline OCR Model",
      workflowConfigHash: "hash-abc123",
      evaluatorType: "field-accuracy",
      evaluatorConfig: {
        metrics: ["field_accuracy", "character_accuracy", "word_accuracy"],
      },
      runtimeSettings: {
        timeout: 300,
        retries: 3,
      },
      artifactPolicy: {
        saveOutputs: true,
        saveIntermediateResults: false,
      },
      immutable: false,
      revision: 1,
      scheduleEnabled: false,
    },
    create: {
      id: SEED_DEFINITION_ID,
      projectId: project.id,
      name: "Baseline OCR Model",
      datasetVersionId: datasetVersion.id,
      splitId: split.id,
      workflowId: workflow.id,
      workflowConfigHash: "hash-abc123",
      evaluatorType: "field-accuracy",
      evaluatorConfig: {
        metrics: ["field_accuracy", "character_accuracy", "word_accuracy"],
      },
      runtimeSettings: {
        timeout: 300,
        retries: 3,
      },
      artifactPolicy: {
        saveOutputs: true,
        saveIntermediateResults: false,
      },
      immutable: false,
      revision: 1,
      scheduleEnabled: false,
    },
  });

  // Create completed run with drill-down data
  const perSampleResults = [];
  const docTypes = ["invoice", "form", "receipt", "contract"];
  const languages = ["en", "fr", "es"];
  const sources = ["scan", "digital", "mobile"];

  for (let i = 0; i < 50; i++) {
    const docType = docTypes[i % docTypes.length];
    const language = languages[Math.floor(i / docTypes.length) % languages.length];
    const source = sources[Math.floor(i / (docTypes.length * languages.length)) % sources.length];
    const pageCount = Math.floor(Math.random() * 10) + 1;

    perSampleResults.push({
      sampleId: `sample-${String(i + 1).padStart(3, "0")}`,
      metadata: {
        docType,
        language,
        source,
        pageCount,
        customField: `custom-${i % 3}`,
      },
      metrics: {
        field_accuracy: 0.75 + Math.random() * 0.25,
        character_accuracy: 0.85 + Math.random() * 0.15,
        word_accuracy: 0.80 + Math.random() * 0.20,
      },
    });
  }

  await prisma.benchmarkRun.upsert({
    where: { id: SEED_RUN_ID_COMPLETED },
    update: {
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-001",
      temporalWorkflowId: "temporal-wf-001",
      workerGitSha: "git-sha-001",
      startedAt: new Date("2026-02-10T10:00:00Z"),
      completedAt: new Date("2026-02-10T10:45:00Z"),
      metrics: {
        field_accuracy: 0.95,
        character_accuracy: 0.98,
        word_accuracy: 0.96,
        perSampleResults,
        fieldErrorBreakdown: [
          { fieldName: "invoice_number", errorCount: 5, errorRate: 0.1 },
          { fieldName: "total_amount", errorCount: 3, errorRate: 0.06 },
          { fieldName: "vendor_name", errorCount: 8, errorRate: 0.16 },
          { fieldName: "invoice_date", errorCount: 2, errorRate: 0.04 },
        ],
        errorClusters: {
          "low_confidence": 12,
          "missing_field": 8,
          "format_mismatch": 5,
          "ocr_error": 7,
        },
      },
      params: {
        model: "prebuilt-layout",
        confidence_threshold: 0.8,
      },
      tags: {
        environment: "test",
        version: "v1.0",
      },
      isBaseline: true,
      baselineThresholds: [
        { metricName: "field_accuracy", type: "relative", value: 0.95 },
        { metricName: "character_accuracy", type: "relative", value: 0.95 },
        { metricName: "word_accuracy", type: "relative", value: 0.95 },
      ],
    },
    create: {
      id: SEED_RUN_ID_COMPLETED,
      definitionId: definition.id,
      projectId: project.id,
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-001",
      temporalWorkflowId: "temporal-wf-001",
      workerGitSha: "git-sha-001",
      startedAt: new Date("2026-02-10T10:00:00Z"),
      completedAt: new Date("2026-02-10T10:45:00Z"),
      metrics: {
        field_accuracy: 0.95,
        character_accuracy: 0.98,
        word_accuracy: 0.96,
        perSampleResults,
        fieldErrorBreakdown: [
          { fieldName: "invoice_number", errorCount: 5, errorRate: 0.1 },
          { fieldName: "total_amount", errorCount: 3, errorRate: 0.06 },
          { fieldName: "vendor_name", errorCount: 8, errorRate: 0.16 },
          { fieldName: "invoice_date", errorCount: 2, errorRate: 0.04 },
        ],
        errorClusters: {
          "low_confidence": 12,
          "missing_field": 8,
          "format_mismatch": 5,
          "ocr_error": 7,
        },
      },
      params: {
        model: "prebuilt-layout",
        confidence_threshold: 0.8,
      },
      tags: {
        environment: "test",
        version: "v1.0",
      },
      isBaseline: true,
      baselineThresholds: [
        { metricName: "field_accuracy", type: "relative", value: 0.95 },
        { metricName: "character_accuracy", type: "relative", value: 0.95 },
        { metricName: "word_accuracy", type: "relative", value: 0.95 },
      ],
    },
  });

  // Create running run
  await prisma.benchmarkRun.upsert({
    where: { id: SEED_RUN_ID_RUNNING },
    update: {
      status: BenchmarkRunStatus.running,
      mlflowRunId: "mlflow-run-002",
      temporalWorkflowId: "temporal-wf-002",
      workerGitSha: "git-sha-002",
      startedAt: new Date("2026-02-15T09:00:00Z"),
      params: {
        model: "prebuilt-layout",
        confidence_threshold: 0.85,
      },
      tags: {
        environment: "test",
        version: "v1.1",
      },
      isBaseline: false,
    },
    create: {
      id: SEED_RUN_ID_RUNNING,
      definitionId: definition.id,
      projectId: project.id,
      status: BenchmarkRunStatus.running,
      mlflowRunId: "mlflow-run-002",
      temporalWorkflowId: "temporal-wf-002",
      workerGitSha: "git-sha-002",
      startedAt: new Date("2026-02-15T09:00:00Z"),
      params: {
        model: "prebuilt-layout",
        confidence_threshold: 0.85,
      },
      tags: {
        environment: "test",
        version: "v1.1",
      },
      isBaseline: false,
    },
  });

  // Create failed run
  await prisma.benchmarkRun.upsert({
    where: { id: SEED_RUN_ID_FAILED },
    update: {
      status: BenchmarkRunStatus.failed,
      mlflowRunId: "mlflow-run-003",
      temporalWorkflowId: "temporal-wf-003",
      workerGitSha: "git-sha-003",
      startedAt: new Date("2026-02-12T14:00:00Z"),
      completedAt: new Date("2026-02-12T14:05:00Z"),
      error: "Dataset loading failed: File not found",
      params: {
        model: "custom-model",
        confidence_threshold: 0.9,
      },
      tags: {
        environment: "test",
        version: "v1.0-beta",
      },
      isBaseline: false,
    },
    create: {
      id: SEED_RUN_ID_FAILED,
      definitionId: definition.id,
      projectId: project.id,
      status: BenchmarkRunStatus.failed,
      mlflowRunId: "mlflow-run-003",
      temporalWorkflowId: "temporal-wf-003",
      workerGitSha: "git-sha-003",
      startedAt: new Date("2026-02-12T14:00:00Z"),
      completedAt: new Date("2026-02-12T14:05:00Z"),
      error: "Dataset loading failed: File not found",
      params: {
        model: "custom-model",
        confidence_threshold: 0.9,
      },
      tags: {
        environment: "test",
        version: "v1.0-beta",
      },
      isBaseline: false,
    },
  });

  // Create passing run (meets baseline thresholds)
  await prisma.benchmarkRun.upsert({
    where: { id: SEED_RUN_ID_PASSING },
    update: {
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-004",
      temporalWorkflowId: "temporal-wf-004",
      workerGitSha: "git-sha-004",
      startedAt: new Date("2026-02-14T10:00:00Z"),
      completedAt: new Date("2026-02-14T10:50:00Z"),
      metrics: {
        field_accuracy: 0.96,
        character_accuracy: 0.98,
        word_accuracy: 0.97,
      },
      params: {
        model: "prebuilt-layout-v2",
        confidence_threshold: 0.85,
      },
      tags: {
        environment: "test",
        version: "v1.2",
      },
      isBaseline: false,
      baselineComparison: {
        baselineRunId: SEED_RUN_ID_COMPLETED,
        overallPassed: true,
        regressedMetrics: [],
        metricComparisons: [
          {
            metricName: "field_accuracy",
            currentValue: 0.96,
            baselineValue: 0.95,
            delta: 0.01,
            deltaPercent: 1.05,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "character_accuracy",
            currentValue: 0.98,
            baselineValue: 0.98,
            delta: 0.0,
            deltaPercent: 0.0,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "word_accuracy",
            currentValue: 0.97,
            baselineValue: 0.96,
            delta: 0.01,
            deltaPercent: 1.04,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
        ],
      },
    },
    create: {
      id: SEED_RUN_ID_PASSING,
      definitionId: definition.id,
      projectId: project.id,
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-004",
      temporalWorkflowId: "temporal-wf-004",
      workerGitSha: "git-sha-004",
      startedAt: new Date("2026-02-14T10:00:00Z"),
      completedAt: new Date("2026-02-14T10:50:00Z"),
      metrics: {
        field_accuracy: 0.96,
        character_accuracy: 0.98,
        word_accuracy: 0.97,
      },
      params: {
        model: "prebuilt-layout-v2",
        confidence_threshold: 0.85,
      },
      tags: {
        environment: "test",
        version: "v1.2",
      },
      isBaseline: false,
      baselineComparison: {
        baselineRunId: SEED_RUN_ID_COMPLETED,
        overallPassed: true,
        regressedMetrics: [],
        metricComparisons: [
          {
            metricName: "field_accuracy",
            currentValue: 0.96,
            baselineValue: 0.95,
            delta: 0.01,
            deltaPercent: 1.05,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "character_accuracy",
            currentValue: 0.98,
            baselineValue: 0.98,
            delta: 0.0,
            deltaPercent: 0.0,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "word_accuracy",
            currentValue: 0.97,
            baselineValue: 0.96,
            delta: 0.01,
            deltaPercent: 1.04,
            passed: true,
            threshold: { type: "relative", value: 0.95 },
          },
        ],
      },
    },
  });

  // Create regressed run (falls below baseline thresholds)
  await prisma.benchmarkRun.upsert({
    where: { id: SEED_RUN_ID_REGRESSED },
    update: {
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-005",
      temporalWorkflowId: "temporal-wf-005",
      workerGitSha: "git-sha-005",
      startedAt: new Date("2026-02-15T11:00:00Z"),
      completedAt: new Date("2026-02-15T11:40:00Z"),
      metrics: {
        field_accuracy: 0.88,
        character_accuracy: 0.92,
        word_accuracy: 0.89,
      },
      params: {
        model: "experimental-model",
        confidence_threshold: 0.75,
      },
      tags: {
        environment: "test",
        version: "v2.0-experimental",
      },
      isBaseline: false,
      baselineComparison: {
        baselineRunId: SEED_RUN_ID_COMPLETED,
        overallPassed: false,
        regressedMetrics: ["field_accuracy", "character_accuracy", "word_accuracy"],
        metricComparisons: [
          {
            metricName: "field_accuracy",
            currentValue: 0.88,
            baselineValue: 0.95,
            delta: -0.07,
            deltaPercent: -7.37,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "character_accuracy",
            currentValue: 0.92,
            baselineValue: 0.98,
            delta: -0.06,
            deltaPercent: -6.12,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "word_accuracy",
            currentValue: 0.89,
            baselineValue: 0.96,
            delta: -0.07,
            deltaPercent: -7.29,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
        ],
      },
    },
    create: {
      id: SEED_RUN_ID_REGRESSED,
      definitionId: definition.id,
      projectId: project.id,
      status: BenchmarkRunStatus.completed,
      mlflowRunId: "mlflow-run-005",
      temporalWorkflowId: "temporal-wf-005",
      workerGitSha: "git-sha-005",
      startedAt: new Date("2026-02-15T11:00:00Z"),
      completedAt: new Date("2026-02-15T11:40:00Z"),
      metrics: {
        field_accuracy: 0.88,
        character_accuracy: 0.92,
        word_accuracy: 0.89,
      },
      params: {
        model: "experimental-model",
        confidence_threshold: 0.75,
      },
      tags: {
        environment: "test",
        version: "v2.0-experimental",
      },
      isBaseline: false,
      baselineComparison: {
        baselineRunId: SEED_RUN_ID_COMPLETED,
        overallPassed: false,
        regressedMetrics: ["field_accuracy", "character_accuracy", "word_accuracy"],
        metricComparisons: [
          {
            metricName: "field_accuracy",
            currentValue: 0.88,
            baselineValue: 0.95,
            delta: -0.07,
            deltaPercent: -7.37,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "character_accuracy",
            currentValue: 0.92,
            baselineValue: 0.98,
            delta: -0.06,
            deltaPercent: -6.12,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
          {
            metricName: "word_accuracy",
            currentValue: 0.89,
            baselineValue: 0.96,
            delta: -0.07,
            deltaPercent: -7.29,
            passed: false,
            threshold: { type: "relative", value: 0.95 },
          },
        ],
      },
    },
  });

  // Create test artifacts for the passing run (which has baseline comparison and won't crash the UI)
  await seedBenchmarkArtifacts(project.id, SEED_RUN_ID_PASSING);

  console.log("✅ Benchmarking seed data created successfully");
  console.log(`  - Dataset: ${dataset.name} (3 versions: v0.9 archived, v1.0 published, v2.0 draft)`);
  console.log(`  - Dataset: ${dataset2.name}`);
  console.log(`  - Dataset: ${dataset3.name}`);
  console.log(`  - Project: ${project.name}`);
  console.log(`  - Definition: ${definition.name}`);
  console.log(`  - Runs: 5 (3 completed [1 baseline, 1 passing, 1 regressed], 1 running, 1 failed)`);
  console.log(`  - Artifacts: 4 test artifacts created for artifact viewer testing`);
}

/**
 * Seed benchmark artifacts for testing the artifact viewer
 * Creates JSON, image, text, and unsupported file type artifacts
 */
async function seedBenchmarkArtifacts(projectId: string, runId: string = SEED_RUN_ID_COMPLETED) {
  console.log("  📦 Creating test artifacts...");

  // Sample JSON artifact content (evaluation report)
  const jsonContent = JSON.stringify({
    evaluationId: "eval-001",
    runId,
    metrics: {
      field_accuracy: 0.95,
      character_accuracy: 0.98,
      word_accuracy: 0.96,
    },
    perFieldResults: [
      {
        fieldName: "invoice_number",
        accuracy: 0.92,
        errorCount: 4,
      },
      {
        fieldName: "total_amount",
        accuracy: 0.97,
        errorCount: 2,
      },
    ],
    timestamp: "2026-02-10T10:45:00Z",
  }, null, 2);

  // Sample text artifact content (error log)
  const textContent = `[2026-02-10 10:30:15] INFO: Starting evaluation for run ${runId}
[2026-02-10 10:30:16] INFO: Loading dataset version ${SEED_DATASET_VERSION_ID}
[2026-02-10 10:30:17] INFO: Processing sample-001
[2026-02-10 10:30:18] INFO: Processing sample-002
[2026-02-10 10:30:19] WARN: Low confidence score for field 'invoice_number' in sample-003
[2026-02-10 10:30:20] INFO: Processing sample-004
[2026-02-10 10:30:21] ERROR: Field extraction failed for 'vendor_name' in sample-005
[2026-02-10 10:30:22] INFO: Processing complete. Total samples: 50
[2026-02-10 10:30:23] INFO: Aggregated metrics calculated
[2026-02-10 10:45:00] INFO: Evaluation completed successfully`;

  // Sample image artifact (1x1 red pixel PNG as base64)
  // This is a minimal valid PNG file
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const imageBuffer = Buffer.from(pngBase64, "base64");

  // Sample unsupported file (binary data)
  const unsupportedContent = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // Create artifacts in database
  // Note: In production, these would be uploaded to MinIO via the backend service
  // For seed purposes, we create database records only
  // E2E tests should mock MinIO responses or run with MinIO available

  await prisma.benchmarkArtifact.upsert({
    where: { id: SEED_ARTIFACT_ID_JSON },
    update: {
      runId,
      type: "evaluation_report",
      path: `${runId}/evaluation_report/eval-report-1707563100000.json`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(jsonContent.length),
      mimeType: "application/json",
    },
    create: {
      id: SEED_ARTIFACT_ID_JSON,
      runId,
      type: "evaluation_report",
      path: `${runId}/evaluation_report/eval-report-1707563100000.json`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(jsonContent.length),
      mimeType: "application/json",
    },
  });

  await prisma.benchmarkArtifact.upsert({
    where: { id: SEED_ARTIFACT_ID_IMAGE },
    update: {
      runId,
      type: "per_doc_output",
      path: `${runId}/per_doc_output/sample-001-output-1707563100001.png`,
      sampleId: "sample-001",
      nodeId: "ocr-node",
      sizeBytes: BigInt(imageBuffer.length),
      mimeType: "image/png",
    },
    create: {
      id: SEED_ARTIFACT_ID_IMAGE,
      runId,
      type: "per_doc_output",
      path: `${runId}/per_doc_output/sample-001-output-1707563100001.png`,
      sampleId: "sample-001",
      nodeId: "ocr-node",
      sizeBytes: BigInt(imageBuffer.length),
      mimeType: "image/png",
    },
  });

  await prisma.benchmarkArtifact.upsert({
    where: { id: SEED_ARTIFACT_ID_TEXT },
    update: {
      runId,
      type: "error_log",
      path: `${runId}/error_log/run-log-1707563100002.log`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(textContent.length),
      mimeType: "text/plain",
    },
    create: {
      id: SEED_ARTIFACT_ID_TEXT,
      runId,
      type: "error_log",
      path: `${runId}/error_log/run-log-1707563100002.log`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(textContent.length),
      mimeType: "text/plain",
    },
  });

  await prisma.benchmarkArtifact.upsert({
    where: { id: SEED_ARTIFACT_ID_UNSUPPORTED },
    update: {
      runId,
      type: "intermediate_node_output",
      path: `${runId}/intermediate_node_output/model-weights-1707563100003.bin`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(unsupportedContent.length),
      mimeType: "application/octet-stream",
    },
    create: {
      id: SEED_ARTIFACT_ID_UNSUPPORTED,
      runId,
      type: "intermediate_node_output",
      path: `${runId}/intermediate_node_output/model-weights-1707563100003.bin`,
      sampleId: null,
      nodeId: null,
      sizeBytes: BigInt(unsupportedContent.length),
      mimeType: "application/octet-stream",
    },
  });

  console.log("    ✓ Created 4 test artifacts (JSON, image, text, unsupported)");

  // === AUDIT LOGS ===
  console.log("  📋 Creating audit logs...");

  // Create baseline promotion history - simulate that the baseline was promoted 2 days ago
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  await prisma.benchmarkAuditLog.create({
    data: {
      id: "audit-baseline-001",
      timestamp: twoDaysAgo,
      userId: "test-user",
      action: AuditAction.baseline_promoted,
      entityType: "BenchmarkRun",
      entityId: SEED_RUN_ID_COMPLETED,
      metadata: {
        definitionId: SEED_DEFINITION_ID,
        projectId: SEED_PROJECT_ID,
        previousBaselineId: null,
        thresholds: [
          { metricName: "field_accuracy", type: "relative", value: 0.95 },
          { metricName: "character_accuracy", type: "relative", value: 0.95 },
          { metricName: "word_accuracy", type: "relative", value: 0.95 },
        ],
      },
    },
  });

  console.log("    ✓ Created baseline promotion audit log");
}

async function seedLabelingData() {
  const project = await prisma.labelingProject.upsert({
    where: { id: SDPR_TEMPLATE_PROJECT_ID },
    update: {
      name: SDPR_TEMPLATE_PROJECT_NAME,
      description: SDPR_TEMPLATE_PROJECT_DESCRIPTION,
      created_by: SDPR_TEMPLATE_PROJECT_CREATED_BY,
      status: ProjectStatus.active,
    },
    create: {
      id: SDPR_TEMPLATE_PROJECT_ID,
      name: SDPR_TEMPLATE_PROJECT_NAME,
      description: SDPR_TEMPLATE_PROJECT_DESCRIPTION,
      created_by: SDPR_TEMPLATE_PROJECT_CREATED_BY,
      status: ProjectStatus.active,
    },
  });

  const fieldKeys = SDPR_MONTHLY_REPORT_FIELDS.map((field) => field.fieldKey);

  await prisma.fieldDefinition.deleteMany({
    where: {
      project_id: project.id,
      field_key: {
        notIn: fieldKeys,
      },
    },
  });

  await prisma.$transaction(
    SDPR_MONTHLY_REPORT_FIELDS.map((field, index) =>
      prisma.fieldDefinition.upsert({
        where: {
          project_id_field_key: {
            project_id: project.id,
            field_key: field.fieldKey,
          },
        },
        update: {
          field_type: field.fieldType,
          field_format: field.fieldFormat ?? null,
          display_order: index,
        },
        create: {
          project_id: project.id,
          field_key: field.fieldKey,
          field_type: field.fieldType,
          field_format: field.fieldFormat ?? null,
          display_order: index,
        },
      }),
    ),
  );

  console.log("✅ Labeling project seed data created successfully");
  console.log(`  - Project: ${project.name}`);
  console.log(`  - Fields: ${SDPR_MONTHLY_REPORT_FIELDS.length}`);
}

async function seedTestApiKey() {
  console.log("🔑 Seeding test API key...");

  const TEST_API_KEY = process.env.TEST_API_KEY || "69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY";
  const keyPrefix = TEST_API_KEY.substring(0, 8);
  const keyHash = await bcrypt.hash(TEST_API_KEY, 10);

  await prisma.apiKey.upsert({
    where: { user_id: "test-user" },
    update: {
      key_hash: keyHash,
      key_prefix: keyPrefix,
      user_email: "test@example.com",
    },
    create: {
      user_id: "test-user",
      user_email: "test@example.com",
      key_hash: keyHash,
      key_prefix: keyPrefix,
    },
  });

  console.log(`  ✓ Test API key created (prefix: ${keyPrefix})`);
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  await seedTestApiKey();
  await seedLabelingData();
  await seedBenchmarkingData();

  console.log("\n✅ All seed data created successfully!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
