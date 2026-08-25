import type { Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

/**
 * One `internal_token` row, as the service layer consumes it. Declared
 * locally (rather than importing the generated `InternalToken` model type)
 * so this module has a stable shape to test against; the Prisma model it
 * mirrors is `InternalToken` in `apps/shared/prisma/schema.prisma`.
 */
export interface InternalTokenRow {
  id: string;
  /** SHA-256 hex digest of the raw token. The raw token is never stored. */
  tokenHash: string;
  groupId: string;
  /**
   * The minting identity's actor id, when the token carries one (agent
   * self-calls bind the chat caller). `null` for tokens minted on behalf
   * of a system process (e.g. the worker's per-`dyn.run` mint).
   */
  userId: string | null;
  /** What the token was minted for — e.g. "agent-self-call", "dyn-run". */
  purpose: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateInternalTokenData {
  tokenHash: string;
  groupId: string;
  userId?: string | null;
  purpose: string;
  expiresAt: Date;
}

/**
 * Database service for the `internal_token` table — short-lived,
 * group-scoped credentials minted server-side (Change W). Follows the repo
 * db-service pattern: every method takes an optional
 * `Prisma.TransactionClient` last and uses `const client = tx ?? prisma`.
 *
 * The worker (slice 05) writes rows into the SAME table through its own
 * Prisma client for `dyn.run` mints, so nothing here may assume a
 * particular `purpose`.
 */
@Injectable()
export class InternalTokenDbService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Insert one token row (hash only — never the raw token). */
  async createToken(
    data: CreateInternalTokenData,
    tx?: Prisma.TransactionClient,
  ): Promise<InternalTokenRow> {
    const client = tx ?? this.prismaService.prisma;
    return client.internalToken.create({
      data: {
        tokenHash: data.tokenHash,
        groupId: data.groupId,
        userId: data.userId ?? null,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Look a row up by token hash (the unique index). `null` when absent. */
  async findByHash(
    tokenHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InternalTokenRow | null> {
    const client = tx ?? this.prismaService.prisma;
    return client.internalToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Delete every expired row (bulk, via the `(expires_at)` index). Returns
   * the deleted count. Idempotent — safe under concurrent sweeps.
   */
  async deleteExpired(tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prismaService.prisma;
    const result = await client.internalToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
