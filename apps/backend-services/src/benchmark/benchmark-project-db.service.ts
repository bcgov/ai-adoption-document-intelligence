import { BenchmarkProject, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

const projectWithDetailsInclude = {
  benchmarkDefinitions: {
    select: {
      id: true,
      name: true,
      datasetVersionId: true,
      evaluatorType: true,
      immutable: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
  benchmarkRuns: {
    select: {
      id: true,
      status: true,
      temporalWorkflowId: true,
      startedAt: true,
      completedAt: true,
      definition: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" as const },
    take: 10,
  },
} as const;

export type BenchmarkProjectWithDetails = Prisma.BenchmarkProjectGetPayload<{
  include: typeof projectWithDetailsInclude;
}>;

@Injectable()
export class BenchmarkProjectDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new benchmark project.
   *
   * @param data - Project creation data.
   * @param tx - Optional transaction client.
   * @returns The created BenchmarkProject with definition and run summaries.
   */
  async createBenchmarkProject(
    data: {
      name: string;
      description?: string | null;
      createdBy: string;
      group_id: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkProjectWithDetails> {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.create({
      data,
      include: projectWithDetailsInclude,
    });
  }

  /**
   * Finds a benchmark project by ID with definition and run details.
   *
   * @param id - The project ID.
   * @param tx - Optional transaction client.
   * @returns The project with details, or `null` if not found.
   */
  async findBenchmarkProject(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkProjectWithDetails | null> {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.findUnique({
      where: { id },
      include: projectWithDetailsInclude,
    });
  }

  /**
   * Finds a benchmark project by ID, including active run counts for deletion checks.
   *
   * @param id - The project ID.
   * @param tx - Optional transaction client.
   * @returns The project with active-run info, or `null` if not found.
   */
  async findBenchmarkProjectForDeletion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<
    | (BenchmarkProject & {
        benchmarkRuns: Array<{ id: string; status: string }>;
      })
    | null
  > {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.findUnique({
      where: { id },
      include: {
        benchmarkRuns: {
          where: { status: { in: ["pending", "running"] } },
          select: { id: true, status: true },
        },
      },
    });
  }

  /**
   * Returns all benchmark projects for the given groups.
   *
   * @param groupIds - Group IDs to filter by.
   * @param tx - Optional transaction client.
   * @returns Array of projects with definition/run counts.
   */
  async findAllBenchmarkProjects(
    groupIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<
    Array<
      BenchmarkProject & {
        _count: { benchmarkDefinitions: number; benchmarkRuns: number };
      }
    >
  > {
    const client = tx ?? this.prisma;
    return client.benchmarkProject.findMany({
      where: { group_id: { in: groupIds } },
      include: {
        _count: {
          select: {
            benchmarkDefinitions: true,
            benchmarkRuns: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Deletes a benchmark project by ID.
   *
   * @param id - The project ID.
   * @param tx - Optional transaction client.
   */
  async deleteBenchmarkProject(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkProject.delete({ where: { id } });
  }
}
