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
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import Ajv from "ajv";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { getPrismaPgOptions } from "@/utils/database-url";
import {
  CreateDatasetDto,
  CreateVersionDto,
  DatasetResponseDto,
  GroundTruthResponseDto,
  ManifestSampleDto,
  PaginatedDatasetResponseDto,
  SampleListResponseDto,
  UploadedFileDto,
  UploadResponseDto,
  ValidateDatasetRequestDto,
  ValidationIssue,
  ValidationResponseDto,
  VersionListItemDto,
  VersionListResponseDto,
  VersionResponseDto,
} from "./dto";
import { DvcService } from "./dvc.service";

const mkdtemp = promisify(fs.mkdtemp);
const rm = promisify(fs.rm);
const access = promisify(fs.access);
const mkdir = promisify(fs.mkdir);

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

    let workingDir: string;
    let isNewRepository = false;
    let needsCleanup = false;

    // Expand tilde in repository URL if present
    const expandedUrl = createDto.repositoryUrl.startsWith('~')
      ? createDto.repositoryUrl.replace(/^~/, os.homedir())
      : createDto.repositoryUrl;

    try {
      // Determine if this is a remote URL or local path
      const isRemoteUrl =
        expandedUrl.startsWith('http://') ||
        expandedUrl.startsWith('https://') ||
        expandedUrl.startsWith('git@');

      if (isRemoteUrl) {
        // For remote URLs, clone to temp directory
        workingDir = await mkdtemp(path.join(os.tmpdir(), "dataset-init-"));
        needsCleanup = true;
        await this.dvcService.cloneRepository(createDto.repositoryUrl, workingDir);
        this.logger.log(`Cloned existing repository: ${createDto.repositoryUrl}`);
      } else {
        // For local paths, check if repository exists
        try {
          // Try to access the directory
          await access(expandedUrl);
          // Directory exists, clone to temp directory
          workingDir = await mkdtemp(path.join(os.tmpdir(), "dataset-init-"));
          needsCleanup = true;
          await this.dvcService.cloneRepository(createDto.repositoryUrl, workingDir);
          this.logger.log(`Cloned existing repository: ${createDto.repositoryUrl}`);
        } catch {
          // Directory doesn't exist, create new repository at the target location
          this.logger.log(
            `Creating new repository at ${expandedUrl}`
          );
          await mkdir(expandedUrl, { recursive: true });
          workingDir = expandedUrl;
          isNewRepository = true;
          await this.dvcService.createNewRepository(workingDir);
        }
      }

      // Initialize DVC with MinIO remote
      await this.dvcService.initRepository(workingDir);

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
      // Clean up temporary directory (only if we used one)
      if (needsCleanup && workingDir) {
        try {
          await rm(workingDir, { recursive: true, force: true });
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to clean up temp directory: ${workingDir}`,
            cleanupError,
          );
        }
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
   * Delete a dataset by ID
   */
  async deleteDataset(id: string): Promise<void> {
    this.logger.debug(`Deleting dataset with ID: ${id}`);

    const dataset = await this.prisma.dataset.findUnique({
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

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${id} not found`);
    }

    // Manually cascade delete to handle foreign key constraints
    // 1. Delete benchmark runs associated with definitions
    for (const version of dataset.versions) {
      for (const definition of version.benchmarkDefinitions) {
        await this.prisma.benchmarkRun.deleteMany({
          where: { definitionId: definition.id },
        });
      }
      // 2. Delete benchmark definitions
      await this.prisma.benchmarkDefinition.deleteMany({
        where: { datasetVersionId: version.id },
      });
      // 3. Delete splits
      await this.prisma.split.deleteMany({
        where: { datasetVersionId: version.id },
      });
    }

    // 4. Delete versions
    await this.prisma.datasetVersion.deleteMany({
      where: { datasetId: id },
    });

    // 5. Finally delete the dataset
    await this.prisma.dataset.delete({
      where: { id },
    });

    this.logger.log(`Dataset deleted successfully: ${id}`);
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
      const manifestPath = createDto.manifestPath || "dataset-manifest.json";

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
      const gitRevision = await this.dvcService.commitChanges(
        tempDir,
        commitMessage,
      );

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
    this.logger.log(`Publishing version ${versionId} for dataset ${datasetId}`);

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
    this.logger.log(`Archiving version ${versionId} for dataset ${datasetId}`);

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

    // Get all versions for this dataset, including splits
    const versions = await this.prisma.datasetVersion.findMany({
      where: { datasetId: datasetId },
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
      splits: v.splits.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        sampleCount: Array.isArray(s.sampleIds) ? s.sampleIds.length : 0,
      })),
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
    this.logger.debug(`Getting version ${versionId} for dataset ${datasetId}`);

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
      const paginatedSamples = manifest.samples.slice(skip, skip + validLimit);

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
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
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
   * Get ground truth JSON content for a specific sample
   */
  async getGroundTruth(
    datasetId: string,
    versionId: string,
    sampleId: string,
  ): Promise<GroundTruthResponseDto> {
    this.logger.debug(
      `Getting ground truth for dataset ${datasetId}, version ${versionId}, sample ${sampleId}`,
    );

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
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dataset-gt-"));

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

      // Find the sample
      const sample = manifest.samples.find((s) => s.id === sampleId);
      if (!sample) {
        throw new NotFoundException(
          `Sample with ID ${sampleId} not found in version ${versionId}`,
        );
      }

      // Get the first ground truth file (most common case)
      if (!sample.groundTruth || sample.groundTruth.length === 0) {
        throw new NotFoundException(
          `Sample ${sampleId} has no ground truth files`,
        );
      }

      const groundTruthFile = sample.groundTruth[0];
      const groundTruthPath = path.join(tempDir, groundTruthFile.path);

      // Read and parse the ground truth file
      let content: Record<string, unknown>;
      try {
        const fileContent = await fs.promises.readFile(
          groundTruthPath,
          "utf-8",
        );
        content = JSON.parse(fileContent);
      } catch (error) {
        this.logger.error(
          `Failed to read or parse ground truth file at ${groundTruthFile.path}`,
          error.stack,
        );
        throw new BadRequestException(
          `Failed to read or parse ground truth file: ${error.message}`,
        );
      }

      return {
        sampleId,
        content,
        path: groundTruthFile.path,
        format: groundTruthFile.format,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to get ground truth for dataset ${datasetId}, version ${versionId}, sample ${sampleId}`,
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
      const manifestContent = await fs.promises.readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);

      // Validate manifest schema
      if (
        !manifest.schemaVersion ||
        typeof manifest.schemaVersion !== "string"
      ) {
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
        if (
          sample.metadata !== undefined &&
          typeof sample.metadata !== "object"
        ) {
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

    const groundTruthExtensions = [
      ".json",
      ".jsonl",
      ".csv",
      ".xlsx",
      ".parquet",
    ];

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

  /**
   * Validate a dataset version for quality issues
   * Checks for schema violations, missing ground truth, duplicates, and file corruption
   */
  async validateDatasetVersion(
    datasetId: string,
    versionId: string,
    requestDto: ValidateDatasetRequestDto,
  ): Promise<ValidationResponseDto> {
    this.logger.log(
      `Validating dataset ${datasetId}, version ${versionId} with sampleSize: ${requestDto.sampleSize || "all"}`,
    );

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
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), "dataset-validation-"),
    );

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

      // Determine samples to validate (all or random sample)
      const allSamples = manifest.samples;
      const totalSamples = allSamples.length;
      const sampled =
        !!requestDto.sampleSize && requestDto.sampleSize < totalSamples;
      const samplesToValidate = sampled
        ? this.randomSample(allSamples, requestDto.sampleSize!)
        : allSamples;

      // Initialize validation issues array
      const issues: ValidationIssue[] = [];

      // Initialize AJV for schema validation
      const ajv = new Ajv({ allErrors: true });
      let schemaValidator: ReturnType<typeof ajv.compile> | null = null;

      if (version.groundTruthSchema) {
        try {
          schemaValidator = ajv.compile(
            version.groundTruthSchema as Record<string, unknown>,
          );
        } catch (error) {
          this.logger.warn(
            `Invalid ground truth schema for version ${versionId}: ${error.message}`,
          );
        }
      }

      // Track content hashes for duplicate detection
      const contentHashes = new Map<string, string[]>();

      // Validate each sample
      for (const sample of samplesToValidate) {
        // Check for missing ground truth
        if (!sample.groundTruth || sample.groundTruth.length === 0) {
          issues.push({
            category: "missing_ground_truth",
            severity: "error",
            sampleId: sample.id,
            message: "Sample has no ground truth files",
          });
          continue;
        }

        // Validate each ground truth file
        for (const gt of sample.groundTruth) {
          const gtFilePath = path.join(tempDir, gt.path);

          // Check file existence and readability (corruption check)
          try {
            await fs.promises.access(gtFilePath, fs.constants.R_OK);
          } catch (error) {
            issues.push({
              category: "corruption",
              severity: "error",
              sampleId: sample.id,
              filePath: gt.path,
              message: "Ground truth file is not readable or does not exist",
            });
            continue;
          }

          // Read file content
          let fileContent: string;
          try {
            fileContent = await fs.promises.readFile(gtFilePath, "utf-8");
          } catch (error) {
            issues.push({
              category: "corruption",
              severity: "error",
              sampleId: sample.id,
              filePath: gt.path,
              message: "Failed to read ground truth file",
            });
            continue;
          }

          // Calculate content hash for duplicate detection
          const contentHash = crypto
            .createHash("sha256")
            .update(fileContent)
            .digest("hex");

          if (contentHashes.has(contentHash)) {
            contentHashes.get(contentHash)!.push(sample.id);
          } else {
            contentHashes.set(contentHash, [sample.id]);
          }

          // Validate JSON format for JSON files
          if (gt.format === "json") {
            try {
              const jsonData = JSON.parse(fileContent);

              // Validate against schema if available
              if (schemaValidator) {
                const valid = schemaValidator(jsonData);
                if (!valid && schemaValidator.errors) {
                  for (const error of schemaValidator.errors) {
                    issues.push({
                      category: "schema_violation",
                      severity: "error",
                      sampleId: sample.id,
                      filePath: gt.path,
                      message: `Schema validation error: ${error.instancePath} ${error.message}`,
                      details: {
                        keyword: error.keyword,
                        dataPath: error.instancePath,
                        schemaPath: error.schemaPath,
                        params: error.params,
                      },
                    });
                  }
                }
              }
            } catch (error) {
              issues.push({
                category: "corruption",
                severity: "error",
                sampleId: sample.id,
                filePath: gt.path,
                message: `Invalid JSON format: ${error.message}`,
              });
            }
          }
        }

        // Validate input files for corruption
        for (const input of sample.inputs) {
          const inputFilePath = path.join(tempDir, input.path);

          // Check file existence and readability
          try {
            await fs.promises.access(inputFilePath, fs.constants.R_OK);
          } catch (error) {
            issues.push({
              category: "corruption",
              severity: "error",
              sampleId: sample.id,
              filePath: input.path,
              message: "Input file is not readable or does not exist",
            });
            continue;
          }

          // Validate image file headers for image files
          if (input.mimeType.startsWith("image/")) {
            try {
              const buffer = await fs.promises.readFile(inputFilePath);
              const isValidImage = this.validateImageHeader(
                buffer,
                input.mimeType,
              );

              if (!isValidImage) {
                issues.push({
                  category: "corruption",
                  severity: "error",
                  sampleId: sample.id,
                  filePath: input.path,
                  message: `Invalid image file header for type ${input.mimeType}`,
                });
              }
            } catch (error) {
              issues.push({
                category: "corruption",
                severity: "error",
                sampleId: sample.id,
                filePath: input.path,
                message: "Failed to read input file for validation",
              });
            }
          }
        }
      }

      // Report duplicates
      for (const [hash, sampleIds] of contentHashes.entries()) {
        if (sampleIds.length > 1) {
          issues.push({
            category: "duplicate",
            severity: "error",
            sampleId: sampleIds[0],
            message: `Duplicate ground truth content found in ${sampleIds.length} samples`,
            details: {
              duplicateSampleIds: sampleIds,
              contentHash: hash,
            },
          });
        }
      }

      // Calculate issue counts by category
      const issueCount = {
        schemaViolations: issues.filter(
          (i) => i.category === "schema_violation",
        ).length,
        missingGroundTruth: issues.filter(
          (i) => i.category === "missing_ground_truth",
        ).length,
        duplicates: issues.filter((i) => i.category === "duplicate").length,
        corruption: issues.filter((i) => i.category === "corruption").length,
      };

      // Determine overall validity (valid if no errors)
      const errorCount = issues.filter((i) => i.severity === "error").length;
      const valid = errorCount === 0;

      return {
        valid,
        sampled,
        sampleSize: sampled ? requestDto.sampleSize : undefined,
        totalSamples,
        issueCount,
        issues,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to validate dataset ${datasetId}, version ${versionId}`,
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
   * Select N random samples from an array
   */
  private randomSample<T>(array: T[], count: number): T[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Validate image file header (magic bytes)
   */
  private validateImageHeader(buffer: Buffer, mimeType: string): boolean {
    if (buffer.length < 8) {
      return false;
    }

    // Check magic bytes for common image formats
    switch (mimeType) {
      case "image/jpeg":
      case "image/jpg":
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

      case "image/png":
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47
        );

      case "image/gif":
        return (
          buffer[0] === 0x47 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x38
        );

      case "image/webp":
        return (
          buffer[0] === 0x52 &&
          buffer[1] === 0x49 &&
          buffer[2] === 0x46 &&
          buffer[3] === 0x46 &&
          buffer[8] === 0x57 &&
          buffer[9] === 0x45 &&
          buffer[10] === 0x42 &&
          buffer[11] === 0x50
        );

      case "image/bmp":
        return buffer[0] === 0x42 && buffer[1] === 0x4d;

      case "image/tiff":
        return (
          (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) ||
          (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00)
        );

      default:
        // Unknown format - assume valid
        return true;
    }
  }

  /**
   * Create a new split for a dataset version
   * See US-033: Split Management UI
   */
  async createSplit(
    datasetId: string,
    versionId: string,
    createDto: {
      name: string;
      type: string;
      sampleIds: string[];
      stratificationRules?: Record<string, unknown>;
    },
  ): Promise<{
    id: string;
    datasetVersionId: string;
    name: string;
    type: string;
    sampleIds: string[];
    stratificationRules?: Record<string, unknown>;
    frozen: boolean;
    createdAt: Date;
  }> {
    this.logger.log(
      `Creating split '${createDto.name}' for version ${versionId}`,
    );

    // Verify version exists and belongs to dataset
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

    // Create the split
    const split = await this.prisma.split.create({
      data: {
        datasetVersionId: versionId,
        name: createDto.name,
        type: createDto.type as any, // Type is validated by Prisma enum
        sampleIds: createDto.sampleIds as Prisma.JsonValue,
        stratificationRules: createDto.stratificationRules
          ? (createDto.stratificationRules as Prisma.JsonValue)
          : null,
        frozen: false,
      },
    });

    return {
      id: split.id,
      datasetVersionId: split.datasetVersionId,
      name: split.name,
      type: split.type,
      sampleIds: split.sampleIds as string[],
      stratificationRules: split.stratificationRules
        ? (split.stratificationRules as Record<string, unknown>)
        : undefined,
      frozen: split.frozen,
      createdAt: split.createdAt,
    };
  }

  /**
   * List all splits for a dataset version
   */
  async listSplits(
    datasetId: string,
    versionId: string,
  ): Promise<
    Array<{
      id: string;
      datasetVersionId: string;
      name: string;
      type: string;
      sampleCount: number;
      frozen: boolean;
      stratificationRules?: Record<string, unknown>;
      createdAt: Date;
    }>
  > {
    // Verify version exists
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

    const splits = await this.prisma.split.findMany({
      where: {
        datasetVersionId: versionId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return splits.map((split) => ({
      id: split.id,
      datasetVersionId: split.datasetVersionId,
      name: split.name,
      type: split.type,
      sampleCount: Array.isArray(split.sampleIds)
        ? (split.sampleIds as string[]).length
        : 0,
      frozen: split.frozen,
      stratificationRules: split.stratificationRules
        ? (split.stratificationRules as Record<string, unknown>)
        : undefined,
      createdAt: split.createdAt,
    }));
  }

  /**
   * Get a single split with full details
   */
  async getSplit(
    datasetId: string,
    versionId: string,
    splitId: string,
  ): Promise<{
    id: string;
    datasetVersionId: string;
    name: string;
    type: string;
    sampleIds: string[];
    sampleCount: number;
    frozen: boolean;
    stratificationRules?: Record<string, unknown>;
    createdAt: Date;
  }> {
    // Verify version exists
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

    const split = await this.prisma.split.findFirst({
      where: {
        id: splitId,
        datasetVersionId: versionId,
      },
    });

    if (!split) {
      throw new NotFoundException(
        `Split with ID ${splitId} not found for version ${versionId}`,
      );
    }

    return {
      id: split.id,
      datasetVersionId: split.datasetVersionId,
      name: split.name,
      type: split.type,
      sampleIds: split.sampleIds as string[],
      sampleCount: Array.isArray(split.sampleIds)
        ? (split.sampleIds as string[]).length
        : 0,
      frozen: split.frozen,
      stratificationRules: split.stratificationRules
        ? (split.stratificationRules as Record<string, unknown>)
        : undefined,
      createdAt: split.createdAt,
    };
  }

  /**
   * Update a split's sample IDs
   * Throws BadRequestException if split is frozen
   */
  async updateSplit(
    datasetId: string,
    versionId: string,
    splitId: string,
    updateDto: { sampleIds: string[] },
  ): Promise<{
    id: string;
    datasetVersionId: string;
    name: string;
    type: string;
    sampleIds: string[];
    frozen: boolean;
    createdAt: Date;
  }> {
    // Verify version exists
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

    // Get the split
    const split = await this.prisma.split.findFirst({
      where: {
        id: splitId,
        datasetVersionId: versionId,
      },
    });

    if (!split) {
      throw new NotFoundException(
        `Split with ID ${splitId} not found for version ${versionId}`,
      );
    }

    // Check if frozen
    if (split.frozen) {
      throw new BadRequestException(
        "Cannot update a frozen split. Frozen splits are immutable.",
      );
    }

    // Update the split
    const updated = await this.prisma.split.update({
      where: { id: splitId },
      data: {
        sampleIds: updateDto.sampleIds as Prisma.JsonValue,
      },
    });

    return {
      id: updated.id,
      datasetVersionId: updated.datasetVersionId,
      name: updated.name,
      type: updated.type,
      sampleIds: updated.sampleIds as string[],
      frozen: updated.frozen,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Freeze a split to make it immutable
   */
  async freezeSplit(
    datasetId: string,
    versionId: string,
    splitId: string,
  ): Promise<{
    id: string;
    datasetVersionId: string;
    name: string;
    type: string;
    frozen: boolean;
  }> {
    // Verify version exists
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

    // Get the split
    const split = await this.prisma.split.findFirst({
      where: {
        id: splitId,
        datasetVersionId: versionId,
      },
    });

    if (!split) {
      throw new NotFoundException(
        `Split with ID ${splitId} not found for version ${versionId}`,
      );
    }

    // Freeze the split
    const frozen = await this.prisma.split.update({
      where: { id: splitId },
      data: { frozen: true },
    });

    return {
      id: frozen.id,
      datasetVersionId: frozen.datasetVersionId,
      name: frozen.name,
      type: frozen.type,
      frozen: frozen.frozen,
    };
  }
}
