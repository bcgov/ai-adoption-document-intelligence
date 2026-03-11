/**
 * Benchmark Run Status Update Activity
 *
 * Updates the BenchmarkRun record in Postgres with status, metrics, and completion info.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 */

import type { Prisma } from "../generated";
import { getPrismaClient } from "./database-client";
import { createActivityLogger } from "../logger";

export interface BenchmarkUpdateRunStatusInput {
  /** Benchmark run ID */
  runId: string;

  /** New status */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";

  /** Aggregated metrics (if available) */
  metrics?: Record<string, unknown>;

  /** Error message (if failed) */
  error?: string;

  /** Completion timestamp */
  completedAt?: Date;
}

/**
 * Update BenchmarkRun status in Postgres
 *
 * Baseline comparison is handled by the dedicated benchmarkCompareAgainstBaseline
 * activity, which the workflow invokes as a separate step after status update.
 *
 * Activity type: benchmark.updateRunStatus
 */
export async function benchmarkUpdateRunStatus(
  input: BenchmarkUpdateRunStatusInput,
): Promise<void> {
  const { runId, status, metrics, error, completedAt } = input;
  const log = createActivityLogger("benchmarkUpdateRunStatus", { runId });
  const prisma = getPrismaClient();

  const updateData: Prisma.BenchmarkRunUpdateInput = {
    status,
  };

  if (metrics !== undefined) {
    updateData.metrics = metrics as Prisma.InputJsonValue;
  }

  if (error !== undefined) {
    updateData.error = error;
  }

  if (completedAt !== undefined) {
    updateData.completedAt = completedAt;
  }

  // Set startedAt when transitioning to running
  if (status === "running") {
    updateData.startedAt = new Date();
  }

  await prisma.benchmarkRun.update({
    where: { id: runId },
    data: updateData,
  });

  log.info("Benchmark run status updated", {
    event: "status_updated",
    status,
    hasMetrics: !!metrics,
    hasError: !!error,
  });
}
