import {
  Dataset,
  DatasetVersion,
  Prisma,
  PrismaClient,
  Split,
  SplitType,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

type DatasetWithVersions = Prisma.DatasetGetPayload<{
  include: {
    versions: {
      select: { id: true; version: true; documentCount: true; createdAt: true };
    };
  };
}>;

type DatasetWithVersionsForDeletion = Prisma.DatasetGetPayload<{
  include: {
    versions: {
      include: {
        benchmarkDefinitions: true;
        splits: true;
      };
    };
  };
}>;

type DatasetVersionWithSplits = Prisma.DatasetVersionGetPayload<{
  include: {
    splits: { select: { id: true; name: true; type: true; sampleIds: true } };
  };
}>;

type DatasetVersionForDeletion = Prisma.DatasetVersionGetPayload<{
  include: { benchmarkDefinitions: { select: { id: true; name: true } } };
}>;

export interface CreateDatasetData {
  name: string;
  description?: string | null;
  metadata: Prisma.InputJsonValue;
  storagePath: string;
  createdBy: string;
  group_id: string;
}

export interface CreateDatasetVersionData {
  datasetId: string;
  version: string;
  name?: string | null;
  storagePrefix?: string | null;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema?: Prisma.InputJsonValue;
}

export interface CreateSplitData {
  datasetVersionId: string;
  name: string;
  type: SplitType;
  sampleIds: Prisma.InputJsonValue;
  stratificationRules?:
    | Prisma.InputJsonValue
    | Prisma.NullableJsonNullValueInput;
  frozen?: boolean;
}

@Injectable()
export class DatasetDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  // ---- Dataset operations ----

  /**
   * Creates a new dataset record.
   *
   * @param data - Dataset creation data.
   * @param tx - Optional transaction client.
   * @returns The created Dataset.
   */
  async createDataset(
    data: CreateDatasetData,
    tx?: Prisma.TransactionClient,
  ): Promise<Dataset> {
    const client = tx ?? this.prisma;
    return client.dataset.create({ data });
  }

  /**
   * Updates a dataset record.
   *
   * @param id - The dataset ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated Dataset.
   */
  async updateDataset(
    id: string,
    data: Prisma.DatasetUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Dataset> {
    const client = tx ?? this.prisma;
    return client.dataset.update({ where: { id }, data });
  }

  /**
   * Finds a dataset by ID.
   *
   * @param id - The dataset ID.
   * @param tx - Optional transaction client.
   * @returns The Dataset, or `null` if not found.
   */
  async findDataset(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Dataset | null> {
    const client = tx ?? this.prisma;
    return client.dataset.findUnique({ where: { id } });
  }

  /**
   * Finds a dataset by ID including its most recent versions.
   *
   * @param id - The dataset ID.
   * @param tx - Optional transaction client.
   * @returns The Dataset with version summaries, or `null`.
   */
  async findDatasetWithVersions(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetWithVersions | null> {
    const client = tx ?? this.prisma;
    return client.dataset.findUnique({
      where: { id },
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            documentCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  }

  /**
   * Finds a dataset by ID with all version/definition/split data needed for cascade deletion.
   *
   * @param id - The dataset ID.
   * @param tx - Optional transaction client.
   * @returns The Dataset with full cascade data, or `null`.
   */
  async findDatasetForDeletion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetWithVersionsForDeletion | null> {
    const client = tx ?? this.prisma;
    return client.dataset.findUnique({
      where: { id },
      include: {
        versions: {
          include: {
            benchmarkDefinitions: true,
            splits: true,
          },
        },
      },
    });
  }

  /**
   * Counts datasets matching the given filter.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   * @returns The count.
   */
  async countDatasets(
    where: Prisma.DatasetWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.dataset.count({ where });
  }

  /**
   * Returns datasets matching the given filter with pagination and version count.
   *
   * @param where - Filter conditions.
   * @param skip - Records to skip.
   * @param take - Records to return.
   * @param tx - Optional transaction client.
   */
  async findAllDatasets(
    where: Prisma.DatasetWhereInput,
    skip: number,
    take: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<Dataset & { versions: Array<{ id: string }> }>> {
    const client = tx ?? this.prisma;
    return client.dataset.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { versions: { select: { id: true } } },
    });
  }

  /**
   * Deletes a dataset by ID.
   *
   * @param id - The dataset ID.
   * @param tx - Optional transaction client.
   */
  async deleteDataset(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.dataset.delete({ where: { id } });
  }

  // ---- DatasetVersion operations ----

  /**
   * Creates a new dataset version.
   *
   * @param data - Version creation data.
   * @param tx - Optional transaction client.
   * @returns The created DatasetVersion.
   */
  async createDatasetVersion(
    data: CreateDatasetVersionData,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersion> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.create({ data });
  }

  /**
   * Finds a dataset version by ID, optionally scoped to a dataset.
   *
   * @param versionId - The version ID.
   * @param datasetId - Optional dataset ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The DatasetVersion, or `null` if not found.
   */
  async findDatasetVersion(
    versionId: string,
    datasetId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersion | null> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findFirst({
      where: { id: versionId, ...(datasetId ? { datasetId } : {}) },
    });
  }

  /**
   * Finds a dataset version with its splits.
   *
   * @param versionId - The version ID.
   * @param datasetId - Optional dataset ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The DatasetVersion with splits, or `null`.
   */
  async findDatasetVersionWithSplits(
    versionId: string,
    datasetId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersionWithSplits | null> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findFirst({
      where: { id: versionId, ...(datasetId ? { datasetId } : {}) },
      include: {
        splits: {
          select: { id: true, name: true, type: true, sampleIds: true },
        },
      },
    });
  }

  /**
   * Finds a dataset version including any benchmark definitions that reference it
   * (used for deletion validation).
   *
   * @param versionId - The version ID.
   * @param datasetId - Dataset ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The DatasetVersion with definition references, or `null`.
   */
  async findDatasetVersionForDeletion(
    versionId: string,
    datasetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersionForDeletion | null> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      include: { benchmarkDefinitions: { select: { id: true, name: true } } },
    });
  }

  /**
   * Returns all versions for a dataset, ordered newest first, including their splits.
   *
   * @param datasetId - The dataset ID.
   * @param tx - Optional transaction client.
   * @returns Array of DatasetVersions with splits.
   */
  async findAllDatasetVersionsWithSplits(
    datasetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersionWithSplits[]> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.findMany({
      where: { datasetId },
      include: {
        splits: {
          select: { id: true, name: true, type: true, sampleIds: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Counts dataset versions matching the given filter.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   * @returns The count.
   */
  async countDatasetVersions(
    where: Prisma.DatasetVersionWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.count({ where });
  }

  /**
   * Updates a dataset version.
   *
   * @param id - The version ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated DatasetVersion.
   */
  async updateDatasetVersion(
    id: string,
    data: Prisma.DatasetVersionUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DatasetVersion> {
    const client = tx ?? this.prisma;
    return client.datasetVersion.update({ where: { id }, data });
  }

  /**
   * Deletes a dataset version by ID.
   *
   * @param id - The version ID.
   * @param tx - Optional transaction client.
   */
  async deleteDatasetVersion(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.datasetVersion.delete({ where: { id } });
  }

  /**
   * Deletes all dataset versions matching the given filter.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   */
  async deleteManyDatasetVersions(
    where: Prisma.DatasetVersionWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.datasetVersion.deleteMany({ where });
  }

  // ---- Split operations ----

  /**
   * Creates a new split.
   *
   * @param data - Split creation data.
   * @param tx - Optional transaction client.
   * @returns The created Split.
   */
  async createSplit(
    data: CreateSplitData,
    tx?: Prisma.TransactionClient,
  ): Promise<Split> {
    const client = tx ?? this.prisma;
    return client.split.create({ data });
  }

  /**
   * Finds a split by ID, optionally scoped to a version.
   *
   * @param splitId - The split ID.
   * @param versionId - Optional version ID to scope the query.
   * @param tx - Optional transaction client.
   * @returns The Split, or `null` if not found.
   */
  async findSplit(
    splitId: string,
    versionId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Split | null> {
    const client = tx ?? this.prisma;
    return client.split.findFirst({
      where: {
        id: splitId,
        ...(versionId ? { datasetVersionId: versionId } : {}),
      },
    });
  }

  /**
   * Finds a split by name within a version (for conflict detection).
   *
   * @param versionId - The version ID.
   * @param name - The split name.
   * @param tx - Optional transaction client.
   * @returns The Split, or `null` if not found.
   */
  async findSplitByName(
    versionId: string,
    name: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Split | null> {
    const client = tx ?? this.prisma;
    return client.split.findFirst({
      where: { datasetVersionId: versionId, name },
    });
  }

  /**
   * Returns all splits for a dataset version.
   *
   * @param versionId - The version ID.
   * @param tx - Optional transaction client.
   * @returns Array of Splits.
   */
  async findAllSplitsForVersion(
    versionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Split[]> {
    const client = tx ?? this.prisma;
    return client.split.findMany({
      where: { datasetVersionId: versionId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Updates a split.
   *
   * @param id - The split ID.
   * @param data - Fields to update.
   * @param tx - Optional transaction client.
   * @returns The updated Split.
   */
  async updateSplit(
    id: string,
    data: Prisma.SplitUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Split> {
    const client = tx ?? this.prisma;
    return client.split.update({ where: { id }, data });
  }

  /**
   * Deletes all splits matching the given filter.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   */
  async deleteManySplits(
    where: Prisma.SplitWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.split.deleteMany({ where });
  }

  // ---- Cascade helpers ----

  /**
   * Deletes all benchmark runs matching the given filter.
   * Used as part of cascade deletion.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   */
  async deleteManyBenchmarkRuns(
    where: Prisma.BenchmarkRunWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkRun.deleteMany({ where });
  }

  /**
   * Deletes all benchmark definitions matching the given filter.
   * Used as part of cascade deletion.
   *
   * @param where - Filter conditions.
   * @param tx - Optional transaction client.
   */
  async deleteManyBenchmarkDefinitions(
    where: Prisma.BenchmarkDefinitionWhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.benchmarkDefinition.deleteMany({ where });
  }
}
