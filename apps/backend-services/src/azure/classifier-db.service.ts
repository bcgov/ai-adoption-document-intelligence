import type { ClassifierModel, Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import { PrismaService } from "@/database/prisma.service";

export type ClassifierConfig = {
  labels: {
    label: string;
    fromFolder: string;
    blobFolder: string;
  }[];
};

export interface ClassifierEditableProperties {
  version?: number;
  group_id: string;
  config: ClassifierConfig;
  description: string;
  status: ClassifierStatus;
  source: ClassifierSource;
  last_used_at?: Date;
  operation_location?: string;
}

export type ClassifierModelWithGroup = ClassifierModel & {
  group: {
    id: string;
    name: string;
    description: string | null;
    created_at: Date;
    updated_at: Date;
  };
};

/**
 * Database service for ClassifierModel operations within the Azure module.
 */
@Injectable()
export class ClassifierDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a new classifier model record.
   * @param classifierName The name of the classifier.
   * @param properties The editable properties for the classifier.
   * @param actorId The ID of the user creating the classifier.
   * @returns The created ClassifierModel record.
   */
  async createClassifierModel(
    classifierName: string,
    properties: ClassifierEditableProperties,
    actorId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel> {
    const client = tx ?? this.prisma;
    return client.classifierModel.create({
      data: {
        ...properties,
        created_by: actorId,
        updated_by: actorId,
        name: classifierName,
      },
    });
  }

  /**
   * Updates an existing classifier model record.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param properties The partial properties to update.
   * @param actorId The ID of the user making the update.
   * @returns The updated ClassifierModel record.
   */
  async updateClassifierModel(
    classifierName: string,
    groupId: string,
    properties: Partial<ClassifierEditableProperties>,
    actorId: string | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel> {
    const client = tx ?? this.prisma;
    return client.classifierModel.update({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
      data: {
        ...properties,
        ...(actorId ? { created_by: actorId, updated_by: actorId } : {}),
        name: classifierName,
      },
    });
  }

  /**
   * Updates an existing classifier model record, but from a system's scheduled call.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param properties The partial properties to update.
   * @returns The updated ClassifierModel record.
   */
  async systemUpdateClassifierModel(
    classifierName: string,
    groupId: string,
    properties: Partial<ClassifierEditableProperties>,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel> {
    const client = tx ?? this.prisma;
    return client.classifierModel.update({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
      data: {
        ...properties,
        name: classifierName,
      },
    });
  }

  /**
   * Finds a classifier model by name and group ID.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @returns The ClassifierModel record or null if not found.
   */
  async findClassifierModel(
    classifierName: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel | null> {
    const client = tx ?? this.prisma;
    return client.classifierModel.findUnique({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
    });
  }

  /**
   * Finds all classifier model name/group_id pairs in the database.
   * Used for bulk lookups (e.g. orphan cleanup) to avoid N+1 queries.
   * @returns An array of `{ name, group_id }` objects for every classifier record.
   */
  async findAllClassifierNameGroupPairs(): Promise<
    { name: string; group_id: string }[]
  > {
    return this.prisma.classifierModel.findMany({
      select: { name: true, group_id: true },
    });
  }

  /**
   * Finds all classifier models belonging to the specified groups, including group details.
   * @param groupIds The list of group IDs to filter by.
   * @returns An array of ClassifierModel records with their associated group.
   */
  async findAllClassifierModelsForGroups(
    groupIds: string[] | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModelWithGroup[]> {
    const client = tx ?? this.prisma;
    return client.classifierModel.findMany({
      where:
        groupIds !== undefined ? { group_id: { in: groupIds } } : undefined,
      include: {
        group: true,
      },
    }) as Promise<ClassifierModelWithGroup[]>;
  }

  /**
   * Finds all classifier models that are currently in TRAINING status with an operation location.
   * Used by the poller to check training progress.
   * @returns An array of ClassifierModel records in TRAINING status.
   */
  async findAllTrainingClassifiers(
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel[]> {
    const client = tx ?? this.prisma;
    return client.classifierModel.findMany({
      where: {
        status: ClassifierStatus.TRAINING,
        operation_location: { not: null },
      },
    });
  }

  /**
   * Hard-deletes a classifier model record by name and group ID.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param tx Optional Prisma transaction client.
   * @returns The deleted ClassifierModel record.
   */
  async deleteClassifierModel(
    classifierName: string,
    groupId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ClassifierModel> {
    const client = tx ?? this.prisma;
    return client.classifierModel.delete({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
    });
  }

  /**
   * Finds all workflow lineages within a group whose versions reference the given classifier name.
   * Searches the config JSON blob of every WorkflowVersion for the classifier name string.
   * @param classifierName The name of the classifier to search for.
   * @param groupId The group ID to scope the search to.
   * @returns An array of objects containing workflow lineage id and name.
   */
  async findWorkflowVersionsReferencingClassifier(
    classifierName: string,
    groupId: string,
  ): Promise<{ id: string; name: string }[]> {
    const versions = await this.prisma.workflowVersion.findMany({
      where: {
        lineage: {
          group_id: groupId,
        },
      },
      select: {
        config: true,
        lineage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const referencedLineages = new Map<string, string>();
    for (const version of versions) {
      if (JSON.stringify(version.config).includes(classifierName)) {
        referencedLineages.set(version.lineage.id, version.lineage.name);
      }
    }

    return Array.from(referencedLineages.entries()).map(([id, name]) => ({
      id,
      name,
    }));
  }
}
