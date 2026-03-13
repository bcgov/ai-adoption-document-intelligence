import type { ClassifierModel, PrismaClient } from "@generated/client";
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
   * @param userId The ID of the user creating the classifier.
   * @returns The created ClassifierModel record.
   */
  async createClassifierModel(
    classifierName: string,
    properties: ClassifierEditableProperties,
    userId: string,
  ): Promise<ClassifierModel> {
    return this.prisma.classifierModel.create({
      data: {
        ...properties,
        created_by: userId,
        updated_by: userId,
        name: classifierName,
      },
    });
  }

  /**
   * Updates an existing classifier model record.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param properties The partial properties to update.
   * @param userId The ID of the user making the update.
   * @returns The updated ClassifierModel record.
   */
  async updateClassifierModel(
    classifierName: string,
    groupId: string,
    properties: Partial<ClassifierEditableProperties>,
    userId?: string,
  ): Promise<ClassifierModel> {
    return this.prisma.classifierModel.update({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
      data: {
        ...properties,
        ...(userId !== undefined
          ? { created_by: userId, updated_by: userId }
          : {}),
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
  ): Promise<ClassifierModel | null> {
    return this.prisma.classifierModel.findUnique({
      where: {
        name_group_id: {
          name: classifierName,
          group_id: groupId,
        },
      },
    });
  }

  /**
   * Finds all classifier models belonging to the specified groups, including group details.
   * @param groupIds The list of group IDs to filter by.
   * @returns An array of ClassifierModel records with their associated group.
   */
  async findAllClassifierModelsForGroups(
    groupIds: string[],
  ): Promise<ClassifierModelWithGroup[]> {
    return this.prisma.classifierModel.findMany({
      where: {
        group_id: { in: groupIds },
      },
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
  async findAllTrainingClassifiers(): Promise<ClassifierModel[]> {
    return this.prisma.classifierModel.findMany({
      where: {
        status: ClassifierStatus.TRAINING,
        operation_location: { not: null },
      },
    });
  }
}
