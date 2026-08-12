import type { RecordUsageEventInput } from "@ai-di/billing";
import { buildUsageEventWriteOps } from "@ai-di/billing";
import type { UsageEvent } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export type { RecordUsageEventInput } from "@ai-di/billing";

/**
 * Single write path for all billing events.
 *
 * Records a UsageEvent row and atomically upserts the UsagePeriodSummary for
 * the event's group and current UTC calendar month.
 */
@Injectable()
export class UsageEventService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Persists a UsageEvent and atomically increments (or creates) the matching
   * UsagePeriodSummary row for the group's current billing period.
   *
   * @param input - Event data including rate version context for dollar conversion.
   * @returns The newly created UsageEvent record.
   */
  async recordUsageEvent(input: RecordUsageEventInput): Promise<UsageEvent> {
    const { createData, upsertArgs } = buildUsageEventWriteOps(input);
    return this.prismaService.prisma.$transaction(async (tx) => {
      const event = await tx.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await tx.usagePeriodSummary.upsert(upsertArgs);
      }
      return event;
    });
  }
}
