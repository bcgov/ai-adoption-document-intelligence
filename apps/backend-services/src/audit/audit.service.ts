import { Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import type { CreateAuditEventInput } from "./audit.types";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Records one or more audit events. Failures are logged and do not throw
   * so that audit write failures do not fail the main operation.
   */
  async recordEvent(
    events: CreateAuditEventInput | CreateAuditEventInput[],
  ): Promise<void> {
    const list = Array.isArray(events) ? events : [events];
    for (const e of list) {
      try {
        await this.prisma.prisma.auditEvent.create({
          data: {
            event_type: e.event_type,
            resource_type: e.resource_type,
            resource_id: e.resource_id,
            actor_id: e.actor_id ?? null,
            document_id: e.document_id ?? null,
            workflow_execution_id: e.workflow_execution_id ?? null,
            group_id: e.group_id ?? null,
            request_id: e.request_id ?? null,
            payload: (e.payload ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn("Audit event write failed (non-fatal)", {
          event_type: e.event_type,
          resource_id: e.resource_id,
          error: msg,
        });
      }
    }
  }
}
