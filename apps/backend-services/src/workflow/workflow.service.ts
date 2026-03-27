import { Prisma } from "@generated/client";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { validateGraphConfig } from "./graph-schema-validator";
import { GraphWorkflowConfig } from "./graph-workflow-types";

/** Stable lineage id + the version row whose config is returned (head or pinned). */
export interface WorkflowInfo {
  /** WorkflowLineage.id */
  id: string;
  /** WorkflowVersion.id for this config snapshot */
  workflowVersionId: string;
  name: string;
  description: string | null;
  userId: string;
  groupId: string;
  config: GraphWorkflowConfig;
  schemaVersion: string;
  /** Immutable version number (WorkflowVersion.version_number) */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowVersionSummary {
  id: string;
  versionNumber: number;
  createdAt: Date;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  config: GraphWorkflowConfig;
  groupId: string;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  private stableStringify(obj: unknown): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return (
        "[" + obj.map((item) => this.stableStringify(item)).join(",") + "]"
      );
    }
    const sortedKeys = Object.keys(obj as object).sort();
    const pairs = sortedKeys.map(
      (k) =>
        JSON.stringify(k) +
        ":" +
        this.stableStringify((obj as Record<string, unknown>)[k]),
    );
    return "{" + pairs.join(",") + "}";
  }

  private asGraphConfig(config: unknown): GraphWorkflowConfig {
    return config as unknown as GraphWorkflowConfig;
  }

  private configChanged(
    oldConfig: GraphWorkflowConfig,
    newConfig: GraphWorkflowConfig,
  ): boolean {
    const oldStr = this.stableStringify(oldConfig);
    const newStr = this.stableStringify(newConfig);
    return oldStr !== newStr;
  }

  private mapLineageAndVersion(
    lineage: {
      id: string;
      name: string;
      description: string | null;
      user_id: string;
      group_id: string;
      created_at: Date;
      updated_at: Date;
    },
    version: {
      id: string;
      version_number: number;
      config: unknown;
    },
  ): WorkflowInfo {
    const config = this.asGraphConfig(version.config);
    return {
      id: lineage.id,
      workflowVersionId: version.id,
      name: lineage.name,
      description: lineage.description,
      userId: lineage.user_id,
      groupId: lineage.group_id,
      config,
      schemaVersion: config.schemaVersion,
      version: version.version_number,
      createdAt: lineage.created_at,
      updatedAt: lineage.updated_at,
    };
  }

  /**
   * Resolve by WorkflowVersion id (execution / documents) or WorkflowLineage id (head).
   */
  async getWorkflowById(
    workflowOrVersionId: string,
  ): Promise<WorkflowInfo | null> {
    const byVersion = await this.prisma.workflowVersion.findUnique({
      where: { id: workflowOrVersionId },
      include: { lineage: true },
    });
    if (byVersion) {
      return this.mapLineageAndVersion(byVersion.lineage, byVersion);
    }

    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: workflowOrVersionId },
      include: { headVersion: true },
    });
    if (!lineage?.headVersion) {
      return null;
    }
    return this.mapLineageAndVersion(lineage, lineage.headVersion);
  }

  async getWorkflowVersionById(
    workflowVersionId: string,
  ): Promise<WorkflowInfo | null> {
    const row = await this.prisma.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      include: { lineage: true },
    });
    if (!row) {
      return null;
    }
    return this.mapLineageAndVersion(row.lineage, row);
  }

  async getUserWorkflows(
    userId: string,
    includeBenchmarkCandidates = false,
  ): Promise<WorkflowInfo[]> {
    const lineages = await this.prisma.workflowLineage.findMany({
      where: {
        user_id: userId,
        ...(includeBenchmarkCandidates ? {} : { workflow_kind: "primary" }),
      },
      include: { headVersion: true },
      orderBy: { created_at: "desc" },
    });

    return lineages
      .filter(
        (
          l,
        ): l is typeof l & { headVersion: NonNullable<typeof l.headVersion> } =>
          Boolean(l.headVersion),
      )
      .map((l) => this.mapLineageAndVersion(l, l.headVersion));
  }

  async getGroupWorkflows(
    groupIds: string[],
    includeBenchmarkCandidates = false,
  ): Promise<WorkflowInfo[]> {
    const lineages = await this.prisma.workflowLineage.findMany({
      where: {
        group_id: { in: groupIds },
        ...(includeBenchmarkCandidates ? {} : { workflow_kind: "primary" }),
      },
      include: { headVersion: true },
      orderBy: { created_at: "desc" },
    });

    return lineages
      .filter(
        (
          l,
        ): l is typeof l & { headVersion: NonNullable<typeof l.headVersion> } =>
          Boolean(l.headVersion),
      )
      .map((l) => this.mapLineageAndVersion(l, l.headVersion));
  }

  async getWorkflow(lineageId: string, userId: string): Promise<WorkflowInfo> {
    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: { headVersion: true },
    });

    if (!lineage?.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.debug(`getWorkflow: ${lineageId} requested by user ${userId}`);

    return this.mapLineageAndVersion(lineage, lineage.headVersion);
  }

  async createWorkflow(
    userId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowInfo> {
    const validation = validateGraphConfig(dto.config);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid workflow configuration",
        errors: validation.errors,
      });
    }

    const { lineage, version } = await this.prisma.$transaction(async (tx) => {
      const lineageRow = await tx.workflowLineage.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          user_id: userId,
          group_id: dto.groupId,
        },
      });
      const versionRow = await tx.workflowVersion.create({
        data: {
          lineage_id: lineageRow.id,
          version_number: 1,
          config: dto.config as object,
        },
      });
      const updated = await tx.workflowLineage.update({
        where: { id: lineageRow.id },
        data: { head_version_id: versionRow.id },
        include: { headVersion: true },
      });
      return {
        lineage: updated,
        version: updated.headVersion!,
      };
    });

    this.logger.log(
      `Workflow lineage created: ${lineage.id} v${version.version_number} by user ${userId}`,
    );

    return this.mapLineageAndVersion(lineage, version);
  }

  async updateWorkflow(
    lineageId: string,
    userId: string,
    dto: Partial<CreateWorkflowDto>,
  ): Promise<WorkflowInfo> {
    const existing = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: { headVersion: true },
    });

    if (!existing?.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.debug(`updateWorkflow: ${lineageId} by user ${userId}`);

    const lineageUpdates: {
      name?: string;
      description?: string | null;
    } = {};
    if (dto.name !== undefined) {
      lineageUpdates.name = dto.name;
    }
    if (dto.description !== undefined) {
      lineageUpdates.description = dto.description;
    }

    let newVersion: WorkflowInfo | null = null;

    if (dto.config) {
      const validation = validateGraphConfig(dto.config);
      if (!validation.valid) {
        throw new BadRequestException({
          message: "Invalid workflow configuration",
          errors: validation.errors,
        });
      }

      const oldConfig = this.asGraphConfig(existing.headVersion.config);
      const nextConfig = dto.config as GraphWorkflowConfig;

      if (this.configChanged(oldConfig, nextConfig)) {
        const nextNum = existing.headVersion.version_number + 1;
        this.logger.log(
          `Appending workflow version for lineage ${lineageId}: ${existing.headVersion.version_number} -> ${nextNum}`,
        );

        const { lineage, version } = await this.prisma.$transaction(
          async (tx) => {
            await tx.workflowLineage.update({
              where: { id: lineageId },
              data: {
                ...lineageUpdates,
              },
            });
            const versionRow = await tx.workflowVersion.create({
              data: {
                lineage_id: lineageId,
                version_number: nextNum,
                config: nextConfig as object,
              },
            });
            const updatedLineage = await tx.workflowLineage.update({
              where: { id: lineageId },
              data: { head_version_id: versionRow.id },
              include: { headVersion: true },
            });
            return {
              lineage: updatedLineage,
              version: updatedLineage.headVersion!,
            };
          },
        );

        newVersion = this.mapLineageAndVersion(lineage, version);
      }
    }

    if (newVersion) {
      this.logger.log(
        `Workflow updated: ${lineageId} by user ${userId}, new version ${newVersion.version}`,
      );
      return newVersion;
    }

    if (Object.keys(lineageUpdates).length === 0) {
      const unchanged = await this.prisma.workflowLineage.findUnique({
        where: { id: lineageId },
        include: { headVersion: true },
      });
      if (!unchanged?.headVersion) {
        throw new NotFoundException(`Workflow not found: ${lineageId}`);
      }
      this.logger.log(
        `Workflow unchanged: ${lineageId} by user ${userId} (no metadata or config change)`,
      );
      return this.mapLineageAndVersion(unchanged, unchanged.headVersion);
    }

    const lineageOnly = await this.prisma.workflowLineage.update({
      where: { id: lineageId },
      data: lineageUpdates,
      include: { headVersion: true },
    });

    if (!lineageOnly.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.log(
      `Workflow metadata updated: ${lineageId} by user ${userId} (version unchanged)`,
    );

    return this.mapLineageAndVersion(lineageOnly, lineageOnly.headVersion);
  }

  /**
   * New lineage + v1 from a candidate config (does not mutate the source lineage).
   */
  async createCandidateVersion(
    sourceWorkflowVersionId: string,
    candidateConfig: GraphWorkflowConfig,
    userId: string,
  ): Promise<WorkflowInfo> {
    const source = await this.prisma.workflowVersion.findUnique({
      where: { id: sourceWorkflowVersionId },
      include: { lineage: true },
    });

    if (!source) {
      throw new NotFoundException(
        `Source workflow version not found: ${sourceWorkflowVersionId}`,
      );
    }

    const baseLineageId = source.lineage.id;

    const validation = validateGraphConfig(candidateConfig);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid candidate workflow configuration",
        errors: validation.errors,
      });
    }

    const { lineage, version } = await this.prisma.$transaction(async (tx) => {
      const lineageRow = await tx.workflowLineage.create({
        data: {
          name: `${source.lineage.name} (candidate v${source.version_number + 1})`,
          description: `AI-generated candidate from workflow version ${sourceWorkflowVersionId}`,
          user_id: userId,
          group_id: source.lineage.group_id,
          workflow_kind: "benchmark_candidate",
          source_workflow_id: baseLineageId,
        },
      });
      const versionRow = await tx.workflowVersion.create({
        data: {
          lineage_id: lineageRow.id,
          version_number: 1,
          config: candidateConfig as object,
        },
      });
      const updated = await tx.workflowLineage.update({
        where: { id: lineageRow.id },
        data: { head_version_id: versionRow.id },
        include: { headVersion: true },
      });
      return { lineage: updated, version: updated.headVersion! };
    });

    this.logger.log(
      `Candidate workflow lineage created: ${lineage.id} from source version ${sourceWorkflowVersionId}`,
    );

    return this.mapLineageAndVersion(lineage, version);
  }

  async deleteWorkflow(lineageId: string, userId: string): Promise<void> {
    const existing = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    try {
      await this.prisma.workflowLineage.delete({
        where: { id: lineageId },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new ConflictException(
          "This workflow cannot be deleted because it is still referenced by benchmark definitions, ground-truth jobs, or other data. Remove or reassign those references first.",
        );
      }
      throw error;
    }

    this.logger.log(`Workflow lineage deleted: ${lineageId} by user ${userId}`);
  }

  async listVersions(lineageId: string): Promise<WorkflowVersionSummary[]> {
    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
    });
    if (!lineage) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }
    const rows = await this.prisma.workflowVersion.findMany({
      where: { lineage_id: lineageId },
      orderBy: { version_number: "desc" },
      select: { id: true, version_number: true, created_at: true },
    });
    return rows.map((r) => ({
      id: r.id,
      versionNumber: r.version_number,
      createdAt: r.created_at,
    }));
  }

  /**
   * Moves lineage head to an existing version (defaults for new uploads; does not change benchmark pins).
   */
  async revertHeadToVersion(
    lineageId: string,
    workflowVersionId: string,
    userId: string,
  ): Promise<WorkflowInfo> {
    const version = await this.prisma.workflowVersion.findUnique({
      where: { id: workflowVersionId },
    });
    if (!version || version.lineage_id !== lineageId) {
      throw new BadRequestException(
        `Version ${workflowVersionId} does not belong to lineage ${lineageId}`,
      );
    }

    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
    });
    if (!lineage) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.log(
      `revertHeadToVersion: lineage ${lineageId} -> version ${workflowVersionId} by ${userId}`,
    );

    const updated = await this.prisma.workflowLineage.update({
      where: { id: lineageId },
      data: { head_version_id: workflowVersionId },
      include: { headVersion: true },
    });
    if (!updated.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }
    return this.mapLineageAndVersion(updated, updated.headVersion);
  }
}
