import type { RecordUsageEventInput } from "@ai-di/billing";
import { buildUsageEventWriteOps } from "@ai-di/billing";
import type { PrismaClient, UsageEvent } from "@generated/client";

export type { RecordUsageEventInput } from "@ai-di/billing";

/**
 * Single write path for all billing events in the Temporal worker context.
 *
 * Records a UsageEvent row and atomically upserts the UsagePeriodSummary for
 * the event's group and current UTC calendar month.
 *
 * Instantiate with the shared Prisma client singleton from `database-client`:
 * ```ts
 * const writer = new UsageEventWriter(getPrismaClient());
 * ```
 */
export class UsageEventWriter {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persists a UsageEvent and atomically increments (or creates) the matching
   * UsagePeriodSummary row for the group's current billing period.
   *
   * @param input - Event data including rate version context for dollar conversion.
   * @returns The newly created UsageEvent record.
   */
  async recordUsageEvent(input: RecordUsageEventInput): Promise<UsageEvent> {
    const { createData, upsertArgs } = buildUsageEventWriteOps(input);
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await tx.usagePeriodSummary.upsert(upsertArgs);
      }
      return event;
    });
  }
}
