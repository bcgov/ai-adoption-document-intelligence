import { createHash, randomBytes } from "node:crypto";
import { getErrorStack } from "@ai-di/shared-logging";
import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AppLoggerService } from "@/logging/app-logger.service";
import { InternalTokenDbService } from "./internal-token-db.service";

/**
 * Header carrying an internal token on backend self-calls and worker
 * `dyn.run` callbacks. Read by `InternalTokenAuthGuard`.
 */
export const INTERNAL_TOKEN_HEADER = "x-internal-token";

/** What `InternalTokenService.validate` returns for a live token. */
export interface ValidatedInternalToken {
  groupId: string;
  /** The minting identity's actor id, or `null` for process-minted tokens. */
  userId: string | null;
  purpose: string;
}

/**
 * Short-lived, group-scoped internal credentials (Change W). One mechanism
 * serves two consumers:
 *
 *  - the agent's HTTP self-calls (backend, this slice): minted from the chat
 *    request's ALREADY-resolved identity, so JWT/IDIR callers work and the
 *    caller's own credential is never forwarded anywhere;
 *  - `dyn.run` script invocations (worker, slice 05): minted per invocation,
 *    scoped to the group owning the running workflow, written into the SAME
 *    `internal_token` table through the worker's own Prisma client.
 *
 * DB-backed rather than signature-based on purpose: worker and backend
 * already share the database, so there is no new shared secret to deploy or
 * rotate. Only a SHA-256 hash of the token is ever stored — the raw value
 * exists once, in the `mint` return, and is NEVER logged. SHA-256 (not
 * bcrypt) is the right hash here: the token is 32 random bytes, so
 * dictionary attacks don't apply and validation must be a cheap indexed
 * lookup on the hot path of every self-call.
 *
 * `validate` makes no assumption about `purpose` — it returns whatever the
 * row was minted for, and authorization stays purely group-scoped.
 */
@Injectable()
export class InternalTokenService {
  constructor(
    private readonly internalTokenDb: InternalTokenDbService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Mint a token bound to `groupId` (and optionally the minting identity's
   * actor id), valid for `ttlMs`. Returns the raw token exactly once; only
   * its SHA-256 hash is persisted. Callers pick a TTL that just covers the
   * work the token authenticates (e.g. one agent run) — there is no
   * default, so every call site states its budget.
   */
  async mint(
    groupId: string,
    purpose: string,
    userId: string | null | undefined,
    ttlMs: number,
  ): Promise<string> {
    const rawToken = randomBytes(32).toString("base64url");
    await this.internalTokenDb.createToken({
      tokenHash: hashToken(rawToken),
      groupId,
      userId: userId ?? null,
      purpose,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    // Log the mint, never the token.
    this.logger.debug("Internal token minted", {
      groupId,
      purpose,
      ttlMs,
      bound: userId != null,
    });
    return rawToken;
  }

  /**
   * Resolve a raw token to its binding: hash lookup, then expiry check.
   * Returns `null` for an unknown or expired token — the guard maps that
   * to 401. Expired rows are left for the hourly sweep; validation never
   * writes.
   */
  async validate(rawToken: string): Promise<ValidatedInternalToken | null> {
    const row = await this.internalTokenDb.findByHash(hashToken(rawToken));
    if (row === null) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { groupId: row.groupId, userId: row.userId, purpose: row.purpose };
  }

  /**
   * Hourly sweep deleting expired rows. Expiry is already enforced on
   * `validate`, so this is storage reclamation only — failures are logged
   * and swallowed (same stance as the other cleanup crons), and the
   * delete-by-expiry is idempotent across replicas.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(): Promise<void> {
    let deleted: number;
    try {
      deleted = await this.internalTokenDb.deleteExpired();
    } catch (err) {
      this.logger.error(
        "Internal-token GC sweep failed — will retry next hour",
        { stack: getErrorStack(err) },
      );
      return;
    }
    if (deleted > 0) {
      this.logger.log("Internal-token GC sweep complete", { deleted });
    }
  }
}

/** SHA-256 hex digest — the stored form of a token. */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
