/**
 * Dataset Service
 *
 * Provides CRUD operations for Dataset entities.
 * Manages dataset creation with object storage and audit logging.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-006-dataset-service-controller.md
 */

import { AuditAction, Prisma, PrismaClient, SplitType } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import Ajv from "ajv";
import * as crypto from "crypto";
import * as path from "path";
import { getPrismaPgOptions } from "@/utils/database-url";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
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

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    @Inject(BLOB_STORAGE) private blobStorage: BlobStorageInterface,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });
  }

  /**
   * Create a new dataset
   */
  async createDataset(
    createDto: CreateDatasetDto,
    userId: string,
  ): Promise<DatasetResponseDto> {
    this.logger.log(`Creating dataset: ${createDto.name} for user ${userId}`);

    if (!createDto.name) {
      throw new BadRequestException("Dataset name is required");
    }

    try {
      // Create dataset record in database
      const dataset = await this.prisma.dataset.create({
        data: {
          name: createDto.name,
          description: createDto.description || null,
          metadata: (createDto.metadata || {}) as Prisma.JsonValue,
          storagePath: "", // Will be set after we have the ID
          createdBy: userId,
        },
      });

      // Set storage path based on dataset ID
      const storagePath = `datasets/${dataset.id}`;
      await this.prisma.dataset.update({
        where: { id: dataset.id },
        data: { storagePath },
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
            storagePath,
          },
        },
      });

      this.logger.log(`Dataset created successfully: ${dataset.id}`);

      return this.mapToResponseDto({ ...dataset, storagePath });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          `A dataset with the name "${createDto.name}" already exists. Please choose a different name.`,
        );
      }
      this.logger.error(
        `Failed to create dataset: ${createDto.name}`,
        error.stack,
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Failed to create dataset: ${errorMessage}`,
      );
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

    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));
    const skip = (validPage - 1) * validLimit;

    const total = await this.prisma.dataset.count();

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
            documentCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
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
    for (const version of dataset.versions) {
      for (const definition of version.benchmarkDefinitions) {
        await this.prisma.benchmarkRun.deleteMany({
          where: { definitionId: definition.id },
        });
      }
      await this.prisma.benchmarkDefinition.deleteMany({
        where: { datasetVersionId: version.id },
      });
      await this.prisma.split.deleteMany({
        where: { datasetVersionId: version.id },
      });
    }

    await this.prisma.datasetVersion.deleteMany({
      where: { datasetId: id },
    });

    await this.prisma.dataset.delete({
      where: { id },
    });

    // Delete all files from object storage
    if (dataset.storagePath) {
      try {
        await this.blobStorage.deleteByPrefix(dataset.storagePath);
      } catch (error) {
        this.logger.warn(
          `Failed to delete storage files for dataset ${id}: ${error}`,
        );
      }
    }

    this.logger.log(`Dataset deleted successfully: ${id}`);
  }

  /**
   * Create a new empty draft dataset version.
   */
  async createVersion(
    datasetId: string,
    createDto: CreateVersionDto,
    userId: string,
  ): Promise<VersionResponseDto> {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    const existingVersionCount = await this.prisma.datasetVersion.count({
      where: { datasetId },
    });
    const versionLabel =
      createDto.version || `v${existingVersionCount + 1}`;

    this.logger.log(
      `Creating version ${versionLabel} for dataset ${datasetId}`,
    );

    const manifestPath = createDto.manifestPath || "dataset-manifest.json";

    const version = await this.prisma.datasetVersion.create({
      data: {
        datasetId: datasetId,
        version: versionLabel,
        name: createDto.name || null,
        storagePrefix: null,
        manifestPath: manifestPath,
        documentCount: 0,
        groundTruthSchema: (createDto.groundTruthSchema ||
          null) as Prisma.JsonValue,
      },
    });

    this.logger.log(
      `Version created successfully: ${version.id} (${versionLabel})`,
    );

    return this.mapToVersionResponseDto(version);
  }

  /**
   * List versions for a dataset
   */
  async listVersions(datasetId: string): Promise<VersionListResponseDto> {
    this.logger.debug(`Listing versions for dataset ${datasetId}`);

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

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
      name: v.name ?? null,
      documentCount: v.documentCount,
      storagePrefix: v.storagePrefix,
      frozen: v.frozen,
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
   * Upload files to an existing draft dataset version.
   * Uploads files to object storage and updates the manifest.
   */
  async uploadFilesToVersion(
    datasetId: string,
    versionId: string,
    files: Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }>,
    userId: string,
  ): Promise<UploadResponseDto> {
    this.logger.log(
      `Uploading ${files.length} files to dataset ${datasetId}, version ${versionId}`,
    );

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    if (version.frozen) {
      throw new BadRequestException(
        "Cannot upload files to a frozen dataset version. Create a new version instead.",
      );
    }

    const storagePrefix = `datasets/${datasetId}/${versionId}`;

    try {
      const uploadedFiles: UploadedFileDto[] = [];

      // Track filenames per directory to detect and deduplicate collisions
      const usedFilenames: Record<string, Set<string>> = {
        inputs: new Set<string>(),
        "ground-truth": new Set<string>(),
      };

      // Process each file
      for (const file of files) {
        const isGroundTruth = this.isGroundTruthFile(file);
        const dirKey = isGroundTruth ? "ground-truth" : "inputs";

        // Deduplicate filename if it already exists in this directory
        let finalFilename = file.originalname;
        if (usedFilenames[dirKey].has(finalFilename)) {
          const extMatch = finalFilename.match(/(\.[^.]+)$/);
          const ext = extMatch ? extMatch[1] : "";
          const nameWithoutExt = ext
            ? finalFilename.slice(0, -ext.length)
            : finalFilename;
          let counter = 2;
          while (usedFilenames[dirKey].has(`${nameWithoutExt}_${counter}${ext}`)) {
            counter++;
          }
          finalFilename = `${nameWithoutExt}_${counter}${ext}`;
        }
        usedFilenames[dirKey].add(finalFilename);

        const relativePath = `${dirKey}/${finalFilename}`;
        const blobKey = `${storagePrefix}/${relativePath}`;

        // Upload to object storage
        await this.blobStorage.write(blobKey, file.buffer);

        uploadedFiles.push({
          filename: finalFilename,
          path: relativePath,
          size: file.size,
          mimeType: file.mimetype,
        });

        this.logger.debug(`File uploaded: ${blobKey}`);
      }

      // Load or create manifest
      const manifestKey = `${storagePrefix}/dataset-manifest.json`;
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
        const manifestBuffer = await this.blobStorage.read(manifestKey);
        manifest = JSON.parse(manifestBuffer.toString("utf-8"));
      } catch {
        manifest = {
          schemaVersion: "1.0",
          samples: [],
        };
      }

      // Update manifest with new file references
      const existingSampleIds = new Set(manifest.samples.map((s) => s.id));
      const filesBySample = this.groupFilesBySampleId(uploadedFiles, existingSampleIds);

      for (const [sampleId, sampleFiles] of Object.entries(filesBySample)) {
        let sample = manifest.samples.find((s) => s.id === sampleId);
        if (!sample) {
          sample = {
            id: sampleId,
            inputs: [],
            groundTruth: [],
          };
          manifest.samples.push(sample);
        }

        for (const file of sampleFiles) {
          if (file.path.startsWith("inputs/")) {
            const existingIdx = sample.inputs.findIndex(
              (i) => i.path === file.path,
            );
            const entry = { path: file.path, mimeType: file.mimeType };
            if (existingIdx >= 0) {
              sample.inputs[existingIdx] = entry;
            } else {
              sample.inputs.push(entry);
            }
          } else if (file.path.startsWith("ground-truth/")) {
            const existingIdx = sample.groundTruth.findIndex(
              (g) => g.path === file.path,
            );
            const entry = {
              path: file.path,
              format: this.getGroundTruthFormat(file.filename),
            };
            if (existingIdx >= 0) {
              sample.groundTruth[existingIdx] = entry;
            } else {
              sample.groundTruth.push(entry);
            }
          }
        }
      }

      // Write updated manifest to object storage
      await this.blobStorage.write(
        manifestKey,
        Buffer.from(JSON.stringify(manifest, null, 2)),
      );

      // Update version record
      const updatedVersion = await this.prisma.datasetVersion.update({
        where: { id: versionId },
        data: {
          storagePrefix: storagePrefix,
          documentCount: manifest.samples.length,
        },
      });

      this.logger.log(
        `Upload complete: ${uploadedFiles.length} files added to version ${version.version} (${versionId})`,
      );

      return {
        datasetId: datasetId,
        uploadedFiles: uploadedFiles,
        manifestUpdated: true,
        totalFiles: uploadedFiles.length,
        version: {
          id: updatedVersion.id,
          version: updatedVersion.version,
          storagePrefix: updatedVersion.storagePrefix,
          documentCount: updatedVersion.documentCount,
        },
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to upload files to dataset ${datasetId}, version ${versionId}`,
        err.stack,
      );

      if (err.message.includes("NoSuchBucket") || err.message.includes("bucket does not exist")) {
        throw new BadRequestException(
          "Object storage bucket is not configured. Please ensure MinIO is initialized with the required buckets.",
        );
      }

      if (err.message.includes("Failed to write blob")) {
        throw new BadRequestException(
          `File upload failed: ${err.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Delete a sample from a draft dataset version.
   * Removes the sample from the manifest and deletes its files from object storage.
   */
  async deleteSample(
    datasetId: string,
    versionId: string,
    sampleId: string,
  ): Promise<void> {
    this.logger.log(
      `Deleting sample ${sampleId} from dataset ${datasetId}, version ${versionId}`,
    );

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset with ID ${datasetId} not found`);
    }

    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    if (version.frozen) {
      throw new BadRequestException(
        "Cannot delete samples from a frozen dataset version.",
      );
    }

    if (!version.storagePrefix) {
      throw new BadRequestException(
        "Cannot delete samples from a version with no files uploaded",
      );
    }

    try {
      // Load the manifest from object storage
      const manifestKey = `${version.storagePrefix}/dataset-manifest.json`;
      const manifestBuffer = await this.blobStorage.read(manifestKey);
      const manifest = JSON.parse(manifestBuffer.toString("utf-8")) as {
        schemaVersion: string;
        samples: Array<{
          id: string;
          inputs: Array<{ path: string; mimeType: string }>;
          groundTruth: Array<{ path: string; format: string }>;
          metadata?: Record<string, unknown>;
        }>;
      };

      // Find the sample
      const sampleIndex = manifest.samples.findIndex(
        (s) => s.id === sampleId,
      );

      if (sampleIndex === -1) {
        throw new NotFoundException(
          `Sample with ID ${sampleId} not found in version ${versionId}`,
        );
      }

      const sample = manifest.samples[sampleIndex];

      // Delete the sample's files from object storage
      for (const input of sample.inputs) {
        const blobKey = `${version.storagePrefix}/${input.path}`;
        try {
          await this.blobStorage.delete(blobKey);
        } catch {
          this.logger.warn(`Could not delete file: ${input.path}`);
        }
      }
      for (const gt of sample.groundTruth) {
        const blobKey = `${version.storagePrefix}/${gt.path}`;
        try {
          await this.blobStorage.delete(blobKey);
        } catch {
          this.logger.warn(`Could not delete file: ${gt.path}`);
        }
      }

      // Remove sample from manifest
      manifest.samples.splice(sampleIndex, 1);

      // Write updated manifest
      await this.blobStorage.write(
        manifestKey,
        Buffer.from(JSON.stringify(manifest, null, 2)),
      );

      // Update version record
      await this.prisma.datasetVersion.update({
        where: { id: versionId },
        data: {
          documentCount: manifest.samples.length,
        },
      });

      // Remove the sample ID from any splits that reference it
      const splits = await this.prisma.split.findMany({
        where: { datasetVersionId: versionId },
      });

      for (const split of splits) {
        const currentSampleIds = Array.isArray(split.sampleIds)
          ? (split.sampleIds as string[])
          : [];
        if (currentSampleIds.includes(sampleId)) {
          const updatedSampleIds = currentSampleIds.filter(
            (id) => id !== sampleId,
          );
          await this.prisma.split.update({
            where: { id: split.id },
            data: { sampleIds: updatedSampleIds },
          });
        }
      }

      this.logger.log(
        `Sample ${sampleId} deleted from version ${versionId}`,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to delete sample ${sampleId} from version ${versionId}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a dataset version.
   * Blocked if any benchmark definitions reference this version.
   */
  async deleteVersion(
    datasetId: string,
    versionId: string,
  ): Promise<void> {
    this.logger.log(
      `Deleting version ${versionId} for dataset ${datasetId}`,
    );

    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
      include: {
        benchmarkDefinitions: {
          select: { id: true, name: true },
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    if (version.benchmarkDefinitions.length > 0) {
      const defNames = version.benchmarkDefinitions
        .map((d) => d.name)
        .join(", ");
      throw new ConflictException(
        `Cannot delete version "${version.version}" because it is referenced by ${version.benchmarkDefinitions.length} benchmark definition(s): ${defNames}. Delete those definitions first.`,
      );
    }

    // Delete splits for the version first
    await this.prisma.split.deleteMany({
      where: { datasetVersionId: versionId },
    });

    // Delete the version record
    await this.prisma.datasetVersion.delete({
      where: { id: versionId },
    });

    // Delete files from object storage
    if (version.storagePrefix) {
      try {
        await this.blobStorage.deleteByPrefix(version.storagePrefix);
      } catch (error) {
        this.logger.warn(
          `Failed to delete storage files for version ${versionId}: ${error}`,
        );
      }
    }

    this.logger.log(`Version ${versionId} deleted successfully`);
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

    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));
    const skip = (validPage - 1) * validLimit;

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

    // If version has no storage prefix yet (no files uploaded), return empty
    if (!version.storagePrefix) {
      return {
        samples: [],
        total: 0,
        page: validPage,
        limit: validLimit,
        totalPages: 0,
      };
    }

    try {
      // Load manifest from object storage
      const manifestKey = `${version.storagePrefix}/dataset-manifest.json`;
      const manifest = await this.loadAndValidateManifestFromStorage(manifestKey);

      const total = manifest.samples.length;
      const paginatedSamples = manifest.samples.slice(skip, skip + validLimit);

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

    if (!version.storagePrefix) {
      throw new BadRequestException(
        "Version has no files uploaded yet",
      );
    }

    try {
      // Load manifest from object storage
      const manifestKey = `${version.storagePrefix}/dataset-manifest.json`;
      const manifest = await this.loadAndValidateManifestFromStorage(manifestKey);

      const sample = manifest.samples.find((s) => s.id === sampleId);
      if (!sample) {
        throw new NotFoundException(
          `Sample with ID ${sampleId} not found in version ${versionId}`,
        );
      }

      if (!sample.groundTruth || sample.groundTruth.length === 0) {
        throw new NotFoundException(
          `Sample ${sampleId} has no ground truth files`,
        );
      }

      const groundTruthFile = sample.groundTruth[0];
      const blobKey = `${version.storagePrefix}/${groundTruthFile.path}`;

      let content: Record<string, unknown>;
      try {
        const buffer = await this.blobStorage.read(blobKey);
        content = JSON.parse(buffer.toString("utf-8"));
      } catch (error) {
        this.logger.error(
          `Failed to read or parse ground truth file at ${groundTruthFile.path}`,
          error.stack,
        );
        throw new BadRequestException(
          `Failed to read or parse ground truth file: ${error instanceof Error ? error.message : String(error)}`,
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
    }
  }

  /**
   * Download a raw file from a dataset version.
   * Returns the file buffer, filename, and MIME type.
   */
  async getSampleFile(
    datasetId: string,
    versionId: string,
    filePath: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    this.logger.debug(
      `Downloading file "${filePath}" from dataset ${datasetId}, version ${versionId}`,
    );

    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId, datasetId },
    });

    if (!version) {
      throw new NotFoundException(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    }

    if (!version.storagePrefix) {
      throw new BadRequestException("Version has no files uploaded yet");
    }

    // Validate the file path to prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (
      normalizedPath.startsWith("..") ||
      path.isAbsolute(normalizedPath) ||
      normalizedPath.includes("../")
    ) {
      throw new BadRequestException("Invalid file path");
    }

    const blobKey = `${version.storagePrefix}/${normalizedPath}`;

    try {
      const exists = await this.blobStorage.exists(blobKey);
      if (!exists) {
        throw new NotFoundException(`File not found: ${filePath}`);
      }

      const buffer = await this.blobStorage.read(blobKey);
      const filename = path.basename(normalizedPath);

      // Determine MIME type from extension
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".csv": "text/csv",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".txt": "text/plain",
      };
      const mimeType = mimeTypes[ext] || "application/octet-stream";

      return { buffer, filename, mimeType };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Load and validate a manifest file from object storage
   */
  private async loadAndValidateManifestFromStorage(manifestKey: string): Promise<{
    schemaVersion: string;
    samples: Array<{
      id: string;
      inputs: Array<{ path: string; mimeType: string }>;
      groundTruth: Array<{ path: string; format: string }>;
      metadata?: Record<string, unknown>;
    }>;
  }> {
    try {
      const exists = await this.blobStorage.exists(manifestKey);
      if (!exists) {
        throw new NotFoundException("Manifest file not found in storage");
      }

      const manifestBuffer = await this.blobStorage.read(manifestKey);
      const manifest = JSON.parse(manifestBuffer.toString("utf-8"));

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
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
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
   * Group uploaded files by sample ID (derived from filename).
   *
   * The sample ID is the filename without its extension.
   * Ground truth is matched by sharing the same base name:
   *   "invoice-001.pdf"   -> sample "invoice-001"
   *   "invoice-001.json"  -> sample "invoice-001"
   */
  private groupFilesBySampleId(
    files: UploadedFileDto[],
    existingSampleIds: Set<string> = new Set(),
  ): Record<string, UploadedFileDto[]> {
    const groups: Record<string, UploadedFileDto[]> = {};
    const assignedPaths: Set<string> = new Set();

    const inputSampleIds: Set<string> = new Set();
    const gtSampleIds: Set<string> = new Set();

    for (const file of files) {
      const sampleId = file.filename.replace(/\.[^.]+$/, "");

      if (assignedPaths.has(file.path)) {
        continue;
      }

      const isInput = file.path.startsWith("inputs/");
      const isGt = file.path.startsWith("ground-truth/");

      if (isInput && inputSampleIds.has(sampleId)) {
        throw new BadRequestException(
          `Duplicate input filename detected in upload: "${file.filename}" (sample ID: "${sampleId}")`,
        );
      }
      if (isGt && gtSampleIds.has(sampleId)) {
        throw new BadRequestException(
          `Duplicate ground truth filename detected in upload: "${file.filename}" (sample ID: "${sampleId}")`,
        );
      }

      if (isInput) inputSampleIds.add(sampleId);
      if (isGt) gtSampleIds.add(sampleId);

      if (!groups[sampleId]) {
        groups[sampleId] = [];
      }
      groups[sampleId].push(file);
      assignedPaths.add(file.path);
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
      storagePath: string;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
    },
    versionCount?: number,
    recentVersions?: Array<{
      id: string;
      version: string;
      documentCount: number;
      createdAt: Date;
    }>,
  ): DatasetResponseDto {
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      metadata: dataset.metadata as Record<string, unknown>,
      storagePath: dataset.storagePath,
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
      name?: string | null;
      storagePrefix: string | null;
      manifestPath: string;
      documentCount: number;
      groundTruthSchema: unknown;
      frozen: boolean;
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
      name: version.name ?? null,
      storagePrefix: version.storagePrefix,
      manifestPath: version.manifestPath,
      documentCount: version.documentCount,
      groundTruthSchema: version.groundTruthSchema as Record<
        string,
        unknown
      > | null,
      frozen: version.frozen,
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

    if (!version.storagePrefix) {
      throw new BadRequestException(
        "Cannot validate a version with no files uploaded",
      );
    }

    try {
      const manifestKey = `${version.storagePrefix}/dataset-manifest.json`;
      const manifest = await this.loadAndValidateManifestFromStorage(manifestKey);

      const allSamples = manifest.samples;
      const totalSamples = allSamples.length;
      const sampled =
        !!requestDto.sampleSize && requestDto.sampleSize < totalSamples;
      const samplesToValidate = sampled
        ? this.randomSample(allSamples, requestDto.sampleSize!)
        : allSamples;

      const issues: ValidationIssue[] = [];

      const ajv = new Ajv({ allErrors: true });
      let schemaValidator: ReturnType<typeof ajv.compile> | null = null;

      if (version.groundTruthSchema) {
        try {
          schemaValidator = ajv.compile(
            version.groundTruthSchema as Record<string, unknown>,
          );
        } catch (error) {
          this.logger.warn(
            `Invalid ground truth schema for version ${versionId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const contentHashes = new Map<string, string[]>();

      for (const sample of samplesToValidate) {
        if (!sample.groundTruth || sample.groundTruth.length === 0) {
          issues.push({
            category: "missing_ground_truth",
            severity: "error",
            sampleId: sample.id,
            message: "Sample has no ground truth files",
          });
          continue;
        }

        for (const gt of sample.groundTruth) {
          const blobKey = `${version.storagePrefix}/${gt.path}`;

          const fileExists = await this.blobStorage.exists(blobKey);
          if (!fileExists) {
            issues.push({
              category: "corruption",
              severity: "error",
              sampleId: sample.id,
              filePath: gt.path,
              message: "Ground truth file is not readable or does not exist",
            });
            continue;
          }

          let fileContent: string;
          try {
            const buffer = await this.blobStorage.read(blobKey);
            fileContent = buffer.toString("utf-8");
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

          const contentHash = crypto
            .createHash("sha256")
            .update(fileContent)
            .digest("hex");

          if (contentHashes.has(contentHash)) {
            contentHashes.get(contentHash)!.push(sample.id);
          } else {
            contentHashes.set(contentHash, [sample.id]);
          }

          if (gt.format === "json") {
            try {
              const jsonData = JSON.parse(fileContent);

              if (schemaValidator) {
                const valid = schemaValidator(jsonData);
                if (!valid && schemaValidator.errors) {
                  for (const schemaError of schemaValidator.errors) {
                    issues.push({
                      category: "schema_violation",
                      severity: "error",
                      sampleId: sample.id,
                      filePath: gt.path,
                      message: `Schema validation error: ${schemaError.instancePath} ${schemaError.message}`,
                      details: {
                        keyword: schemaError.keyword,
                        dataPath: schemaError.instancePath,
                        schemaPath: schemaError.schemaPath,
                        params: schemaError.params,
                      },
                    });
                  }
                }
              }
            } catch (parseError) {
              issues.push({
                category: "corruption",
                severity: "error",
                sampleId: sample.id,
                filePath: gt.path,
                message: `Invalid JSON format: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              });
            }
          }
        }

        for (const input of sample.inputs) {
          const blobKey = `${version.storagePrefix}/${input.path}`;

          const fileExists = await this.blobStorage.exists(blobKey);
          if (!fileExists) {
            issues.push({
              category: "corruption",
              severity: "error",
              sampleId: sample.id,
              filePath: input.path,
              message: "Input file is not readable or does not exist",
            });
            continue;
          }

          if (input.mimeType.startsWith("image/")) {
            try {
              const buffer = await this.blobStorage.read(blobKey);
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

      for (const [hash, sampleIds] of contentHashes.entries()) {
        if (sampleIds.length > 1) {
          issues.push({
            category: "duplicate",
            severity: "warning",
            sampleId: sampleIds[0],
            message: `Duplicate ground truth content found in ${sampleIds.length} samples`,
            details: {
              duplicateSampleIds: sampleIds,
              contentHash: hash,
            },
          });
        }
      }

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
        return true;
    }
  }

  /**
   * Create a new split for a dataset version
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

    const existingSplit = await this.prisma.split.findFirst({
      where: {
        datasetVersionId: versionId,
        name: createDto.name,
      },
    });

    if (existingSplit) {
      throw new BadRequestException(
        `A split with name '${createDto.name}' already exists for this dataset version`,
      );
    }

    const split = await this.prisma.split.create({
      data: {
        datasetVersionId: versionId,
        name: createDto.name,
        type: createDto.type as SplitType,
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

    if (split.frozen) {
      throw new BadRequestException(
        "Cannot update a frozen split. Frozen splits are immutable.",
      );
    }

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
   * Freeze a dataset version to make it immutable
   */
  async freezeVersion(
    datasetId: string,
    versionId: string,
  ): Promise<{
    id: string;
    datasetId: string;
    version: string;
    name: string | null;
    frozen: boolean;
  }> {
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

    const frozen = await this.prisma.datasetVersion.update({
      where: { id: versionId },
      data: { frozen: true },
    });

    return {
      id: frozen.id,
      datasetId: frozen.datasetId,
      version: frozen.version,
      name: frozen.name,
      frozen: frozen.frozen,
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
