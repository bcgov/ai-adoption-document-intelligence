/**
 * Persist per-sample evaluation details (groundTruth, prediction,
 * evaluationDetails, diagnostics) to blob storage as a JSON file.
 *
 * The drill-down UI consumes these heavy fields, but they're too large to
 * round-trip through Temporal payloads at scale (~30 KB per sample × ~100
 * samples = ~3 MB, exceeding the 2 MB blob limit on activity inputs).
 * Instead, the parent workflow calls this activity once per sample (each
 * payload safely under the limit), and stores only the returned
 * `evaluationBlobPath` on the BenchmarkRun row.
 *
 * Backend reads the blob on demand when a client opens drill-down for a
 * specific sample.
 */

import {
  buildBlobFilePath,
  OperationCategory,
} from "@ai-di/blob-storage-paths";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import type { Prisma } from "../generated";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

export interface BenchmarkPersistEvaluationDetailsInput {
  runId: string;
  sampleId: string;
  /** Heavy fields stripped from the in-memory EvaluationResult before aggregate. */
  details: {
    groundTruth?: unknown;
    prediction?: unknown;
    evaluationDetails?: unknown;
    diagnostics?: unknown;
  };
}

export interface BenchmarkPersistEvaluationDetailsOutput {
  /** Blob storage key written. Stored on the run row's perSampleResults. */
  evaluationBlobPath: string;
}

/**
 * Resolve the dataset/project group_id for a benchmark run via project relation.
 * The blob path scheme requires a CUID group prefix (see buildBlobFilePath).
 */
async function resolveGroupId(
  runId: string,
  prisma: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
): Promise<string> {
  const row = await prisma.benchmarkRun.findUnique({
    where: { id: runId },
    select: { project: { select: { group_id: true } } },
  });
  if (!row?.project?.group_id) {
    throw new Error(
      `Cannot persist evaluation details: BenchmarkRun ${runId} or its project not found`,
    );
  }
  return row.project.group_id;
}

export async function benchmarkPersistEvaluationDetails(
  input: BenchmarkPersistEvaluationDetailsInput,
): Promise<BenchmarkPersistEvaluationDetailsOutput> {
  const log = createActivityLogger("benchmarkPersistEvaluationDetails", {
    runId: input.runId,
    sampleId: input.sampleId,
  });

  const prisma = getPrismaClient();
  const groupId = await resolveGroupId(input.runId, prisma);

  const blobPath = buildBlobFilePath(
    groupId,
    OperationCategory.BENCHMARK,
    ["runs", input.runId],
    `${input.sampleId}.json`,
  );

  const blobStorage = getBlobStorageClient();
  const data = Buffer.from(
    JSON.stringify({
      sampleId: input.sampleId,
      runId: input.runId,
      groundTruth: input.details.groundTruth ?? null,
      prediction: input.details.prediction ?? null,
      evaluationDetails: input.details.evaluationDetails ?? null,
      diagnostics: input.details.diagnostics ?? null,
    }),
    "utf-8",
  );
  await blobStorage.write(blobPath, data);

  log.info("benchmark evaluation details persist", {
    event: "persist",
    blobPath,
    bytes: data.byteLength,
  });

  return { evaluationBlobPath: blobPath };
}
