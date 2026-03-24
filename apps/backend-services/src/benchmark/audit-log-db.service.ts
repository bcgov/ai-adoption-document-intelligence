import {
  AuditAction,
  BenchmarkAuditLog,
  Prisma,
  PrismaClient,
} from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface CreateAuditLogData {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface FindAuditLogsWhere {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  timestamp?: Prisma.DateTimeFilter;
}

@Injectable()
export class AuditLogDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a benchmark audit log entry.
   *
   * @param data - Audit log data to record.
   * @param tx - Optional transaction client.
   * @returns The created BenchmarkAuditLog record.
   */
  async createAuditLog(
    data: CreateAuditLogData,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkAuditLog> {
    const client = tx ?? this.prisma;
    return client.benchmarkAuditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: (data.metadata ?? null) as Prisma.InputJsonValue,
        ...(data.timestamp ? { timestamp: data.timestamp } : {}),
      },
    });
  }

  /**
   * Returns all audit log entries matching the given filters.
   *
   * @param where - Filter conditions.
   * @param limit - Maximum number of records to return.
   * @param tx - Optional transaction client.
   * @returns Array of matching BenchmarkAuditLog records.
   */
  async findAllAuditLogs(
    where: FindAuditLogsWhere,
    limit = 100,
    tx?: Prisma.TransactionClient,
  ): Promise<BenchmarkAuditLog[]> {
    const client = tx ?? this.prisma;
    return client.benchmarkAuditLog.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: limit,
    });
  }
}
