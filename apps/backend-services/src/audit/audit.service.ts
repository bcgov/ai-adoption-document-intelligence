import { Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";
import type { CreateAuditEventInput } from "./audit.types";
import { AuditDbService, type AuditEventCreateData } from "./audit-db.service";

@Injectable()
export class AuditService {
  constructor(
    private readonly auditDb: AuditDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Records one or more audit events. When `tx` is omitted, failures are logged
   * and do not throw so audit write failures do not fail the main operation.
   * When `tx` is provided, audit writes participate in the caller's transaction
   * and failures propagate (rolling back the transaction).
   * When request_id is omitted, it is filled from the current request context
   * (AsyncLocalStorage) when available.
   *
   * A multi-event call made with `tx` is the batch case: those events go
   * through one `createMany` round trip instead of one insert per event, so
   * recording many events does not by itself add much to the caller's
   * transaction's time budget. A single event (with or without `tx`) keeps
   * using `createAuditEvent`, unchanged.
   */
  async recordEvent(
    events: CreateAuditEventInput | CreateAuditEventInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const ctx = getRequestContext();
    const list = Array.isArray(events) ? events : [events];
    const resolved: AuditEventCreateData[] = list.map((e) => ({
      event_type: e.event_type,
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      actor_id: e.actor_id ?? ctx?.actorId ?? null,
      document_id: e.document_id ?? null,
      workflow_execution_id: e.workflow_execution_id ?? null,
      group_id: e.group_id ?? null,
      request_id: e.request_id ?? ctx?.requestId ?? null,
      payload: e.payload,
    }));

    if (tx && resolved.length > 1) {
      await this.auditDb.createAuditEvents(resolved, tx);
      return;
    }

    for (const data of resolved) {
      const write = this.auditDb.createAuditEvent(data, tx);
      if (tx) {
        await write;
        continue;
      }
      try {
        await write;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn("Audit event write failed (non-fatal)", {
          event_type: data.event_type,
          resource_id: data.resource_id,
          error: msg,
        });
      }
    }
  }
}
