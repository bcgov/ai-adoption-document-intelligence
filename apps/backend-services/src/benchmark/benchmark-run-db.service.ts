import { BenchmarkRun, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

type DefinitionForRun = Prisma.BenchmarkDefinitionGetPayload<{
  include: {
    project: true;
    datasetVersion: { include: { dataset: true } };
    split: true;
    workflowVersion: true;
  };
}>;

/** Definition shape for {@link BenchmarkRunService.startRun} (workflow lineage for Temporal). */
export type DefinitionForStartRun = Prisma.BenchmarkDefinitionGetPayload<{
  include: {
    project: true;
    datasetVersion: { include: { dataset: true } };
    split: true;
    workflowVersion: { include: { lineage: true } };
  };
}>;

type RunWithDefinition = Prisma.BenchmarkRunGetPayload<{
  include: { definition: true };
}>;

@Injectable()
export class BenchmarkRunDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Finds a benchmark definition with all data needed to start a run.
   *
   * @param definitionId - The definition ID.
   * @param projectId - Project ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The definition with full run-start context, or `null`.
   */
  async findBenchmarkDefinitionForRun(
    definitionId: string,
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DefinitionForRun | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        project: true,
        datasetVersion: { include: { dataset: true } },
        split: true,
        workflowVersion: true,
      },
    });
  }

  /**
   * Verifies a benchmark project exists (used before listing runs).
   *
   * @param id - The project ID.
   * @param tx - Optional transaction client.
   * @returns The project stub, or `null` if not found.
   */
  async findBenchmarkProject(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.findUnique({ where: { id } });
  }

  /**
   * Creates a new benchmark run record.
   *
   * @param data - Run creation data (accepts scalar FK fields, i.e. unchecked input).
   * @param tx - Optional transaction client.
   * @returns The created BenchmarkRun with its definition.
   */
  async createBenchmarkRun(
    data: Prisma.BenchmarkRunUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<RunWithDefinition> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.create({
      data: data as unknown as Prisma.BenchmarkRunCreateInput,
      include: { definition: true },
    });
  }

  /**
   * Finds a run scoped to a project (or globally if no projectId).
   *
   * @param runId - The run ID.
   * @param projectId - Optional project ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The run with its definition, or `null` if not found.
   */
  async findBenchmarkRun(
    runId: string,
    projectId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RunWithDefinition | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.findFirst({
      where: { id: runId, ...(projectId ? { projectId } : {}) },
      include: { definition: true },
    });
  }

  /**
   * Finds a run by its unique ID without project scoping.
   *
   * @param runId - The run ID.
   * @param tx - Optional transaction client.
   * @returns The BenchmarkRun, or `null` if not found.
   */
  async findBenchmarkRunUnique(
    runId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkRun | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.findUnique({ where: { id: runId } });
  }

  /**
   * Returns all runs for a project.
   *
   * @param projectId - The project ID.
   * @param tx - Optional transaction client.
   * @returns Array of runs with their definitions, ordered newest first.
   */
  async findAllBenchmarkRuns(
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<RunWithDefinition[]> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.findMany({
      where: { projectId },
      include: { definition: true },
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Finds the current baseline run for a definition.
   *
   * @param definitionId - The definition ID.
   * @param tx - Optional transaction client.
   * @returns The baseline BenchmarkRun, or `null` if none exists.
   */
  async findBaselineBenchmarkRun(
    definitionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkRun | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.findFirst({
      where: { definitionId, isBaseline: true },
    });
  }

  /**
   * Updates a benchmark run.
   *
   * @param id - The run ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated BenchmarkRun.
   */
  async updateBenchmarkRun(
    id: string,
    data: Prisma.BenchmarkRunUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkRun> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.update({ where: { id }, data });
  }

  /**
   * Deletes a benchmark run by ID.
   *
   * Removes `benchmark_ocr_cache` rows for this run in the same transaction as the run delete
   * (DB FK also uses ON DELETE CASCADE; explicit delete keeps behavior obvious and safe if the
   * database predates that constraint).
   *
   * @param id - The run ID.
   * @param tx - Optional transaction client.
   */
  async deleteBenchmarkRun(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const deleteRunAndCache = async (
      client: Prisma.TransactionClient | PrismaClient,
    ) => {
      await client.benchmarkOcrCache.deleteMany({
        where: { sourceRunId: id },
      });
      await client.benchmarkRun.delete({ where: { id } });
    };

    if (tx) {
      await deleteRunAndCache(tx);
      return;
    }

    await this.prisma.$transaction(async (inner) => {
      await deleteRunAndCache(inner);
    });
  }

  /**
   * Marks a benchmark definition as immutable.
   *
   * @param id - The definition ID.
   * @param tx - Optional transaction client.
   */
  async markBenchmarkDefinitionImmutable(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkDefinition.update({
      where: { id },
      data: { immutable: true },
    });
  }

  /**
   * Marks a dataset version as frozen.
   *
   * @param id - The dataset version ID.
   * @param tx - Optional transaction client.
   */
  async freezeDatasetVersion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.datasetVersion.update({
      where: { id },
      data: { frozen: true },
    });
  }

  /**
   * Marks a split as frozen.
   *
   * @param id - The split ID.
   * @param tx - Optional transaction client.
   */
  async freezeSplit(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.split.update({ where: { id }, data: { frozen: true } });
  }

  /**
   * Count remaining runs for a definition.
   */
  async countRunsByDefinition(definitionId: string): Promise<number> {
    return this.prisma.benchmarkRun.count({
      where: { definitionId },
    });
  }

  /**
   * Reset definition immutability flag.
   */
  async resetDefinitionImmutability(definitionId: string): Promise<void> {
    await this.prisma.benchmarkDefinition.update({
      where: { id: definitionId },
      data: { immutable: false },
    });
  }

  /**
   * Count runs referencing a dataset version (through their definitions).
   */
  async countRunsByDatasetVersion(datasetVersionId: string): Promise<number> {
    return this.prisma.benchmarkRun.count({
      where: { definition: { datasetVersionId } },
    });
  }

  /**
   * Unfreeze a dataset version.
   */
  async unfreezeDatasetVersion(datasetVersionId: string): Promise<void> {
    await this.prisma.datasetVersion.update({
      where: { id: datasetVersionId },
      data: { frozen: false },
    });
  }

  /**
   * Count runs referencing a split (through their definitions).
   */
  async countRunsBySplit(splitId: string): Promise<number> {
    return this.prisma.benchmarkRun.count({
      where: { definition: { splitId } },
    });
  }

  /**
   * Unfreeze a split.
   */
  async unfreezeSplit(splitId: string): Promise<void> {
    await this.prisma.split.update({
      where: { id: splitId },
      data: { frozen: false },
    });
  }

  /**
   * Find completed runs with OCR cache rows for a dataset version in a project.
   */
  async findOcrCacheSources(
    projectId: string,
    datasetVersionId: string,
  ): Promise<
    Array<{
      id: string;
      completedAt: Date | null;
      definition: { id: string; name: string };
      _count: { ocrCacheRows: number };
    }>
  > {
    return this.prisma.benchmarkRun.findMany({
      where: {
        projectId,
        status: "completed",
        definition: { datasetVersionId },
        ocrCacheRows: { some: {} },
      },
      include: {
        definition: { select: { id: true, name: true } },
        _count: { select: { ocrCacheRows: true } },
      },
      orderBy: { completedAt: "desc" },
    });
  }

  /**
   * Interactive Prisma transaction (post-Temporal-start updates, baseline promotion, etc.).
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Definition + nested data for starting a benchmark run (includes workflow lineage).
   */
  async findBenchmarkDefinitionForStartRun(
    definitionId: string,
    projectId: string,
  ): Promise<DefinitionForStartRun | null> {
    return this.prisma.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        project: true,
        datasetVersion: { include: { dataset: true } },
        split: true,
        workflowVersion: { include: { lineage: true } },
      },
    });
  }

  /**
   * Candidate workflow config only (for `candidateWorkflowVersionId` runs).
   */
  async findWorkflowVersionConfig(
    workflowVersionId: string,
  ): Promise<{ config: unknown } | null> {
    return this.prisma.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      select: { config: true },
    });
  }

  /**
   * Validates OCR cache baseline run id: completed run sharing the same dataset version.
   * Allows cross-definition cache reuse within the same project.
   */
  async findRunForOcrCacheValidation(
    projectId: string,
    datasetVersionId: string,
    runId: string,
  ): Promise<BenchmarkRun | null> {
    return this.prisma.benchmarkRun.findFirst({
      where: {
        id: runId,
        projectId,
        status: "completed",
        definition: { datasetVersionId },
      },
    });
  }

  /**
   * Latest completed baseline run id for a definition (replay OCR cache).
   */
  async findLatestCompletedBaselineRunId(
    projectId: string,
    definitionId: string,
  ): Promise<string | null> {
    const row = await this.prisma.benchmarkRun.findFirst({
      where: {
        projectId,
        definitionId,
        isBaseline: true,
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Run row without relations (drill-down, per-sample, cancel eligibility, delete eligibility).
   */
  async findBenchmarkRunBare(
    runId: string,
    projectId: string,
  ): Promise<BenchmarkRun | null> {
    return this.prisma.benchmarkRun.findFirst({
      where: { id: runId, projectId },
    });
  }

  /**
   * After Temporal start: running status, immutable definition, frozen dataset version/split.
   */
  async postTemporalStartTransaction(
    runId: string,
    definitionId: string,
    datasetVersionId: string,
    splitId: string | null,
    temporalWorkflowId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.benchmarkRun.update({
        where: { id: runId },
        data: {
          temporalWorkflowId,
          status: "running",
          startedAt: new Date(),
        },
      });
      await tx.benchmarkDefinition.update({
        where: { id: definitionId },
        data: { immutable: true },
      });
      await tx.datasetVersion.update({
        where: { id: datasetVersionId },
        data: { frozen: true },
      });
      if (splitId) {
        await tx.split.update({
          where: { id: splitId },
          data: { frozen: true },
        });
      }
    });
  }

  /**
   * Clears previous baseline for the definition and promotes the given run.
   */
  async promoteRunToBaseline(
    runId: string,
    definitionId: string,
    thresholds: Prisma.InputJsonValue | typeof Prisma.JsonNull,
  ): Promise<{ previousBaselineId: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const previousBaseline = await tx.benchmarkRun.findFirst({
        where: {
          definitionId,
          isBaseline: true,
        },
      });

      if (previousBaseline) {
        await tx.benchmarkRun.update({
          where: { id: previousBaseline.id },
          data: { isBaseline: false },
        });
      }

      await tx.benchmarkRun.update({
        where: { id: runId },
        data: {
          isBaseline: true,
          baselineThresholds: thresholds,
        },
      });

      return { previousBaselineId: previousBaseline?.id ?? null };
    });
  }
}
