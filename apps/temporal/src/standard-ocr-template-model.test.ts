/**
 * The standard OCR template runs on whatever model the run starts with.
 *
 * Azure Document Intelligence keeps an analysis under the model it was
 * submitted to; the result can only be fetched under that same model id. The
 * fake Azure below enforces exactly that: it remembers the model each request
 * was submitted under and refuses a poll or an extract under any other. A
 * template whose steps disagree about the model therefore fails here the way
 * it fails against Azure — at the poll.
 *
 * The run starts with a model that is not the template's default, as a run
 * from the Upload page or the documents API does. The real `graphWorkflow`
 * executes the shipped template, and the real Prepare File activity runs
 * against a small file on disk; everything that would reach Azure or the
 * database is faked.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { ApplicationFailure } from "@temporalio/activity";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { prepareFileData } from "./activities/prepare-file-data";
import { computeConfigHash } from "./config-hash";
import { graphWorkflow } from "./graph-workflow";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
  GraphWorkflowResult,
} from "./graph-workflow-types";
import type { PreparedFileData } from "./types";

const TASK_QUEUE = "standard-ocr-template-model-test";
const TEMPLATE_PATH = path.resolve(
  __dirname,
  "../../../docs-md/workflows/templates/standard-ocr-workflow.json",
);
/** Any model other than the template's own default. */
const RUN_MODEL = "custom-invoice-model-v2";
/** What the Azure activities fall back to when they are given no model. */
const AZURE_DEFAULT_MODEL = "prebuilt-layout";

type AzureStep = "submit" | "poll" | "extract";

/**
 * Stands in for Azure: records the model each request was submitted under
 * and answers a poll or extract under any other model with the 404 Azure
 * returns.
 */
function fakeAzure() {
  const submittedUnder = new Map<string, string>();
  const seen: Array<{ step: AzureStep; model: string }> = [];

  const fetchUnder = (step: AzureStep, requestId: string, model: string) => {
    seen.push({ step, model });
    const submitted = submittedUnder.get(requestId);
    if (submitted !== model) {
      throw ApplicationFailure.nonRetryable(
        `404: request ${requestId} was submitted under model "${submitted}", not "${model}"`,
        "AzureModelMismatch",
      );
    }
  };

  const activities = {
    "azureOcr.submit": async (params: { fileData: PreparedFileData }) => {
      const model = params.fileData.modelId || AZURE_DEFAULT_MODEL;
      const apimRequestId = `request-${submittedUnder.size + 1}`;
      submittedUnder.set(apimRequestId, model);
      seen.push({ step: "submit", model });
      return { apimRequestId };
    },
    "azureOcr.poll": async (params: {
      apimRequestId: string;
      modelId?: string;
    }) => {
      const model = params.modelId || AZURE_DEFAULT_MODEL;
      fetchUnder("poll", params.apimRequestId, model);
      return {
        status: "succeeded",
        ocrResponse: {
          status: "succeeded",
          analyzeResult: { modelId: model, content: "" },
        },
      };
    },
    "azureOcr.extract": async (params: {
      apimRequestId: string;
      modelId?: string;
    }) => {
      const model = params.modelId || AZURE_DEFAULT_MODEL;
      fetchUnder("extract", params.apimRequestId, model);
      return { ocrResult: { modelId: model, keyValuePairs: {} } };
    },
  };

  return { activities, seen };
}

describe("standard OCR template: one model from submit to extract", () => {
  let testEnv: TestWorkflowEnvironment;
  let tempDir: string;
  let samplePdf: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    // createLocal() downloads the Temporal server binary on first use; a
    // cold cache can take well over a minute.
    testEnv = await TestWorkflowEnvironment.createLocal();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "standard-ocr-model-"));
    samplePdf = path.join(tempDir, "sample.pdf");
    fs.writeFileSync(samplePdf, "%PDF-1.4\n%%EOF\n");
  }, 180_000);

  afterAll(async () => {
    if (testEnv) await testEnv.teardown();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("submits, waits for and extracts under the model the run starts with", async () => {
    const graph = JSON.parse(
      fs.readFileSync(TEMPLATE_PATH, "utf-8"),
    ) as GraphWorkflowConfig;
    const azure = fakeAzure();

    const input: GraphWorkflowInput = {
      workflowVersionId: "standard-ocr-template",
      configHash: computeConfigHash(graph),
      runnerVersion: "1.0.0",
      trigger: "api",
      initialCtx: {
        documentId: "doc-1",
        blobKey: samplePdf,
        fileName: "sample.pdf",
        fileType: "pdf",
        contentType: "application/pdf",
        modelId: RUN_MODEL,
      },
    };

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve("./graph-workflow"),
      activities: {
        getWorkflowGraphConfig: async () => ({
          graph,
          workflowVersionId: input.workflowVersionId,
          configHash: input.configHash,
        }),
        "file.prepare": prepareFileData,
        ...azure.activities,
        "document.updateStatus": async () => ({}),
        "document.getStatus": async () => ({ status: "complete" }),
        "ocr.cleanup": async (params: { ocrResult: unknown }) => ({
          cleanedResult: params.ocrResult,
        }),
        "ocr.checkConfidence": async () => ({
          averageConfidence: 0.99,
          requiresReview: false,
        }),
        "ocr.storeResults": async () => ({}),
      },
    });

    const result = (await worker.runUntil(
      testEnv.client.workflow.execute(graphWorkflow, {
        workflowId: `standard-ocr-model-${Date.now()}`,
        taskQueue: TASK_QUEUE,
        args: [input],
      }),
    )) as GraphWorkflowResult;

    expect(result.status).toBe("completed");
    expect(azure.seen).toEqual([
      { step: "submit", model: RUN_MODEL },
      { step: "poll", model: RUN_MODEL },
      { step: "extract", model: RUN_MODEL },
    ]);
  });
});
