/**
 * Shared "mock only paid services" integration-test harness.
 *
 * The experiment workflow tests run the REAL Temporal worker + REAL activities
 * (file prep, blob reads/writes, the confidence gate, DB upserts) against the
 * live local stack (Temporal `localhost:7233`, the app Postgres, MinIO/Azure
 * blob storage). The ONLY things stubbed are the paid external APIs:
 *
 *   - **Azure Document Intelligence** (SDK-based, can't be seen by
 *     axios-mock-adapter) → the activities' built-in `MOCK_AZURE_OCR=true`
 *     env-seam returns a canned `prebuilt-layout` response (still written to
 *     real blob storage, still resolved by the real downstream activities).
 *   - **Azure OpenAI / Mistral / Content Understanding** (raw `axios`) →
 *     intercepted with `axios-mock-adapter` on the default axios instance, so
 *     the real provider activity code (HTTP build → parse → canonical mapping)
 *     runs end-to-end against a recorded payload.
 *
 * Everything else is the production code path. A real `document` row (in the
 * seeded `seeddefaultgroup`) is created per test so the OCR activities can
 * resolve its group, write payload blobs, run the gate, and upsert results.
 */

import "../env-loader";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { DocumentStatus } from "@generated/client";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { getPrismaClient } from "../activities/database-client";
import { getActivityRegistry } from "../activity-registry";
import { computeConfigHash } from "../config-hash";
import type {
  GraphWorkflowConfig,
  GraphWorkflowInput,
} from "../graph-workflow-types";
import type { MistralOcrApiResponse } from "../ocr-providers/mistral/mistral-ocr-types";

export const TEMPORAL_ADDRESS =
  process.env.TEMPORAL_TEST_ADDRESS ?? "localhost:7233";
export const TEMPORAL_NAMESPACE =
  process.env.TEMPORAL_TEST_NAMESPACE ?? "default";

/** Seeded default group every test document is attached to. */
export const SEED_GROUP_ID = "seeddefaultgroup";

/**
 * Absolute path to a real sample image on disk. `file.prepare`/provider
 * activities read absolute blobKeys straight from the filesystem, so pointing
 * the workflow's `blobKey` here avoids having to upload to blob storage.
 */
export const SAMPLE_IMAGE_ABS_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "data",
  "datasets",
  "samples-mix",
  "public",
  "1 81.jpg",
);

type ActivityFn = (...args: unknown[]) => Promise<unknown>;

/**
 * Build the REAL activity map (mirrors `worker.ts`), overriding ONLY the
 * graph-config loader so the on-disk template under test is executed. That
 * override is test-graph injection (develop loads the graph from the DB by
 * `workflowVersionId`), not a paid-service mock — every other activity is the
 * production implementation.
 */
export function buildRealActivities(
  graph: GraphWorkflowConfig,
  workflowVersionId: string,
): Record<string, ActivityFn> {
  const activities: Record<string, ActivityFn> = {};
  for (const [activityType, entry] of getActivityRegistry()) {
    activities[activityType] = entry.activityFn as ActivityFn;
  }
  activities.getWorkflowGraphConfig = (async () => ({
    graph,
    workflowVersionId,
    configHash: computeConfigHash(graph),
  })) as ActivityFn;
  return activities;
}

/**
 * Create a real `document` row in the seeded default group so the OCR
 * activities can resolve its group, write payload blobs, and upsert results.
 * The returned `cleanup` deletes it (the `ocr_results` FK cascades).
 */
export async function seedTestDocument(opts?: {
  id?: string;
  fileName?: string;
}): Promise<{ documentId: string; cleanup: () => Promise<void> }> {
  const prisma = getPrismaClient();
  const documentId = opts?.id ?? `itest-${randomUUID()}`;
  const fileName = opts?.fileName ?? "1 81.jpg";
  await prisma.document.create({
    data: {
      id: documentId,
      title: fileName,
      original_filename: fileName,
      file_path: SAMPLE_IMAGE_ABS_PATH,
      file_type: "image",
      file_size: 0,
      source: "integration-test",
      status: DocumentStatus.pre_ocr,
      group_id: SEED_GROUP_ID,
    },
  });
  return {
    documentId,
    cleanup: async () => {
      await prisma.document.deleteMany({ where: { id: documentId } });
    },
  };
}

