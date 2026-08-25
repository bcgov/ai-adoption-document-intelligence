import { createHash } from "node:crypto";
import { InternalTokenService } from "./internal-token.service";
import type {
  CreateInternalTokenData,
  InternalTokenDbService,
  InternalTokenRow,
} from "./internal-token-db.service";

/**
 * In-memory stand-in for the `internal_token` table, following the repo's
 * fake-Prisma convention (see `dynamic-node.repository.spec.ts`): the db
 * service is mocked at its interface, so mint → validate exercises the
 * real hashing and expiry logic end-to-end.
 */
class FakeInternalTokenDb {
  rows: InternalTokenRow[] = [];
  private idCounter = 0;

  createToken = jest.fn(async (data: CreateInternalTokenData) => {
    const row: InternalTokenRow = {
      id: `it-${++this.idCounter}`,
      tokenHash: data.tokenHash,
      groupId: data.groupId,
      userId: data.userId ?? null,
      purpose: data.purpose,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  });

  findByHash = jest.fn(async (tokenHash: string) => {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  });

  deleteExpired = jest.fn(async () => {
    const now = Date.now();
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.expiresAt.getTime() >= now);
    return before - this.rows.length;
  });
}

function makeService(): {
  service: InternalTokenService;
  db: FakeInternalTokenDb;
  logger: { debug: jest.Mock; log: jest.Mock; error: jest.Mock };
} {
  const db = new FakeInternalTokenDb();
  const logger = { debug: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new InternalTokenService(
    db as unknown as InternalTokenDbService,
    logger as never,
  );
  return { service, db, logger };
}

describe("InternalTokenService", () => {
  describe("mint + validate round-trip", () => {
    it("mints a token that validates back to its (group, user, purpose) binding", async () => {
      const { service } = makeService();
      const raw = await service.mint(
        "g-1",
        "agent-self-call",
        "actor-1",
        60_000,
      );

      const validated = await service.validate(raw);
      expect(validated).toEqual({
        groupId: "g-1",
        userId: "actor-1",
        purpose: "agent-self-call",
      });
    });

    it("stores only the SHA-256 hash — never the raw token", async () => {
      const { service, db } = makeService();
      const raw = await service.mint("g-1", "agent-self-call", null, 60_000);

      expect(db.rows).toHaveLength(1);
      const stored = db.rows[0].tokenHash;
      expect(stored).not.toBe(raw);
      expect(stored).toBe(
        createHash("sha256").update(raw, "utf8").digest("hex"),
      );
      // The raw value must not appear anywhere in the persisted row.
      expect(JSON.stringify(db.rows[0])).not.toContain(raw);
    });

    it("returns raw tokens with ≥32 bytes of randomness, unique per mint", async () => {
      const { service } = makeService();
      const a = await service.mint("g-1", "agent-self-call", null, 60_000);
      const b = await service.mint("g-1", "agent-self-call", null, 60_000);
      expect(a).not.toBe(b);
      // 32 random bytes base64url-encode to 43 characters.
      expect(a.length).toBeGreaterThanOrEqual(43);
    });

    it("never logs the raw token", async () => {
      const { service, logger } = makeService();
      const raw = await service.mint(
        "g-1",
        "agent-self-call",
        "actor-1",
        60_000,
      );
      const everythingLogged = JSON.stringify([
        logger.debug.mock.calls,
        logger.log.mock.calls,
        logger.error.mock.calls,
      ]);
      expect(everythingLogged).not.toContain(raw);
    });

    it("binds no user when minted for a process (userId omitted)", async () => {
      const { service } = makeService();
      const raw = await service.mint("g-1", "dyn-run", undefined, 60_000);
      const validated = await service.validate(raw);
      expect(validated).toEqual({
        groupId: "g-1",
        userId: null,
        purpose: "dyn-run",
      });
    });
  });

  describe("validate", () => {
    it("returns null for an unknown token", async () => {
      const { service } = makeService();
      await expect(service.validate("never-minted")).resolves.toBeNull();
    });

    it("returns null for an expired token (expiry checked on read, not just swept)", async () => {
      const { service } = makeService();
      const raw = await service.mint("g-1", "agent-self-call", "actor-1", -1);
      await expect(service.validate(raw)).resolves.toBeNull();
    });

    it("makes no assumption about purpose — slice 05's dyn-run mints validate identically", async () => {
      // The worker writes rows into the same table with its own purposes;
      // validate must return whatever the row carries.
      const { service, db } = makeService();
      const raw = "worker-minted-raw-token";
      await db.createToken({
        tokenHash: createHash("sha256").update(raw, "utf8").digest("hex"),
        groupId: "g-9",
        userId: null,
        purpose: "some-future-purpose",
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.validate(raw)).resolves.toEqual({
        groupId: "g-9",
        userId: null,
        purpose: "some-future-purpose",
      });
    });
  });

  describe("hourly sweep", () => {
    it("deletes expired rows and logs the count when > 0", async () => {
      const { service, db, logger } = makeService();
      await service.mint("g-1", "agent-self-call", null, -1);
      await service.mint("g-1", "agent-self-call", null, 60_000);

      await service.sweepExpired();

      expect(db.rows).toHaveLength(1);
      expect(logger.log).toHaveBeenCalledWith(
        "Internal-token GC sweep complete",
        { deleted: 1 },
      );
    });

    it("stays quiet when nothing expired", async () => {
      const { service, logger } = makeService();
      await service.mint("g-1", "agent-self-call", null, 60_000);
      await service.sweepExpired();
      expect(logger.log).not.toHaveBeenCalled();
    });

    it("swallows sweep failures (logged, never thrown)", async () => {
      const { service, db, logger } = makeService();
      db.deleteExpired.mockRejectedValueOnce(new Error("db down"));
      await expect(service.sweepExpired()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
