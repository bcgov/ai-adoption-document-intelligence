import { ReviewStatus } from "@generated/client";
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
   * Reclaims documents whose reviewer stopped sending heartbeats, and deletes
   * their lock rows. A session that carries a flag note was handed on from the
   * Flagged tab, so it goes back to `flagged` with its note and corrections for
   * the next reviewer to take. Any other session becomes `abandoned`, which
   * returns its document to the pending queue.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireAbandonedSessions(): Promise<void> {
    const expiredLocks = await this.reviewDb.findExpiredLocks(new Date());
    if (expiredLocks.length === 0) return;

    const sessionIds = expiredLocks.map((lock) => lock.session_id);
    const flaggedIds = expiredLocks
      .filter((lock) => lock.has_flag_note)
      .map((lock) => lock.session_id);
    const abandonedIds = expiredLocks
      .filter((lock) => !lock.has_flag_note)
      .map((lock) => lock.session_id);

    const { flagged, abandoned } = await this.prismaService.transaction(
      async (tx) => {
        const flaggedCount =
          flaggedIds.length > 0
            ? await this.reviewDb.returnSessionsToFlagged(flaggedIds, tx)
            : 0;
        const abandonedCount =
          abandonedIds.length > 0
            ? await this.reviewDb.abandonSessions(abandonedIds, tx)
            : 0;
        await this.reviewDb.releaseDocumentLocks(sessionIds, tx);

        await this.auditService.recordEvent(
          expiredLocks.map((lock) => ({
            event_type: "review_session_expired",
            resource_type: "review_session",
            resource_id: lock.session_id,
            document_id: lock.document_id,
            workflow_execution_id: lock.workflow_execution_id ?? undefined,
            group_id: lock.group_id,
            payload: {
              document_id: lock.document_id,
              status: lock.has_flag_note
                ? ReviewStatus.flagged
                : ReviewStatus.abandoned,
            },
          })),
          tx,
        );

        return { flagged: flaggedCount, abandoned: abandonedCount };
      },
    );

    this.logger.log(
      `Lock expiry: released ${sessionIds.length} lock(s), abandoned ${abandoned} session(s), returned ${flagged} to flagged`,
    );
  }
}
