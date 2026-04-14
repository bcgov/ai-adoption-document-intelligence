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

const WORKFLOW_VERSION_APPEND_MAX_ATTEMPTS = 3;

function isWorkflowVersionUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** Stable lineage id + the version row whose config is returned (head or pinned). */
export interface WorkflowInfo {
  /** WorkflowLineage.id */
  id: string;
  /** WorkflowVersion.id for this config snapshot */
  workflowVersionId: string;
  name: string;
  description: string | null;
  actorId: string;
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

  private readonly lineageWithHead = {
    headVersion: true,
  } as const;

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
      actor_id: string;
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
      actorId: lineage.actor_id,
      groupId: lineage.group_id,
      config,
      schemaVersion: config.schemaVersion,
      version: version.version_number,
      createdAt: lineage.created_at,
      updatedAt: lineage.updated_at,
    };
  }

  /**
   * Head config for a lineage (explicit `WorkflowLineage.id`). Use instead of
   * accepting one string that might mean version or lineage.
   */
  async getWorkflowLineageHeadById(
    lineageId: string,
  ): Promise<WorkflowInfo | null> {
    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: this.lineageWithHead,
    });
    if (!lineage?.headVersion) {
      return null;
    }
    return this.mapLineageAndVersion(lineage, lineage.headVersion);
  }

  /** Snapshot for a specific `WorkflowVersion.id` (documents, definitions, execution config). */
  async getWorkflowVersionById(
    workflowVersionId: string,
  ): Promise<WorkflowInfo | null> {
    const row = await this.prisma.workflowVersion.findUnique({
      where: { id: workflowVersionId },
      include: {
        lineage: true,
      },
    });
    if (!row) {
      return null;
    }
    return this.mapLineageAndVersion(row.lineage, row);
  }

  async getUserWorkflows(
    actorId: string,
    includeBenchmarkCandidates = false,
  ): Promise<WorkflowInfo[]> {
    const lineages = await this.prisma.workflowLineage.findMany({
      where: {
        actor_id: actorId,
        ...(includeBenchmarkCandidates ? {} : { workflow_kind: "primary" }),
      },
      include: this.lineageWithHead,
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
      include: this.lineageWithHead,
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

  /**
   * All workflow lineages (system admin listing).
   */
  async getAllWorkflowLineages(
    includeBenchmarkCandidates = false,
  ): Promise<WorkflowInfo[]> {
    const lineages = await this.prisma.workflowLineage.findMany({
      where: includeBenchmarkCandidates ? {} : { workflow_kind: "primary" },
      include: this.lineageWithHead,
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

  async getWorkflow(lineageId: string, actorId: string): Promise<WorkflowInfo> {
    const lineage = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: this.lineageWithHead,
    });

    if (!lineage?.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.debug(
      `getWorkflow: ${lineageId} requested by actor ${actorId}`,
    );

    return this.mapLineageAndVersion(lineage, lineage.headVersion);
  }

  async createWorkflow(
    actorId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowInfo> {
    const validation = validateGraphConfig(dto.config);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid workflow configuration",
        errors: validation.errors,
      });
    }

    const full = await this.prisma.$transaction(async (tx) => {
      const lineageRow = await tx.workflowLineage.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          actor_id: actorId,
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
      await tx.workflowLineage.update({
        where: { id: lineageRow.id },
        data: { head_version_id: versionRow.id },
      });
      const loaded = await tx.workflowLineage.findUnique({
        where: { id: lineageRow.id },
        include: this.lineageWithHead,
      });
      if (!loaded?.headVersion) {
        throw new NotFoundException(
          `Workflow not found after create: ${lineageRow.id}`,
        );
      }
      return loaded;
    });

    this.logger.log(
      `Workflow lineage created: ${full.id} v${full.headVersion.version_number} by actor ${actorId}`,
    );

    return this.mapLineageAndVersion(full, full.headVersion);
  }

  async updateWorkflow(
    lineageId: string,
    actorId: string,
    dto: Partial<CreateWorkflowDto>,
  ): Promise<WorkflowInfo> {
    const existing = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: this.lineageWithHead,
    });

    if (!existing?.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.debug(`updateWorkflow: ${lineageId} by actor ${actorId}`);

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

    if (dto.config) {
      const validation = validateGraphConfig(dto.config);
      if (!validation.valid) {
        throw new BadRequestException({
          message: "Invalid workflow configuration",
          errors: validation.errors,
        });
      }

      const nextConfig = dto.config as GraphWorkflowConfig;

      type VersionedHead = {
        lineage: Parameters<WorkflowService["mapLineageAndVersion"]>[0];
        version: Parameters<WorkflowService["mapLineageAndVersion"]>[1];
      };

      let versioned: VersionedHead | null = null;

      for (
        let attempt = 1;
        attempt <= WORKFLOW_VERSION_APPEND_MAX_ATTEMPTS;
        attempt++
      ) {
        try {
          versioned = await this.prisma.$transaction(async (tx) => {
            const current = await tx.workflowLineage.findUnique({
              where: { id: lineageId },
              include: this.lineageWithHead,
            });
            if (!current?.headVersion) {
              throw new NotFoundException(`Workflow not found: ${lineageId}`);
            }
            const headConfig = this.asGraphConfig(current.headVersion.config);
            if (!this.configChanged(headConfig, nextConfig)) {
              return null;
            }
            const nextNum = current.headVersion.version_number + 1;
            this.logger.log(
              `Appending workflow version for lineage ${lineageId}: ${current.headVersion.version_number} -> ${nextNum}`,
            );

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
            await tx.workflowLineage.update({
              where: { id: lineageId },
              data: { head_version_id: versionRow.id },
            });
            const updatedLineage = await tx.workflowLineage.findUnique({
              where: { id: lineageId },
              include: this.lineageWithHead,
            });
            if (!updatedLineage?.headVersion) {
              throw new NotFoundException(`Workflow not found: ${lineageId}`);
            }
            return {
              lineage: updatedLineage,
              version: updatedLineage.headVersion,
            };
          });
          break;
        } catch (err) {
          if (
            isWorkflowVersionUniqueConflict(err) &&
            attempt < WORKFLOW_VERSION_APPEND_MAX_ATTEMPTS
          ) {
            this.logger.warn(
              `Workflow version append hit unique constraint (concurrent update); retrying (${attempt}/${WORKFLOW_VERSION_APPEND_MAX_ATTEMPTS})`,
            );
            continue;
          }
          throw err;
        }
      }

      if (versioned) {
        const newVersion = this.mapLineageAndVersion(
          versioned.lineage,
          versioned.version,
        );
        this.logger.log(
          `Workflow updated: ${lineageId} by actor ${actorId}, new version ${newVersion.version}`,
        );
        return newVersion;
      }
    }

    const latest = await this.prisma.workflowLineage.findUnique({
      where: { id: lineageId },
      include: this.lineageWithHead,
    });
    if (!latest?.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    if (Object.keys(lineageUpdates).length === 0) {
      this.logger.log(
        `Workflow unchanged: ${lineageId} by actor ${actorId} (no metadata or config change)`,
      );
      return this.mapLineageAndVersion(latest, latest.headVersion);
    }

    const lineageOnly = await this.prisma.workflowLineage.update({
      where: { id: lineageId },
      data: lineageUpdates,
      include: this.lineageWithHead,
    });

    if (!lineageOnly.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }

    this.logger.log(
      `Workflow metadata updated: ${lineageId} by actor ${actorId} (version unchanged)`,
    );

    return this.mapLineageAndVersion(lineageOnly, lineageOnly.headVersion);
  }

  /**
   * New lineage + v1 from a candidate config (does not mutate the source lineage).
   */
  async createCandidateVersion(
    sourceWorkflowVersionId: string,
    candidateConfig: GraphWorkflowConfig,
    actorId: string,
  ): Promise<WorkflowInfo> {
    const source = await this.prisma.workflowVersion.findUnique({
      where: { id: sourceWorkflowVersionId },
      include: {
        lineage: {
          include: { headVersion: true },
        },
      },
    });

    if (!source) {
      throw new NotFoundException(
        `Source workflow version not found: ${sourceWorkflowVersionId}`,
      );
    }

    if (!source.lineage.headVersion) {
      throw new NotFoundException(
        `Base workflow lineage ${source.lineage.id} has no head version`,
      );
    }

    const baseLineageId = source.lineage.id;
    const candidateNameSuffix = source.lineage.headVersion.version_number + 1;

    const validation = validateGraphConfig(candidateConfig);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid candidate workflow configuration",
        errors: validation.errors,
      });
    }

    const full = await this.prisma.$transaction(async (tx) => {
      const lineageRow = await tx.workflowLineage.create({
        data: {
          name: `${source.lineage.name} (candidate v${candidateNameSuffix})`,
          description: `AI-generated candidate from workflow version ${sourceWorkflowVersionId}`,
          actor_id: actorId,
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
      await tx.workflowLineage.update({
        where: { id: lineageRow.id },
        data: { head_version_id: versionRow.id },
      });
      const loaded = await tx.workflowLineage.findUnique({
        where: { id: lineageRow.id },
        include: this.lineageWithHead,
      });
      if (!loaded?.headVersion) {
        throw new NotFoundException(
          `Candidate workflow not found after create: ${lineageRow.id}`,
        );
      }
      return loaded;
    });

    this.logger.log(
      `Candidate workflow lineage created: ${full.id} from source version ${sourceWorkflowVersionId}`,
    );

    return this.mapLineageAndVersion(full, full.headVersion);
  }

  async deleteWorkflow(lineageId: string, actorId: string): Promise<void> {
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

    this.logger.log(
      `Workflow lineage deleted: ${lineageId} by actor ${actorId}`,
    );
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
    actorId: string,
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
      `revertHeadToVersion: lineage ${lineageId} -> version ${workflowVersionId} by ${actorId}`,
    );

    const updated = await this.prisma.workflowLineage.update({
      where: { id: lineageId },
      data: { head_version_id: workflowVersionId },
      include: this.lineageWithHead,
    });
    if (!updated.headVersion) {
      throw new NotFoundException(`Workflow not found: ${lineageId}`);
    }
    return this.mapLineageAndVersion(updated, updated.headVersion);
  }
}
