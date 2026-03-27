/**
 * Persist and load per-sample Azure OCR poll responses for benchmark runs.
 *
 * Used when `persistOcrCache` populates rows from a full OCR run, and
 * `ocrCacheBaselineRunId` replays cached responses without calling Azure.
 */

import type { Prisma } from "../generated";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";

export interface BenchmarkLoadOcrCacheInput {
  sourceRunId: string;
  sampleId: string;
}

export interface BenchmarkLoadOcrCacheOutput {
  ocrResponse: unknown | null;
}

export interface BenchmarkPersistOcrCacheInput {
  sourceRunId: string;
  sampleId: string;
  ocrResponse: unknown;
}

export async function benchmarkLoadOcrCache(
  input: BenchmarkLoadOcrCacheInput,
): Promise<BenchmarkLoadOcrCacheOutput> {
  const log = createActivityLogger("benchmarkLoadOcrCache", {
    sourceRunId: input.sourceRunId,
    sampleId: input.sampleId,
  });
  const prisma = getPrismaClient();

  const row = await prisma.benchmarkOcrCache.findUnique({
    where: {
      sourceRunId_sampleId: {
        sourceRunId: input.sourceRunId,
        sampleId: input.sampleId,
      },
    },
  });

  log.info("benchmark OCR cache load", {
    event: "load",
    hit: !!row,
  });

  return { ocrResponse: row?.ocrResponse ?? null };
}

export async function benchmarkPersistOcrCache(
  input: BenchmarkPersistOcrCacheInput,
): Promise<void> {
  const log = createActivityLogger("benchmarkPersistOcrCache", {
    sourceRunId: input.sourceRunId,
    sampleId: input.sampleId,
  });
  const prisma = getPrismaClient();

  await prisma.benchmarkOcrCache.upsert({
    where: {
      sourceRunId_sampleId: {
        sourceRunId: input.sourceRunId,
        sampleId: input.sampleId,
      },
    },
    create: {
      sourceRunId: input.sourceRunId,
      sampleId: input.sampleId,
      ocrResponse: input.ocrResponse as Prisma.InputJsonValue,
    },
    update: {
      ocrResponse: input.ocrResponse as Prisma.InputJsonValue,
    },
  });

  log.info("benchmark OCR cache persist", {
    event: "persist",
  });
}
