import { Prisma, type PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface AuditEventCreateData {
  event_type: string;
  resource_type: string;
  resource_id: string;
  actor_id: string | null;
  document_id: string | null;
  workflow_execution_id: string | null;
  group_id: string | null;
  request_id: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Database service for AuditEvent operations within the Audit module.
 */
@Injectable()
export class AuditDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Creates a single audit event record.
   * @param data - The fully resolved audit event data.
   * @param tx - Optional transaction client.
   */
  async createAuditEvent(
    data: AuditEventCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditEvent.create({
      data: {
        event_type: data.event_type,
        resource_type: data.resource_type,
        resource_id: data.resource_id,
        actor_id: data.actor_id,
        document_id: data.document_id,
        workflow_execution_id: data.workflow_execution_id,
        group_id: data.group_id,
        request_id: data.request_id,
        payload: (data.payload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }
}
