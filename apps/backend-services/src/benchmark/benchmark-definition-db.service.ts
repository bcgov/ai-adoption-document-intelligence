import {
  BenchmarkDefinition,
  BenchmarkRun,
  Prisma,
  PrismaClient,
  Split,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

const lineageSelect = {
  select: {
    id: true,
    name: true,
    workflow_kind: true,
    source_workflow_id: true,
  },
} as const;

const definitionDetailsInclude = {
  datasetVersion: {
    include: { dataset: { select: { name: true } } },
  },
  split: true,
  workflowVersion: {
    include: {
      lineage: lineageSelect,
    },
  },
  benchmarkRuns: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { startedAt: "desc" as const },
  },
} as const;

const definitionSummaryInclude = {
  datasetVersion: {
    include: { dataset: { select: { name: true } } },
  },
  workflowVersion: {
    include: {
      lineage: lineageSelect,
    },
  },
} as const;

/** Load shape for schedule enable/disable (no run history). */
const scheduleConfigDefinitionInclude = {
  datasetVersion: {
    include: { dataset: { select: { name: true } } },
  },
  split: true,
  workflowVersion: { include: { lineage: true } },
} as const;

/** Response shape after schedule update (limited recent runs, ordered by createdAt). */
const scheduleUpdateResponseInclude = {
  datasetVersion: {
    include: { dataset: { select: { name: true } } },
  },
  split: true,
  workflowVersion: { include: { lineage: true } },
  benchmarkRuns: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
} as const;

export type BenchmarkDefinitionWithDetails =
  Prisma.BenchmarkDefinitionGetPayload<{
    include: typeof definitionDetailsInclude;
  }>;

export type BenchmarkDefinitionWithSummary =
  Prisma.BenchmarkDefinitionGetPayload<{
    include: typeof definitionSummaryInclude;
  }>;

