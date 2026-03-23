/**
 * Audit Log Service
 *
 * Records benchmark-related events for audit trail purposes.
 * Provides queryable audit logs for dataset operations, benchmark runs, and configuration changes.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-025-audit-logging.md
 */

import { AuditAction, BenchmarkAuditLog, Prisma } from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import { AuditLogDbService, FindAuditLogsWhere } from "./audit-log-db.service";

export interface LogAuditEventParams {
  actorId: string;
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

  constructor(private readonly auditLogDbService: AuditLogDbService) {}

  /**
   * Log a dataset creation event
   */
  async logDatasetCreated(
    actorId: string,
    datasetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      actorId,
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
    actorId: string,
    versionId: string,
    datasetId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      actorId: actorId,
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
    actorId: string,
    runId: string,
    definitionId: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      actorId,
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
    actorId: string,
    runId: string,
    status: string,
    metrics?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      actorId,
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
    actorId: string,
    runId: string,
    projectId: string,
    metadata?: Record<string, unknown>,
  ): Promise<BenchmarkAuditLog> {
    return this.logAuditEvent({
      actorId,
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
    const { actorId, action, entityType, entityId, metadata } = params;

    this.logger.log(
      `Audit log: ${action} | ${entityType}:${entityId} | actor:${actorId}`,
    );

    return this.auditLogDbService.createAuditLog({
      actorId,
      action,
      entityType,
      entityId,
      metadata: metadata as Record<string, unknown>,
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

    const where: FindAuditLogsWhere = {};

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

    return this.auditLogDbService.findAllAuditLogs(where, limit);
  }
}
