import type { RecordUsageEventInput } from "@ai-di/billing";
import { buildUsageEventWriteOps } from "@ai-di/billing";
import type { Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface BlobReadRateInfo {
  rateVersionId: string;
  unitCostDollars: number;
  units: number;
}

/**
 * Database service for blob storage ledger and read-billing operations.
 * Owns all Prisma interactions for the BlobStorage module.
 */
@Injectable()
export class StorageLedgerDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  /**
   * Inserts a GroupStorageLedger row for a written blob.
   *
   * @param groupId - The group that owns the blob (first path segment of the key)
   * @param key - The full blob key
   * @param sizeBytes - Size of the written data in bytes
   */
  async createLedgerEntry(
    groupId: string,
    key: string,
    sizeBytes: number,
  ): Promise<void> {
    await this.prisma.groupStorageLedger.upsert({
      where: {
        blob_key: key,
      },
      create: {
        group_id: groupId,
        blob_key: key,
        size_bytes: BigInt(sizeBytes),
        written_at: new Date(),
        deleted_at: null,
      },
      update: {
        size_bytes: BigInt(sizeBytes),
        written_at: new Date(),
        deleted_at: null,
      },
    });
  }

  /**
   * Sets deleted_at on the GroupStorageLedger row matching the given key.
   *
   * @param key - The blob key that was deleted
   */
  async markDeleted(key: string): Promise<void> {
    await this.prisma.groupStorageLedger.updateMany({
      where: { blob_key: key, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  /**
   * Sets deleted_at on all GroupStorageLedger rows whose blob_key begins with
   * the given prefix. Uses a single bulk UPDATE query.
   *
   * @param prefix - The blob key prefix used for deletion
   */
  async markDeletedByPrefix(prefix: string): Promise<void> {
    await this.prisma.groupStorageLedger.updateMany({
      where: { blob_key: { startsWith: prefix }, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  /**
   * Returns the most recently effective RateVersion that includes a "blob.read"
   * ActivityCost entry, or null if none exists.
   */
  async findActiveRateVersionWithBlobReadCost(): Promise<BlobReadRateInfo | null> {
    const rateVersion = await this.prisma.rateVersion.findFirst({
      where: { effective_from: { lte: new Date() } },
      orderBy: { effective_from: "desc" },
      include: { activity_costs: { where: { activity_name: "blob.read" } } },
    });

    if (!rateVersion || rateVersion.activity_costs.length === 0) return null;

    const readCost = rateVersion.activity_costs[0];
    return {
      rateVersionId: rateVersion.id,
      unitCostDollars: Number(rateVersion.unit_cost_dollars),
      units: Number(readCost.units),
    };
  }

  /**
   * Returns the most recently effective RateVersion that includes a "blob.write"
   * ActivityCost entry, or null if none exists.
   */
  async findActiveRateVersionWithBlobWriteCost(): Promise<BlobReadRateInfo | null> {
    const rateVersion = await this.prisma.rateVersion.findFirst({
      where: { effective_from: { lte: new Date() } },
      orderBy: { effective_from: "desc" },
      include: { activity_costs: { where: { activity_name: "blob.write" } } },
    });

    if (!rateVersion || rateVersion.activity_costs.length === 0) return null;

    const writeCost = rateVersion.activity_costs[0];
    return {
      rateVersionId: rateVersion.id,
      unitCostDollars: Number(rateVersion.unit_cost_dollars),
      units: Number(writeCost.units),
    };
  }

  /**
   * Creates a UsageEvent and atomically upserts the matching UsagePeriodSummary
   * row within a single transaction.
   *
   * @param input - Event data including rate version context for dollar conversion
   * @param tx - Optional transaction client for participation in a larger transaction
   */
  async createBlobReadEvent(
    input: RecordUsageEventInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { createData, upsertArgs } = buildUsageEventWriteOps(input);
    const run = async (client: Prisma.TransactionClient) => {
      await client.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await client.usagePeriodSummary.upsert(upsertArgs);
      }
    };

    if (tx) {
      await run(tx);
    } else {
      await this.prismaService.transaction(run);
    }
  }

  /**
   * Creates a UsageEvent for a blob write operation and atomically upserts the
   * matching UsagePeriodSummary row within a single transaction.
   *
   * @param input - Event data including rate version context for dollar conversion
   * @param tx - Optional transaction client for participation in a larger transaction
   */
  async createBlobWriteEvent(
    input: RecordUsageEventInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { createData, upsertArgs } = buildUsageEventWriteOps(input);
    const run = async (client: Prisma.TransactionClient) => {
      await client.usageEvent.create({ data: createData });
      if (upsertArgs) {
        await client.usagePeriodSummary.upsert(upsertArgs);
      }
    };

    if (tx) {
      await run(tx);
    } else {
      await this.prismaService.transaction(run);
    }
  }
}
