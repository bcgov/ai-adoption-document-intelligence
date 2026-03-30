import { BenchmarkRun, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

type DefinitionForRun = Prisma.BenchmarkDefinitionGetPayload<{
  include: {
    project: true;
    datasetVersion: { include: { dataset: true } };
    split: true;
    workflow: true;
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
        workflow: true,
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
   * @param id - The run ID.
   * @param tx - Optional transaction client.
   */
  async deleteBenchmarkRun(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkRun.delete({ where: { id } });
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
}
