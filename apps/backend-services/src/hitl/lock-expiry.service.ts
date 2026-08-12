import { PrismaClient, ReviewStatus } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLoggerService } from "@/logging/app-logger.service";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class LockExpiryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  // Runs every minute; finds expired locks, marks their sessions abandoned, deletes the lock rows.
  @Cron(CronExpression.EVERY_MINUTE)
  async expireAbandonedSessions(): Promise<void> {
    const now = new Date();

    const expiredLocks = await this.prisma.documentLock.findMany({
      where: { expires_at: { lte: now } },
      select: { session_id: true },
    });

    if (expiredLocks.length === 0) return;

    const sessionIds = expiredLocks.map((l) => l.session_id);

    await this.prisma.$transaction([
      this.prisma.reviewSession.updateMany({
        where: {
          id: { in: sessionIds },
          status: ReviewStatus.in_progress,
        },
        data: { status: ReviewStatus.abandoned },
      }),
      this.prisma.documentLock.deleteMany({
        where: { session_id: { in: sessionIds } },
      }),
    ]);

    this.logger.log(
      `Lock expiry: abandoned ${sessionIds.length} session(s): ${sessionIds.join(", ")}`,
    );
  }
}