/** Recorded VLM `{ fields, source_quotes }` payload returned by the stub. */
export interface VlmPayloadStub {
  fields: Record<string, unknown>;
  source_quotes: Record<string, string>;
}

export interface PaidApiMockConfig {
  /**
   * Stub the Azure OpenAI chat-completions call (vlmDirect.extract /
   * vlmOcrHybrid.extract). The payload is returned as fenced JSON in
   * `choices[0].message.content`, exactly as the real model would, so the
   * activity's real parse + canonical mapping runs.
   */
  vlm?: VlmPayloadStub;
  /**
   * Stub the Mistral Document AI OCR call (mistralOcr.process, native or azure
   * transport). The given raw response is returned verbatim so the activity's
   * real canonical mapping + ref persistence runs.
   */
  mistral?: MistralOcrApiResponse;
}

/**
 * Stub ONLY the paid external APIs and run everything else for real:
 *   - Azure DI via the `MOCK_AZURE_OCR` env-seam (SDK-based; canned layout).
 *   - Azure OpenAI VLM + Mistral OCR via axios-mock-adapter (raw axios).
 * Forces dummy provider creds so the real activity builds its request URL but
 * never reaches the network (axios is intercepted). Returns a `restore` that
 * removes the interceptor and reverts the env it changed.
 */
export function installPaidApiMocks(cfg: PaidApiMockConfig): {
  restore: () => void;
} {
  const prevEnv: Record<string, string | undefined> = {
    MOCK_AZURE_OCR: process.env.MOCK_AZURE_OCR,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    MOCK_MISTRAL_OCR: process.env.MOCK_MISTRAL_OCR,
    MOCK_MISTRAL_AZURE_OCR: process.env.MOCK_MISTRAL_AZURE_OCR,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    MISTRAL_DOC_AI_AZURE_ENDPOINT: process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT,
    MISTRAL_DOC_AI_AZURE_KEY: process.env.MISTRAL_DOC_AI_AZURE_KEY,
  };
  process.env.MOCK_AZURE_OCR = "true";
  // Force mock creds so no real call can leak out even if a URL matcher ever
  // misses; axios is intercepted regardless.
  process.env.AZURE_OPENAI_ENDPOINT = "https://mock-openai.local";
  process.env.AZURE_OPENAI_API_KEY = "mock-key";

  const mock = new MockAdapter(axios, { onNoMatch: "passthrough" });
  if (cfg.vlm) {
    const content = `\`\`\`json\n${JSON.stringify(cfg.vlm)}\n\`\`\``;
    mock.onPost(/\/chat\/completions/).reply(200, {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }
  if (cfg.mistral) {
    // Go through the real axios path (not the MOCK_MISTRAL_* env seams) so the
    // given payload's confidence drives the real gate. Provide dummy creds for
    // both transports; the interceptor matches either `/ocr` endpoint.
    delete process.env.MOCK_MISTRAL_OCR;
    delete process.env.MOCK_MISTRAL_AZURE_OCR;
    process.env.MISTRAL_API_KEY = "mock-key";
    process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT = "https://mock-foundry.local";
    process.env.MISTRAL_DOC_AI_AZURE_KEY = "mock-key";
    mock.onPost(/\/ocr(\?|$)/).reply(200, cfg.mistral);
  }

  return {
    restore: () => {
      mock.restore();
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

/** Build a `GraphWorkflowInput` for the test graph + initial ctx. */
export function makeWorkflowInput(
  graph: GraphWorkflowConfig,
  initialCtx: Record<string, unknown>,
): GraphWorkflowInput {
  return {
    workflowVersionId: "itest-workflow-version-id",
    initialCtx,
    configHash: computeConfigHash(graph),
    runnerVersion: "1.0.0",
  };
}
