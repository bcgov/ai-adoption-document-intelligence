/**
 * Dataset Service
 *
 * Provides CRUD operations for Dataset entities.
 * Manages dataset creation with DVC initialization and audit logging.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-006-dataset-service-controller.md
 */

import { AuditAction, Prisma, PrismaClient } from "@generated/client";
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "@/utils/database-url";
import { DvcService } from "./dvc.service";
import {
  CreateDatasetDto,
  DatasetResponseDto,
  PaginatedDatasetResponseDto,
} from "./dto";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";

const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    private dvcService: DvcService,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });
  }

  /**
   * Create a new dataset with DVC initialization
   */
  async createDataset(
    createDto: CreateDatasetDto,
    userId: string,
  ): Promise<DatasetResponseDto> {
    this.logger.log(`Creating dataset: ${createDto.name} for user ${userId}`);

    // Validate required fields
    if (!createDto.name) {
      throw new BadRequestException("Dataset name is required");
    }
    if (!createDto.repositoryUrl) {
      throw new BadRequestException("Repository URL is required");
    }

    // Create temporary directory for cloning and initializing
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dataset-init-"));

    try {
      // Clone repository
      await this.dvcService.cloneRepository(createDto.repositoryUrl, tempDir);

      // Initialize DVC with MinIO remote
      await this.dvcService.initRepository(tempDir);

      // Create dataset record in database
      const dataset = await this.prisma.dataset.create({
        data: {
          name: createDto.name,
          description: createDto.description || null,
          metadata: (createDto.metadata || {}) as Prisma.JsonValue,
          repositoryUrl: createDto.repositoryUrl,
          dvcRemote: "minio", // Default remote name
          createdBy: userId,
        },
      });

      // Create audit log entry
      await this.prisma.benchmarkAuditLog.create({
        data: {
          userId: userId,
          action: AuditAction.dataset_created,
          entityType: "Dataset",
          entityId: dataset.id,
          metadata: {
            name: dataset.name,
            repositoryUrl: dataset.repositoryUrl,
          },
        },
      });

      this.logger.log(`Dataset created successfully: ${dataset.id}`);

      return this.mapToResponseDto(dataset);
    } catch (error) {
      this.logger.error(
        `Failed to create dataset: ${createDto.name}`,
        error.stack,
      );
      throw error;
    } finally {
      // Clean up temporary directory
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to clean up temp directory: ${tempDir}`,
          cleanupError,
        );
      }
    }
  }

  /**
   * List datasets with pagination
   */
  async listDatasets(
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedDatasetResponseDto> {
    this.logger.debug(`Listing datasets - page: ${page}, limit: ${limit}`);

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Cap at 100
    const skip = (validPage - 1) * validLimit;

    // Get total count
    const total = await this.prisma.dataset.count();

    // Get paginated datasets with version counts
    const datasets = await this.prisma.dataset.findMany({
      skip,
      take: validLimit,
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          select: { id: true },
        },
      },
    });

    const data = datasets.map((dataset) =>
      this.mapToResponseDto(dataset, dataset.versions.length),
    );

    return {
      data,
      total,
      page: validPage,
      limit: validLimit,
      totalPages: Math.ceil(total / validLimit),
    };
  }

  /**
   * Get dataset details by ID
   */
  async getDatasetById(id: string): Promise<DatasetResponseDto> {
    this.logger.debug(`Getting dataset by ID: ${id}`);

    const dataset = await this.prisma.dataset.findUnique({
      where: { id },
      include: {
        versions: {
          select: {
            id: true,
            version: true,
            status: true,
            documentCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5, // Show 5 most recent versions
        },
      },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${id} not found`);
    }

    return this.mapToResponseDto(
      dataset,
      dataset.versions.length,
      dataset.versions,
    );
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(
    dataset: {
      id: string;
      name: string;
      description: string | null;
      metadata: unknown;
      repositoryUrl: string;
      dvcRemote: string;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    },
    versionCount?: number,
    recentVersions?: Array<{
      id: string;
      version: string;
      status: string;
      documentCount: number;
      createdAt: Date;
    }>,
  ): DatasetResponseDto {
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      metadata: dataset.metadata as Record<string, unknown>,
      repositoryUrl: dataset.repositoryUrl,
      dvcRemote: dataset.dvcRemote,
      createdBy: dataset.createdBy,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      versionCount,
      recentVersions,
    };
  }
}
