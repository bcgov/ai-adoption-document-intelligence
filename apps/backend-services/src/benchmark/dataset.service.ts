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
  CreateVersionDto,
  VersionResponseDto,
  VersionListResponseDto,
  VersionListItemDto,
  UploadResponseDto,
  UploadedFileDto,
  SampleListResponseDto,
  ManifestSampleDto,
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
   * Create a new dataset version
   * Runs DVC add, git commit, DVC push workflow
   */
  async createVersion(
    datasetId: string,
    createDto: CreateVersionDto,
    userId: string,
  ): Promise<VersionResponseDto> {
    this.logger.log(
      `Creating version ${createDto.version} for dataset ${datasetId}`,
    );

    // Verify dataset exists
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    // Create temporary directory for dataset operations
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dataset-version-"));

    try {
      // Clone the dataset repository
      await this.dvcService.cloneRepository(dataset.repositoryUrl, tempDir);

      // Default manifest path if not provided
      const manifestPath =
        createDto.manifestPath || "dataset-manifest.json";

      // Generate a simple manifest with document count
      // In a real implementation, this would scan the repository for actual files
      const manifestData = {
        schemaVersion: "1.0",
        samples: [],
      };
      const manifestFilePath = path.join(tempDir, manifestPath);
      await fs.promises.writeFile(
        manifestFilePath,
        JSON.stringify(manifestData, null, 2),
      );

      // Add manifest to DVC tracking (if needed, based on size/type)
      // For small JSON files, we typically just commit to Git directly
      // For actual data files, we would run: await this.dvcService.addFiles(tempDir, [manifestPath]);

      // Commit changes to Git
      const commitMessage = `Add dataset version ${createDto.version}`;
      const gitRevision =
        await this.dvcService.commitChanges(tempDir, commitMessage);

      // Push DVC-tracked files to remote (if any were added)
      // await this.dvcService.pushData(tempDir);

      // Calculate document count from manifest
      const documentCount = manifestData.samples.length;

      // Create DatasetVersion record
      const version = await this.prisma.datasetVersion.create({
        data: {
          datasetId: datasetId,
          version: createDto.version,
          gitRevision: gitRevision,
          manifestPath: manifestPath,
          documentCount: documentCount,
          groundTruthSchema: (createDto.groundTruthSchema ||
            null) as Prisma.JsonValue,
          status: "draft",
        },
      });

      this.logger.log(
        `Version created successfully: ${version.id} with git revision ${gitRevision}`,
      );

      return this.mapToVersionResponseDto(version);
    } catch (error) {
      this.logger.error(
        `Failed to create version for dataset ${datasetId}`,
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
   * Publish a dataset version
   */
  async publishVersion(
    datasetId: string,
    versionId: string,
    userId: string,
  ): Promise<VersionResponseDto> {
    this.logger.log(
      `Publishing version ${versionId} for dataset ${datasetId}`,
    );

    // Get the version
    const version = await this.prisma.datasetVersion.findFirst({
      where: {
        id: versionId,
        datasetId: datasetId,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    // Check if already published
    if (version.status === "published") {
      throw new BadRequestException(
        "Version is already published and cannot be published again",
      );
    }

    // Update version status to published
    const updatedVersion = await this.prisma.datasetVersion.update({
      where: { id: versionId },
      data: {
        status: "published",
        publishedAt: new Date(),
      },
    });

    // Create audit log entry
    await this.prisma.benchmarkAuditLog.create({
      data: {
        userId: userId,
        action: AuditAction.version_published,
        entityType: "DatasetVersion",
        entityId: updatedVersion.id,
        metadata: {
          datasetId: datasetId,
          version: updatedVersion.version,
          gitRevision: updatedVersion.gitRevision,
        },
      },
    });

    this.logger.log(`Version published successfully: ${versionId}`);

    return this.mapToVersionResponseDto(updatedVersion);
  }

  /**
   * Archive a dataset version
   */
  async archiveVersion(
    datasetId: string,
    versionId: string,
  ): Promise<VersionResponseDto> {
    this.logger.log(
      `Archiving version ${versionId} for dataset ${datasetId}`,
    );

    // Get the version
    const version = await this.prisma.datasetVersion.findFirst({
      where: {
        id: versionId,
        datasetId: datasetId,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    // Update version status to archived
    const updatedVersion = await this.prisma.datasetVersion.update({
      where: { id: versionId },
      data: {
        status: "archived",
      },
    });

    this.logger.log(`Version archived successfully: ${versionId}`);

    return this.mapToVersionResponseDto(updatedVersion);
  }

  /**
   * List versions for a dataset
   */
  async listVersions(datasetId: string): Promise<VersionListResponseDto> {
    this.logger.debug(`Listing versions for dataset ${datasetId}`);

    // Verify dataset exists
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    // Get all versions for this dataset
    const versions = await this.prisma.datasetVersion.findMany({
      where: { datasetId: datasetId },
      orderBy: { createdAt: "desc" },
    });

    const versionList: VersionListItemDto[] = versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      documentCount: v.documentCount,
      gitRevision: v.gitRevision,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
    }));

    return { versions: versionList };
  }

  /**
   * Get version details by ID
   */
  async getVersionById(
    datasetId: string,
    versionId: string,
  ): Promise<VersionResponseDto> {
    this.logger.debug(
      `Getting version ${versionId} for dataset ${datasetId}`,
    );

    const version = await this.prisma.datasetVersion.findFirst({
      where: {
        id: versionId,
        datasetId: datasetId,
      },
      include: {
        splits: {
          select: {
            id: true,
            name: true,
            type: true,
            sampleIds: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    return this.mapToVersionResponseDto(version, version.splits);
  }

  /**
   * Upload files to a dataset
   */
  async uploadFiles(
    datasetId: string,
    files: Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }>,
  ): Promise<UploadResponseDto> {
    this.logger.log(`Uploading ${files.length} files to dataset ${datasetId}`);

    // Verify dataset exists
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    // Create temporary directory for dataset operations
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dataset-upload-"));

    try {
      // Clone the dataset repository
      await this.dvcService.cloneRepository(dataset.repositoryUrl, tempDir);

      // Create inputs and ground-truth directories if they don't exist
      const inputsDir = path.join(tempDir, "inputs");
      const groundTruthDir = path.join(tempDir, "ground-truth");
      await fs.promises.mkdir(inputsDir, { recursive: true });
      await fs.promises.mkdir(groundTruthDir, { recursive: true });

      const uploadedFiles: UploadedFileDto[] = [];

      // Process each file
      for (const file of files) {
        // Determine if file is input or ground truth based on mimetype/extension
        const isGroundTruth = this.isGroundTruthFile(file);
        const targetDir = isGroundTruth ? groundTruthDir : inputsDir;
        const relativePath = isGroundTruth
          ? `ground-truth/${file.originalname}`
          : `inputs/${file.originalname}`;
        const targetPath = path.join(targetDir, file.originalname);

        // Write file to appropriate directory
        await fs.promises.writeFile(targetPath, file.buffer);

        uploadedFiles.push({
          filename: file.originalname,
          path: relativePath,
          size: file.size,
          mimeType: file.mimetype,
        });

        this.logger.debug(`File written: ${relativePath}`);
      }

      // Load or create manifest
      const manifestPath = path.join(tempDir, "dataset-manifest.json");
      let manifest: {
        schemaVersion: string;
        samples: Array<{
          id: string;
          inputs: Array<{ path: string; mimeType: string }>;
          groundTruth: Array<{ path: string; format: string }>;
          metadata?: Record<string, unknown>;
        }>;
      };

      try {
        const manifestContent = await fs.promises.readFile(
          manifestPath,
          "utf-8",
        );
        manifest = JSON.parse(manifestContent);
      } catch (error) {
        // Create new manifest if it doesn't exist
        manifest = {
          schemaVersion: "1.0",
          samples: [],
        };
      }

      // Update manifest with new file references
      // Group files by sample ID (derived from filename pattern)
      const filesBySample = this.groupFilesBySampleId(uploadedFiles);

      for (const [sampleId, sampleFiles] of Object.entries(filesBySample)) {
        // Find or create sample entry
        let sample = manifest.samples.find((s) => s.id === sampleId);
        if (!sample) {
          sample = {
            id: sampleId,
            inputs: [],
            groundTruth: [],
          };
          manifest.samples.push(sample);
        }

        // Add file references
        for (const file of sampleFiles) {
          if (file.path.startsWith("inputs/")) {
            sample.inputs.push({
              path: file.path,
              mimeType: file.mimeType,
            });
          } else if (file.path.startsWith("ground-truth/")) {
            sample.groundTruth.push({
              path: file.path,
              format: this.getGroundTruthFormat(file.filename),
            });
          }
        }
      }

      // Write updated manifest
      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify(manifest, null, 2),
      );

      this.logger.log(
        `Upload complete: ${uploadedFiles.length} files, manifest updated`,
      );

      return {
        datasetId: datasetId,
        uploadedFiles: uploadedFiles,
        manifestUpdated: true,
        totalFiles: uploadedFiles.length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload files to dataset ${datasetId}`,
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
   * List samples from a dataset version with pagination
   */
  async listSamples(
    datasetId: string,
    versionId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<SampleListResponseDto> {
    this.logger.debug(
      `Listing samples for dataset ${datasetId}, version ${versionId} - page: ${page}, limit: ${limit}`,
    );

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Cap at 100
    const skip = (validPage - 1) * validLimit;

    // Get the version
    const version = await this.prisma.datasetVersion.findFirst({
      where: {
        id: versionId,
        datasetId: datasetId,
      },
      include: {
        dataset: true,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    // Create temporary directory for checking out the dataset
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dataset-samples-"));

    try {
      // Clone the dataset repository
      await this.dvcService.cloneRepository(
        version.dataset.repositoryUrl,
        tempDir,
      );

      // Checkout the specific git revision
      await this.dvcService.checkout(tempDir, version.gitRevision);

      // Load and validate the manifest
      const manifestPath = path.join(tempDir, version.manifestPath);
      const manifest = await this.loadAndValidateManifest(manifestPath);

      // Get total count
      const total = manifest.samples.length;

      // Paginate samples
      const paginatedSamples = manifest.samples.slice(
        skip,
        skip + validLimit,
      );

      // Map to DTOs
      const samples: ManifestSampleDto[] = paginatedSamples.map((sample) => ({
        id: sample.id,
        inputs: sample.inputs,
        groundTruth: sample.groundTruth,
        metadata: sample.metadata,
      }));

      return {
        samples,
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to list samples for dataset ${datasetId}, version ${versionId}`,
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
   * Load and validate a manifest file
   */
  private async loadAndValidateManifest(manifestPath: string): Promise<{
    schemaVersion: string;
    samples: Array<{
      id: string;
      inputs: Array<{ path: string; mimeType: string }>;
      groundTruth: Array<{ path: string; format: string }>;
      metadata?: Record<string, unknown>;
    }>;
  }> {
    try {
      // Read manifest file
      const manifestContent = await fs.promises.readFile(
        manifestPath,
        "utf-8",
      );
      const manifest = JSON.parse(manifestContent);

      // Validate manifest schema
      if (!manifest.schemaVersion || typeof manifest.schemaVersion !== "string") {
        throw new BadRequestException(
          "Invalid manifest: schemaVersion is required and must be a string",
        );
      }

      if (!Array.isArray(manifest.samples)) {
        throw new BadRequestException(
          "Invalid manifest: samples must be an array",
        );
      }

      // Validate each sample
      for (let i = 0; i < manifest.samples.length; i++) {
        const sample = manifest.samples[i];

        if (!sample.id || typeof sample.id !== "string") {
          throw new BadRequestException(
            `Invalid manifest: sample at index ${i} must have an 'id' field of type string`,
          );
        }

        if (!Array.isArray(sample.inputs)) {
          throw new BadRequestException(
            `Invalid manifest: sample '${sample.id}' must have an 'inputs' array`,
          );
        }

        // Validate input files
        for (let j = 0; j < sample.inputs.length; j++) {
          const input = sample.inputs[j];
          if (!input.path || typeof input.path !== "string") {
            throw new BadRequestException(
              `Invalid manifest: sample '${sample.id}', input at index ${j} must have a 'path' field of type string`,
            );
          }
          if (!input.mimeType || typeof input.mimeType !== "string") {
            throw new BadRequestException(
              `Invalid manifest: sample '${sample.id}', input at index ${j} must have a 'mimeType' field of type string`,
            );
          }
        }

        if (!Array.isArray(sample.groundTruth)) {
          throw new BadRequestException(
            `Invalid manifest: sample '${sample.id}' must have a 'groundTruth' array`,
          );
        }

        // Validate ground truth files
        for (let j = 0; j < sample.groundTruth.length; j++) {
          const gt = sample.groundTruth[j];
          if (!gt.path || typeof gt.path !== "string") {
            throw new BadRequestException(
              `Invalid manifest: sample '${sample.id}', groundTruth at index ${j} must have a 'path' field of type string`,
            );
          }
          if (!gt.format || typeof gt.format !== "string") {
            throw new BadRequestException(
              `Invalid manifest: sample '${sample.id}', groundTruth at index ${j} must have a 'format' field of type string`,
            );
          }
        }

        // Validate metadata (optional, but must be an object if present)
        if (sample.metadata !== undefined && typeof sample.metadata !== "object") {
          throw new BadRequestException(
            `Invalid manifest: sample '${sample.id}' metadata must be an object`,
          );
        }
      }

      return manifest;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("Manifest file not found in repository");
      }
      if (error instanceof SyntaxError) {
        throw new BadRequestException(
          `Invalid manifest: malformed JSON - ${error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Determine if a file is a ground truth file based on mimetype
   */
  private isGroundTruthFile(file: {
    originalname: string;
    mimetype: string;
  }): boolean {
    const groundTruthTypes = [
      "application/json",
      "application/x-ndjson",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    const groundTruthExtensions = [".json", ".jsonl", ".csv", ".xlsx", ".parquet"];

    return (
      groundTruthTypes.includes(file.mimetype) ||
      groundTruthExtensions.some((ext) =>
        file.originalname.toLowerCase().endsWith(ext),
      )
    );
  }

  /**
   * Group uploaded files by sample ID (derived from filename)
   */
  private groupFilesBySampleId(
    files: UploadedFileDto[],
  ): Record<string, UploadedFileDto[]> {
    const groups: Record<string, UploadedFileDto[]> = {};

    for (const file of files) {
      // Extract sample ID from filename (e.g., "sample-001" from "sample-001.jpg" or "sample-001_gt.json")
      const match = file.filename.match(/^([^._]+)/);
      const sampleId = match ? match[1] : file.filename;

      if (!groups[sampleId]) {
        groups[sampleId] = [];
      }
      groups[sampleId].push(file);
    }

    return groups;
  }

  /**
   * Get ground truth format from filename
   */
  private getGroundTruthFormat(filename: string): string {
    if (filename.endsWith(".json")) return "json";
    if (filename.endsWith(".jsonl")) return "jsonl";
    if (filename.endsWith(".csv")) return "csv";
    if (filename.endsWith(".xlsx")) return "xlsx";
    if (filename.endsWith(".parquet")) return "parquet";
    return "unknown";
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

  /**
   * Map DatasetVersion entity to response DTO
   */
  private mapToVersionResponseDto(
    version: {
      id: string;
      datasetId: string;
      version: string;
      gitRevision: string;
      manifestPath: string;
      documentCount: number;
      groundTruthSchema: unknown;
      status: string;
      publishedAt: Date | null;
      createdAt: Date;
    },
    splits?: Array<{
      id: string;
      name: string;
      type: string;
      sampleIds: unknown;
    }>,
  ): VersionResponseDto {
    return {
      id: version.id,
      datasetId: version.datasetId,
      version: version.version,
      gitRevision: version.gitRevision,
      manifestPath: version.manifestPath,
      documentCount: version.documentCount,
      groundTruthSchema: version.groundTruthSchema as Record<
        string,
        unknown
      > | null,
      status: version.status,
      publishedAt: version.publishedAt,
      createdAt: version.createdAt,
      splits: splits?.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        sampleCount: Array.isArray(s.sampleIds) ? s.sampleIds.length : 0,
      })),
    };
  }
}