@Injectable()
export class BenchmarkDefinitionDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Finds a benchmark project by ID (used for existence validation).
   *
   * @param id - The project ID.
   * @param tx - Optional transaction client.
   * @returns The project, or `null` if not found.
   */
  async findBenchmarkProject(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string } | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.findUnique({ where: { id } });
  }

  /**
   * Finds a dataset version by ID (used for existence validation).
   *
   * @param id - The dataset version ID.
   * @param tx - Optional transaction client.
   * @returns The dataset version with its dataset name, or `null`.
   */
  async findDatasetVersion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; dataset: { name: string } } | null> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findUnique({
      where: { id },
      include: { dataset: { select: { name: true } } },
    });
  }

  /**
   * Finds a split by ID (used for existence/ownership validation).
   *
   * @param id - The split ID.
   * @param tx - Optional transaction client.
   * @returns The split, or `null` if not found.
   */
  async findSplit(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Split | null> {
    const client = tx ?? this.prisma;
    return client.split.findUnique({ where: { id } });
  }

  /**
   * Finds a workflow version by ID (used for existence validation).
   *
   * @param id - The workflow version ID.
   * @param tx - Optional transaction client.
   * @returns The workflow version with its config, or `null` if not found.
   */
  async findWorkflowVersion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; config: unknown } | null> {
    const client = tx ?? this.prisma;
    return client.workflowVersion.findUnique({ where: { id } });
  }

  /**
   * Creates a new benchmark definition.
   *
   * @param data - Definition creation data (accepts scalar FK fields, i.e. unchecked input).
   * @param tx - Optional transaction client.
   * @returns The created definition with full details.
   */
  async createBenchmarkDefinition(
    data: Prisma.BenchmarkDefinitionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkDefinitionWithDetails> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.create({
      data: data as unknown as Prisma.BenchmarkDefinitionCreateInput,
      include: definitionDetailsInclude,
    });
  }

  /**
   * Finds a benchmark definition with full details (datasetVersion, split, workflow, runs).
   *
   * @param definitionId - The definition ID.
   * @param projectId - Optional project ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The definition with details, or `null` if not found.
   */
  async findBenchmarkDefinition(
    definitionId: string,
    projectId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkDefinitionWithDetails | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        ...(projectId ? { projectId } : {}),
      },
      include: definitionDetailsInclude,
    });
  }

  /**
   * Finds a benchmark definition with full details including run-count
   * (used for update-or-new-revision logic).
   *
   * @param definitionId - The definition ID.
   * @param projectId - Project ID to scope the query.
   * @param tx - Optional transaction client.
   */
  async findBenchmarkDefinitionForUpdate(
    definitionId: string,
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<
    | (BenchmarkDefinitionWithDetails & {
        _count: { benchmarkRuns: number };
      })
    | null
  > {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        ...definitionDetailsInclude,
        _count: { select: { benchmarkRuns: true } },
      },
    }) as Promise<
      | (BenchmarkDefinitionWithDetails & {
          _count: { benchmarkRuns: number };
        })
      | null
    >;
  }

  /**
   * Returns all definitions for a project with summary information.
   *
   * @param projectId - The project ID.
   * @param tx - Optional transaction client.
   * @returns Array of definitions with summary data.
   */
  async findAllBenchmarkDefinitions(
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkDefinitionWithSummary[]> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findMany({
      where: { projectId },
      include: definitionSummaryInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Finds the baseline run for a definition.
   *
   * @param definitionId - The definition ID.
   * @param tx - Optional transaction client.
   * @returns The baseline BenchmarkRun, or `null` if none exists.
   */
  async findBaselineBenchmarkRun(
    definitionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Pick<
    BenchmarkRun,
    "id" | "status" | "metrics" | "baselineThresholds" | "completedAt"
  > | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkRun.findFirst({
      where: { definitionId, isBaseline: true },
      select: {
        id: true,
        status: true,
        metrics: true,
        baselineThresholds: true,
        completedAt: true,
      },
    });
  }

  /**
   * Updates a benchmark definition.
   *
   * @param id - The definition ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated definition with full details.
   */
  async updateBenchmarkDefinition(
    id: string,
    data: Prisma.BenchmarkDefinitionUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkDefinitionWithDetails> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.update({
      where: { id },
      data,
      include: definitionDetailsInclude,
    });
  }

  /** Persist pipeline debug log entries to a definition (overwrites previous log). */
  async updatePipelineDebugLog(
    definitionId: string,
    entries: Array<{
      step: string;
      timestamp: string;
      durationMs?: number;
      data: Record<string, unknown>;
    }>,
  ): Promise<void> {
    await this.prisma.benchmarkDefinition.update({
      where: { id: definitionId },
      data: { pipelineDebugLog: entries as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
  }

  /** Reads the pipeline debug log for a definition. Returns null if no definition found. */
  async findPipelineDebugLog(
    definitionId: string,
    projectId: string,
  ): Promise<{ pipelineDebugLog: unknown } | null> {
    return this.prisma.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      select: { pipelineDebugLog: true },
    });
  }

  /**
   * Deletes a benchmark definition by ID.
   *
   * @param id - The definition ID.
   * @param tx - Optional transaction client.
   */
  async deleteBenchmarkDefinition(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkDefinition.delete({ where: { id } });
  }

  /**
   * Finds a benchmark definition with its run list for deletion validation.
   *
   * @param definitionId - The definition ID.
   * @param projectId - Project ID to scope the query.
   * @param tx - Optional transaction client.
   */
  async findBenchmarkDefinitionForDeletion(
    definitionId: string,
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<
    | (BenchmarkDefinition & {
        benchmarkRuns: Array<{ id: string; status: string }>;
      })
    | null
  > {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        benchmarkRuns: { select: { id: true, status: true } },
      },
    });
  }

  /**
   * Runs a Prisma interactive transaction (workflow promote, etc.).
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Deletes a workflow lineage row (e.g. benchmark_candidate after promote).
   */
  async deleteWorkflowLineage(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.workflowLineage.delete({ where: { id } });
  }

  /**
   * Loads a workflow version with full lineage (create/promote validation).
   */
  async findWorkflowVersionWithLineage(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.WorkflowVersionGetPayload<{
    include: { lineage: true };
  }> | null> {
    const client = tx ?? this.prisma;
    return client.workflowVersion.findUnique({
      where: { id },
      include: { lineage: true },
    });
  }

  /**
   * Loads base lineage head pointer for promote.
   */
  async findWorkflowLineageHead(
    lineageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    id: string;
    group_id: string;
    head_version_id: string | null;
  } | null> {
    const client = tx ?? this.prisma;
    return client.workflowLineage.findUnique({
      where: { id: lineageId },
      select: { id: true, group_id: true, head_version_id: true },
    });
  }

  /**
   * Definition row with workflow lineage for benchmark candidate promote.
   */
  async findBenchmarkDefinitionForPromote(
    projectId: string,
    definitionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BenchmarkDefinitionGetPayload<{
    include: {
      workflowVersion: { include: { lineage: true } };
    };
  }> | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        workflowVersion: { include: { lineage: true } },
      },
    });
  }

  /**
   * Minimal fields for Temporal schedule lookup.
   */
  async findDefinitionScheduleMeta(
    projectId: string,
    definitionId: string,
  ): Promise<{ id: string; scheduleId: string | null } | null> {
    return this.prisma.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      select: { id: true, scheduleId: true },
    });
  }

  /**
   * Definition + dataset/split/workflow for schedule configuration.
   */
  async findBenchmarkDefinitionForScheduleConfig(
    projectId: string,
    definitionId: string,
  ): Promise<Prisma.BenchmarkDefinitionGetPayload<{
    include: typeof scheduleConfigDefinitionInclude;
  }> | null> {
    return this.prisma.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: scheduleConfigDefinitionInclude,
    });
  }

  /**
   * Persists schedule fields and returns a definition payload suitable for {@link DefinitionDetailsDto}.
   */
  async updateBenchmarkDefinitionScheduleFields(
    id: string,
    data: {
      scheduleEnabled: boolean;
      scheduleCron: string | null;
      scheduleId: string | null;
    },
  ): Promise<
    Prisma.BenchmarkDefinitionGetPayload<{
      include: typeof scheduleUpdateResponseInclude;
    }>
  > {
    return this.prisma.benchmarkDefinition.update({
      where: { id },
      data,
      include: scheduleUpdateResponseInclude,
    });
  }

  /**
   * Marks a definition immutable before creating a new revision (no full reload).
   */
  async setBenchmarkDefinitionImmutable(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkDefinition.update({
      where: { id },
      data: { immutable: true },
    });
  }
}
