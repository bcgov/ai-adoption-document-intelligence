/**
 * Benchmark Artifact Service
 *
 * Manages storage and retrieval of benchmark run artifacts in MinIO.
 * Handles artifact upload policies (full, failures_only, sampled) and provides
 * filtering capabilities by artifact type.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-013-benchmark-artifact-management.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.7, 6.4
 */

import { BenchmarkArtifactType, PrismaClient } from "@generated/client";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { MinioBlobStorageService } from "@/blob-storage/minio-blob-storage.service";
import { getPrismaPgOptions } from "@/utils/database-url";
import { ArtifactListResponseDto, ArtifactResponseDto } from "./dto";

export interface CreateArtifactInput {
  runId: string;
  type: BenchmarkArtifactType;
  content: Buffer;
  sampleId?: string;
  nodeId?: string;
  mimeType: string;
}

@Injectable()
export class BenchmarkArtifactService {
  private readonly logger = new Logger(BenchmarkArtifactService.name);
  private prisma: PrismaClient;
  private readonly artifactBucket: string;

  constructor(
    private configService: ConfigService,
    private minioBlobStorage: MinioBlobStorageService,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });

    // Get artifact bucket configuration (defaults to benchmark-outputs)
    this.artifactBucket = this.configService.get<string>(
      "MINIO_ARTIFACT_BUCKET",
      "benchmark-outputs",
    );
  }

  /**
   * Store an artifact in MinIO and create a database record
   */
  async createArtifact(
    input: CreateArtifactInput,
  ): Promise<ArtifactResponseDto> {
    this.logger.log(
      `Creating artifact for run ${input.runId}, type ${input.type}`,
    );

    // Verify that the run exists
    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id: input.runId },
    });

    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${input.runId}" not found`,
      );
    }

    // Generate MinIO key for the artifact
    // Format: {runId}/{type}/{sampleId}-{nodeId}-{timestamp}.ext
    const timestamp = Date.now();
    const samplePart = input.sampleId ? `${input.sampleId}-` : "";
    const nodePart = input.nodeId ? `${input.nodeId}-` : "";
    const extension = this.getExtensionForMimeType(input.mimeType);
    const key = `${input.runId}/${input.type}/${samplePart}${nodePart}${timestamp}${extension}`;

    // Upload to MinIO
    await this.minioBlobStorage.write(key, input.content);
    this.logger.debug(
      `Uploaded artifact to MinIO: ${key} (${input.content.length} bytes)`,
    );

    // Create database record
    const artifact = await this.prisma.benchmarkArtifact.create({
      data: {
        runId: input.runId,
        type: input.type,
        path: key,
        sampleId: input.sampleId || null,
        nodeId: input.nodeId || null,
        sizeBytes: BigInt(input.content.length),
        mimeType: input.mimeType,
      },
    });

    this.logger.log(`Created artifact record: ${artifact.id}`);

    return {
      id: artifact.id,
      runId: artifact.runId,
      type: artifact.type,
      path: artifact.path,
      sampleId: artifact.sampleId,
      nodeId: artifact.nodeId,
      sizeBytes: artifact.sizeBytes,
      mimeType: artifact.mimeType,
      createdAt: artifact.createdAt,
    };
  }

  /**
   * List artifacts for a benchmark run with optional type filter
   */
  async listArtifacts(
    projectId: string,
    runId: string,
    type?: BenchmarkArtifactType,
  ): Promise<ArtifactListResponseDto> {
    this.logger.log(`Listing artifacts for run ${runId}, type filter: ${type}`);

    // Verify that the run exists and belongs to the project
    const run = await this.prisma.benchmarkRun.findFirst({
      where: {
        id: runId,
        projectId,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    // Build query filter
    const whereClause: {
      runId: string;
      type?: BenchmarkArtifactType;
    } = {
      runId,
    };

    if (type) {
      whereClause.type = type;
    }

    // Fetch artifacts
    const artifacts = await this.prisma.benchmarkArtifact.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        runId: artifact.runId,
        type: artifact.type,
        path: artifact.path,
        sampleId: artifact.sampleId,
        nodeId: artifact.nodeId,
        sizeBytes: artifact.sizeBytes,
        mimeType: artifact.mimeType,
        createdAt: artifact.createdAt,
      })),
      total: artifacts.length,
    };
  }

  /**
   * Get file extension for a given MIME type
   */
  private getExtensionForMimeType(mimeType: string): string {
    const mimeToExtMap: Record<string, string> = {
      "application/json": ".json",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "text/html": ".html",
      "text/csv": ".csv",
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "application/octet-stream": ".bin",
    };

    return mimeToExtMap[mimeType] || "";
  }

  /**
   * Get artifact content from MinIO
   *
   * Retrieves the artifact file content for in-app viewing or downloading.
   */
  async getArtifactContent(
    projectId: string,
    runId: string,
    artifactId: string,
  ): Promise<Buffer> {
    this.logger.log(`Getting content for artifact ${artifactId}`);

    // Get the artifact record
    const artifact = await this.prisma.benchmarkArtifact.findFirst({
      where: {
        id: artifactId,
        runId,
        run: {
          projectId,
        },
      },
    });

    if (!artifact) {
      throw new NotFoundException(
        `Artifact with ID "${artifactId}" not found for run "${runId}"`,
      );
    }

    // Read from MinIO
    const content = await this.minioBlobStorage.read(artifact.path);

    return content;
  }
}
