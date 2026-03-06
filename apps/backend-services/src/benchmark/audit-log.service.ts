/**
 * Audit Log Service
 *
 * Records benchmark-related events for audit trail purposes.
 * Provides queryable audit logs for dataset operations, benchmark runs, and configuration changes.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-025-audit-logging.md
 */

import {
  AuditAction,
  BenchmarkAuditLog,
  Prisma,
} from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface LogAuditEventParams {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface QueryAuditLogsParams {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly prisma;

  constructor(private readonly prismaService: PrismaService) {
    this.prisma = this.prismaService.prisma;
  }

  /**
   * Log a dataset creation event
   */
  async logDatasetCreated(
    userId: string,
    datasetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      userId,
      action: AuditAction.dataset_created,
      entityType: "Dataset",
      entityId: datasetId,
      metadata,
    });
  }

  /**
   * Log a version publishing event
   */
  async logVersionPublished(
    userId: string,
    versionId: string,
    datasetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      userId,
      action: AuditAction.version_published,
      entityType: "DatasetVersion",
      entityId: versionId,
      metadata: {
        versionId,
        datasetId,
        ...metadata,
      },
    });
  }

  /**
   * Log a run start event
   */
  async logRunStarted(
    userId: string,
    runId: string,
    definitionId: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      userId,
      action: AuditAction.run_started,
      entityType: "BenchmarkRun",
      entityId: runId,
      metadata: {
        definitionId,
        projectId,
        ...metadata,
      },
    });
  }

  /**
   * Log a run completion event
   */
  async logRunCompleted(
    userId: string,
    runId: string,
    status: string,
    metrics?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      userId,
      action: AuditAction.run_completed,
      entityType: "BenchmarkRun",
      entityId: runId,
      metadata: {
        status,
        metrics,
        ...metadata,
      },
    });
  }

  /**
   * Log a baseline promotion event
   */
  async logBaselinePromoted(
    userId: string,
    runId: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      userId,
      action: AuditAction.baseline_promoted,
      entityType: "BenchmarkRun",
      entityId: runId,
      metadata: {
        projectId,
        ...metadata,
      },
    });
  }

  /**
   * Generic method to log any audit event
   */
  async logAuditEvent(params: LogAuditEventParams): Promise<BenchmarkAuditLog> {
    const { userId, action, entityType, entityId, metadata } = params;

    this.logger.log(
      `Audit log: ${action} | ${entityType}:${entityId} | user:${userId}`,
    );

    return this.prisma.benchmarkAuditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Query audit logs with optional filters
   */
  async queryAuditLogs(
    params: QueryAuditLogsParams,
  ): Promise<BenchmarkAuditLog[]> {
    const {
      entityType,
      entityId,
      action,
      startDate,
      endDate,
      limit = 100,
    } = params;

    const where: Prisma.BenchmarkAuditLogWhereInput = {};

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    return this.prisma.benchmarkAuditLog.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: limit,
    });
  }
}
