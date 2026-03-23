import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getRequestContext } from "@/logging/request-context";
import type { CreateAuditEventInput } from "./audit.types";
import { AuditDbService } from "./audit-db.service";

@Injectable()
export class AuditService {
  constructor(
    private readonly auditDb: AuditDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Records one or more audit events. Failures are logged and do not throw
   * so that audit write failures do not fail the main operation.
   * When request_id or actor_id are omitted, they are filled from the current
   * request context (AsyncLocalStorage) when available.
   */
  async recordEvent(
    events: CreateAuditEventInput | CreateAuditEventInput[],
  ): Promise<void> {
    const ctx = getRequestContext();
    const list = Array.isArray(events) ? events : [events];
    for (const e of list) {
      try {
        await this.auditDb.createAuditEvent({
          event_type: e.event_type,
          resource_type: e.resource_type,
          resource_id: e.resource_id,
          actor_id: e.actor_id ?? ctx?.userId ?? null,
          document_id: e.document_id ?? null,
          workflow_execution_id: e.workflow_execution_id ?? null,
          group_id: e.group_id ?? null,
          request_id: e.request_id ?? ctx?.requestId ?? null,
          payload: e.payload,
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
