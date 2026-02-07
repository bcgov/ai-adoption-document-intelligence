import { PrismaClient } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "@/utils/database-url";
import { GraphWorkflowConfig } from "./graph-workflow-types";
import { validateGraphConfig } from "./graph-schema-validator";

export interface WorkflowInfo {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  config: GraphWorkflowConfig;
  schemaVersion: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  config: GraphWorkflowConfig;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private prisma: PrismaClient;

  constructor(private configService: ConfigService) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });
  }

  /**
   * Recursively sort object keys for stable JSON stringification.
   * Ensures two semantically equal configs produce the same string regardless of key order
   * (e.g. DB vs request, or different insertion order in nested step parameters).
   */
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

  /**
   * Deep comparison of two workflow configs to detect changes
   * @param oldConfig Old configuration
   * @param newConfig New configuration
   * @returns true if configs are different, false if same
   */
  private configChanged(
    oldConfig: GraphWorkflowConfig,
    newConfig: GraphWorkflowConfig,
  ): boolean {
    const oldStr = this.stableStringify(oldConfig);
    const newStr = this.stableStringify(newConfig);
    return oldStr !== newStr;
  }

  async getUserWorkflows(userId: string): Promise<WorkflowInfo[]> {
    const workflows = await this.prisma.workflow.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });

    return workflows.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      userId: w.user_id,
      config: this.asGraphConfig(w.config),
      schemaVersion: this.asGraphConfig(w.config).schemaVersion,
      version: w.version,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    }));
  }

  async getWorkflow(workflowId: string, userId: string): Promise<WorkflowInfo> {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        user_id: userId,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow not found: ${workflowId}`);
    }

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      userId: workflow.user_id,
      config: this.asGraphConfig(workflow.config),
      schemaVersion: this.asGraphConfig(workflow.config).schemaVersion,
      version: workflow.version,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };
  }

  /**
   * Get workflow by ID without userId check (for system/internal use)
   * @param workflowId Workflow ID
   * @returns Workflow info or null if not found
   */
  async getWorkflowById(workflowId: string): Promise<WorkflowInfo | null> {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
    });

    if (!workflow) {
      return null;
    }

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      userId: workflow.user_id,
      config: this.asGraphConfig(workflow.config),
      schemaVersion: this.asGraphConfig(workflow.config).schemaVersion,
      version: workflow.version,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };
  }

  async createWorkflow(
    userId: string,
    dto: CreateWorkflowDto,
  ): Promise<WorkflowInfo> {
    // Validate workflow configuration
    const validation = validateGraphConfig(dto.config);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid workflow configuration",
        errors: validation.errors,
      });
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        user_id: userId,
        config: dto.config as object,
      },
    });

    this.logger.log(`Workflow created: ${workflow.id} by user ${userId}`);

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      userId: workflow.user_id,
      config: this.asGraphConfig(workflow.config),
      schemaVersion: this.asGraphConfig(workflow.config).schemaVersion,
      version: workflow.version,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };
  }

  async updateWorkflow(
    workflowId: string,
    userId: string,
    dto: Partial<CreateWorkflowDto>,
  ): Promise<WorkflowInfo> {
    const existing = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        user_id: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow not found: ${workflowId}`);
    }

    // Track if config changed to determine if we need to increment version
    let configChanged = false;
    let newConfig: GraphWorkflowConfig | undefined;

    // Validate config if provided
    if (dto.config) {
      // Validate workflow configuration
      const validation = validateGraphConfig(dto.config);
      if (!validation.valid) {
        throw new BadRequestException({
          message: "Invalid workflow configuration",
          errors: validation.errors,
        });
      }

      newConfig = dto.config as GraphWorkflowConfig;
      const oldConfig = this.asGraphConfig(existing.config);

      // Check if config actually changed
      configChanged = this.configChanged(oldConfig, newConfig);

      if (configChanged) {
        this.logger.log(
          `Workflow config changed for ${workflowId}, version will be incremented from ${existing.version} to ${existing.version + 1}`,
        );
      }
    }

    // Prepare update data
    const updateData: {
      name?: string;
      description?: string | null;
      config?: object;
      version?: number;
    } = {
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(newConfig && { config: newConfig as object }),
    };

    // Increment version only if config changed
    if (configChanged) {
      updateData.version = existing.version + 1;
    }

    const workflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: updateData,
    });

    if (configChanged) {
      this.logger.log(
        `Workflow updated: ${workflow.id} by user ${userId}, version incremented to ${workflow.version}`,
      );
    } else {
      this.logger.log(
        `Workflow updated: ${workflow.id} by user ${userId} (no config change, version remains ${workflow.version})`,
      );
    }

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      userId: workflow.user_id,
      config: this.asGraphConfig(workflow.config),
      schemaVersion: this.asGraphConfig(workflow.config).schemaVersion,
      version: workflow.version,
      createdAt: workflow.created_at,
      updatedAt: workflow.updated_at,
    };
  }

  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    const existing = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        user_id: userId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow not found: ${workflowId}`);
    }

    await this.prisma.workflow.delete({
      where: { id: workflowId },
    });

    this.logger.log(`Workflow deleted: ${workflowId} by user ${userId}`);
  }
}
