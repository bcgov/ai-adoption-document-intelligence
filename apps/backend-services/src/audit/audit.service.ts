import { Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  getRequestContext,
  type RequestContextData,
} from "@/logging/request-context";
import type { CreateAuditEventInput } from "./audit.types";
import { AuditDbService } from "./audit-db.service";

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
   */
  async recordEvent(
    events: CreateAuditEventInput | CreateAuditEventInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const ctx = getRequestContext();
    const list = Array.isArray(events) ? events : [events];
    for (const e of list) {
      const write = this.auditDb.createAuditEvent(
        {
          event_type: e.event_type,
          resource_type: e.resource_type,
          resource_id: e.resource_id,
          actor_id: e.actor_id ?? ctx?.actorId ?? null,
          document_id: e.document_id ?? null,
          workflow_execution_id: e.workflow_execution_id ?? null,
          group_id: e.group_id ?? null,
          request_id: e.request_id ?? ctx?.requestId ?? null,
          payload: withDynamicNodeRun(e.payload, ctx?.dynamicNodeRun),
        },
        tx,
      );
      if (tx) {
        await write;
        continue;
      }
      try {
        await write;
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

/**
 * An event recorded while a custom step's call is handled names the step and
 * the run it belongs to. The run's `workflow_run_started` event, which has the
 * same Temporal run id, names the person or API key that started it.
 */
function withDynamicNodeRun(
  payload: Record<string, unknown> | undefined,
  run: RequestContextData["dynamicNodeRun"],
): Record<string, unknown> | undefined {
  if (!run) {
    return payload;
  }
  return {
    ...payload,
    dynamic_node_run: {
      workflow_execution_id: run.workflowExecutionId,
      slug: run.slug,
    },
  };
}
