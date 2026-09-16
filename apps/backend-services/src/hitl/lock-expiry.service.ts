import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLoggerService } from "@/logging/app-logger.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { ReviewDbService } from "./review-db.service";

@Injectable()
export class LockExpiryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly reviewDb: ReviewDbService,
    private readonly auditService: AuditService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Reclaims documents whose reviewer stopped sending heartbeats: the session
   * becomes `abandoned` and the lock row is deleted, which returns the document
   * to the pending queue.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireAbandonedSessions(): Promise<void> {
    const expiredLocks = await this.reviewDb.findExpiredLocks(new Date());
    if (expiredLocks.length === 0) return;

    const sessionIds = expiredLocks.map((lock) => lock.session_id);

    const abandonedCount = await this.prismaService.transaction(async (tx) => {
      const count = await this.reviewDb.abandonSessions(sessionIds, tx);
      await this.reviewDb.releaseDocumentLocks(sessionIds, tx);

      await this.auditService.recordEvent(
        expiredLocks.map((lock) => ({
          event_type: "review_session_expired",
          resource_type: "review_session",
          resource_id: lock.session_id,
          document_id: lock.document_id,
          workflow_execution_id: lock.workflow_execution_id ?? undefined,
          group_id: lock.group_id,
          payload: { document_id: lock.document_id },
        })),
        tx,
      );

      return count;
    });

    this.logger.log(
      `Lock expiry: released ${sessionIds.length} lock(s), abandoned ${abandonedCount} session(s)`,
    );
  }
}
