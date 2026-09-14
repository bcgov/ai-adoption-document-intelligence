import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { PrismaService } from "@/database/prisma.service";
import {
  DuplicateSlugError,
  DynamicNodeDeletedError,
  DynamicNodeNotFoundError,
} from "./dynamic-node.errors";
import { DynamicNodeRepository } from "./dynamic-node.repository";

/**
 * In-memory fake Prisma client for the lineage + version tables. Each test
 * gets a fresh instance so re-runs are deterministic; the upstream
 * transaction wrapper passes the fake straight through.
 *
 * Per the existing backend convention (see `dataset-db.service.spec.ts` +
 * `activity-output-cache.repository.spec.ts`), Prisma is mocked rather than
 * hit against the real DB; the integration story is covered separately by
 * the smoke-curl suite at end of Milestone B and the end-to-end Playwright
 * walkthrough in Milestone G (US-185).
 */
interface FakeDynamicNode {
  id: string;
  groupId: string;
  slug: string;
  description: string | null;
  ownerUserId: string | null;
  headVersionId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeDynamicNodeVersion {
  id: string;
  dynamicNodeId: string;
  versionNumber: number;
  script: string;
  signature: DynamicNodeSignature;
  allowNet: string[];
  deterministic: boolean;
  publishedByUserId: string | null;
  publishedAt: Date;
}

class FakePrismaClient {
  nodes: FakeDynamicNode[] = [];
  versions: FakeDynamicNodeVersion[] = [];
  private idCounter = 0;
  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  dynamicNode = {
    create: jest.fn(async ({ data }: { data: Partial<FakeDynamicNode> }) => {
      // Enforce unique (groupId, slug)
      const existing = this.nodes.find(
        (n) => n.groupId === data.groupId && n.slug === data.slug,
      );
      if (existing) {
        const err = new Error(`Unique constraint failed`) as Error & {
          code: string;
        };
        err.code = "P2002";
        throw err;
      }
      const row: FakeDynamicNode = {
        id: this.nextId("dn"),
        groupId: data.groupId as string,
        slug: data.slug as string,
        description: data.description ?? null,
        ownerUserId: data.ownerUserId ?? null,
        headVersionId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.nodes.push(row);
      return row;
    }),
    findUnique: jest.fn(
      async ({
        where,
      }: {
        where: { groupId_slug?: { groupId: string; slug: string } };
        include?: unknown;
      }) => {
        if (where.groupId_slug) {
          const row = this.nodes.find(
            (n) =>
              n.groupId === where.groupId_slug?.groupId &&
              n.slug === where.groupId_slug?.slug,
          );
          if (!row) return null;
          // For include support, augment with headVersion + versions
          return {
            ...row,
            headVersion: row.headVersionId
              ? (this.versions.find((v) => v.id === row.headVersionId) ?? null)
              : null,
            versions: this.versions
              .filter((v) => v.dynamicNodeId === row.id)
              .sort((a, b) => b.versionNumber - a.versionNumber),
          };
        }
        return null;
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeDynamicNode>;
      }) => {
        const row = this.nodes.find((n) => n.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    ),
    findMany: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { groupId: string; deletedAt?: null };
        include?: unknown;
        orderBy?: { slug: "asc" | "desc" };
      }) => {
        let rows = this.nodes.filter((n) => n.groupId === where.groupId);
        if (where.deletedAt === null) {
          rows = rows.filter((n) => n.deletedAt === null);
        }
        rows = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
        if (orderBy?.slug === "desc") rows.reverse();
        return rows.map((r) => ({
          ...r,
          headVersion: r.headVersionId
            ? (this.versions.find((v) => v.id === r.headVersionId) ?? null)
            : null,
          _count: {
            versions: this.versions.filter((v) => v.dynamicNodeId === r.id)
              .length,
          },
        }));
      },
    ),
  };

  dynamicNodeVersion = {
    create: jest.fn(
      async ({ data }: { data: Partial<FakeDynamicNodeVersion> }) => {
        // Enforce unique (dynamicNodeId, versionNumber)
        const dup = this.versions.find(
          (v) =>
            v.dynamicNodeId === data.dynamicNodeId &&
            v.versionNumber === data.versionNumber,
        );
        if (dup) {
          const err = new Error(`Unique constraint failed`) as Error & {
            code: string;
          };
          err.code = "P2002";
          throw err;
        }
        const row: FakeDynamicNodeVersion = {
          id: this.nextId("dnv"),
          dynamicNodeId: data.dynamicNodeId as string,
          versionNumber: data.versionNumber as number,
          script: data.script as string,
          signature: data.signature as DynamicNodeSignature,
          allowNet: data.allowNet ?? [],
          deterministic: data.deterministic ?? false,
          publishedByUserId: data.publishedByUserId ?? null,
          publishedAt: new Date(),
        };
        this.versions.push(row);
        return row;
      },
    ),
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { dynamicNodeId: string };
        orderBy?: { versionNumber: "asc" | "desc" };
        select?: unknown;
      }) => {
        const rows = this.versions.filter(
          (v) => v.dynamicNodeId === where.dynamicNodeId,
        );
        if (rows.length === 0) return null;
        rows.sort((a, b) =>
          orderBy?.versionNumber === "desc"
            ? b.versionNumber - a.versionNumber
            : a.versionNumber - b.versionNumber,
        );
        return { versionNumber: rows[0].versionNumber };
      },
    ),
  };

  $queryRaw = jest.fn(async () => [{ count: BigInt(0) }]);
}

function makeSignature(
  overrides: Partial<DynamicNodeSignature> = {},
): DynamicNodeSignature {
  return {
    name: "my-node",
    description: "Test node",
    category: "Custom",
    deterministic: false,
    inputs: [{ name: "document", kind: "Document", required: true }],
    outputs: [{ name: "result", kind: "Artifact" }],
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    allowNet: [],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
    ...overrides,
  };
}

describe("DynamicNodeRepository", () => {
  let repository: DynamicNodeRepository;
  let fakePrisma: FakePrismaClient;
  let auditRecordEvent: jest.Mock;

  beforeEach(async () => {
    fakePrisma = new FakePrismaClient();
    auditRecordEvent = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicNodeRepository,
        {
          provide: PrismaService,
          useValue: {
            prisma: fakePrisma,
            // transaction wrapper just invokes the callback with the fake.
            transaction: async <T>(
              fn: (tx: FakePrismaClient) => Promise<T>,
            ): Promise<T> => fn(fakePrisma),
          },
        },
        {
          provide: AuditService,
          useValue: { recordEvent: auditRecordEvent },
        },
      ],
    }).compile();
    repository = module.get<DynamicNodeRepository>(DynamicNodeRepository);
  });

  describe("createWithFirstVersion", () => {
    it("atomically creates lineage + v1 + sets head pointer", async () => {
      const sig = makeSignature();
      const result = await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* script v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
        ownerUserId: "u-1",
      });
      expect(result.dynamicNode.slug).toBe("my-node");
      expect(result.dynamicNode.headVersionId).toBe(result.headVersion.id);
      expect(result.headVersion.versionNumber).toBe(1);
      expect(result.headVersion.script).toBe("/* script v1 */");
      expect(result.headVersion.publishedByUserId).toBe("u-1");
    });

    it("throws DuplicateSlugError on (groupId, slug) collision", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* a */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await expect(
        repository.createWithFirstVersion({
          groupId: "g-1",
          actorId: "actor-1",
          slug: "my-node",
          script: "/* b */",
          signature: sig,
          allowNet: [],
          deterministic: false,
        }),
      ).rejects.toBeInstanceOf(DuplicateSlugError);
    });

    it("allows the same slug in different groups", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* a */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const result = await repository.createWithFirstVersion({
        groupId: "g-2",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* b */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      expect(result.dynamicNode.groupId).toBe("g-2");
    });

    it("restores a soft-deleted lineage instead of colliding — clears deletedAt, appends the next version, moves head", async () => {
      const sig = makeSignature();
      // v1, then soft-delete (the tombstone keeps version rows so pinned
      // workflows still resolve — see softDelete's contract).
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "my-node", "actor-1");

      // Re-publishing the SAME slug must restore the lineage, not 409.
      const restored = await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v2 after restore */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });

      // Un-deleted, head moved to the appended version.
      expect(restored.dynamicNode.deletedAt).toBeNull();
      expect(restored.dynamicNode.headVersionId).toBe(restored.headVersion.id);
      // Version numbering CONTINUES the preserved history (v2), never
      // re-issues v1 (which would collide with the kept row).
      expect(restored.headVersion.versionNumber).toBe(2);
      expect(restored.headVersion.script).toBe("/* v2 after restore */");

      // The lineage is visible again with its full history intact.
      const found = await repository.findBySlugForGroup("g-1", "my-node");
      expect(found).not.toBeNull();
      expect(found?.deletedAt).toBeNull();
      expect(found?.versions).toHaveLength(2);
    });
  });

  describe("publishNewVersion", () => {
    it("appends v2 and moves head pointer", async () => {
      const sig = makeSignature();
      const v1 = await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v2 = await repository.publishNewVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v2 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      expect(v2.headVersion.versionNumber).toBe(2);
      expect(v2.dynamicNode.headVersionId).toBe(v2.headVersion.id);
      expect(v2.dynamicNode.headVersionId).not.toBe(v1.headVersion.id);
    });

    it("sequences version numbers across multiple publishes", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v2 = await repository.publishNewVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v2 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v3 = await repository.publishNewVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v3 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      expect(v2.headVersion.versionNumber).toBe(2);
      expect(v3.headVersion.versionNumber).toBe(3);
    });

    it("throws DynamicNodeNotFoundError for an unknown slug", async () => {
      const sig = makeSignature();
      await expect(
        repository.publishNewVersion({
          groupId: "g-1",
          actorId: "actor-1",
          slug: "missing",
          script: "/* */",
          signature: sig,
          allowNet: [],
          deterministic: false,
        }),
      ).rejects.toBeInstanceOf(DynamicNodeNotFoundError);
    });

    it("throws DynamicNodeDeletedError for a soft-deleted lineage", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "my-node", "actor-1");
      await expect(
        repository.publishNewVersion({
          groupId: "g-1",
          actorId: "actor-1",
          slug: "my-node",
          script: "/* v2 */",
          signature: sig,
          allowNet: [],
          deterministic: false,
        }),
      ).rejects.toBeInstanceOf(DynamicNodeDeletedError);
    });
  });

  describe("findBySlugForGroup", () => {
    it("returns the lineage with head + versions newest-first", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.publishNewVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v2 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const lineage = await repository.findBySlugForGroup("g-1", "my-node");
      expect(lineage).not.toBeNull();
      expect(lineage?.versions.length).toBe(2);
      expect(lineage?.versions[0].versionNumber).toBe(2);
      expect(lineage?.versions[1].versionNumber).toBe(1);
      expect(lineage?.headVersion?.versionNumber).toBe(2);
    });

    it("returns null for a soft-deleted lineage", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "my-node", "actor-1");
      const lineage = await repository.findBySlugForGroup("g-1", "my-node");
      expect(lineage).toBeNull();
    });

    it("returns null for an unknown slug", async () => {
      const lineage = await repository.findBySlugForGroup("g-1", "missing");
      expect(lineage).toBeNull();
    });

    it("isolates between groups", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* a */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const lineage = await repository.findBySlugForGroup("g-2", "my-node");
      expect(lineage).toBeNull();
    });
  });

  describe("listForGroup", () => {
    it("excludes soft-deleted by default", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "alpha",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "beta",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "beta", "actor-1");
      const list = await repository.listForGroup("g-1");
      expect(list.map((l) => l.slug)).toEqual(["alpha"]);
    });

    it("includes soft-deleted when includeDeleted=true", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "alpha",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "alpha", "actor-1");
      const list = await repository.listForGroup("g-1", {
        includeDeleted: true,
      });
      expect(list.length).toBe(1);
    });

    it("sorts by slug ascending", async () => {
      const sig = makeSignature();
      for (const slug of ["gamma", "alpha", "beta"]) {
        await repository.createWithFirstVersion({
          groupId: "g-1",
          actorId: "actor-1",
          slug,
          script: "/* */",
          signature: sig,
          allowNet: [],
          deterministic: false,
        });
      }
      const list = await repository.listForGroup("g-1");
      expect(list.map((l) => l.slug)).toEqual(["alpha", "beta", "gamma"]);
    });

    it("returns versions count per lineage", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.publishNewVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const list = await repository.listForGroup("g-1");
      expect(list[0]._count.versions).toBe(2);
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and returns the updated row", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const deleted = await repository.softDelete("g-1", "my-node", "actor-1");
      expect(deleted.deletedAt).not.toBeNull();
    });

    it("is idempotent — second delete preserves the original deletedAt", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        actorId: "actor-1",
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const first = await repository.softDelete("g-1", "my-node", "actor-1");
      const firstDeletedAt = first.deletedAt;
      const second = await repository.softDelete("g-1", "my-node", "actor-1");
      expect(second.deletedAt).toEqual(firstDeletedAt);
    });

    it("throws DynamicNodeNotFoundError for unknown slug", async () => {
      await expect(
        repository.softDelete("g-1", "missing", "actor-1"),
      ).rejects.toBeInstanceOf(DynamicNodeNotFoundError);
    });
  });

  describe("audit events (Change H)", () => {
    const baseInput = () => ({
      groupId: "g-1",
      actorId: "actor-1",
      slug: "my-node",
      script: "/* v1 */",
      signature: makeSignature(),
      allowNet: [],
      deterministic: false,
    });

    it("createWithFirstVersion records dynamic_node_published INSIDE the transaction (tx passed)", async () => {
      const result = await repository.createWithFirstVersion(baseInput());
      expect(auditRecordEvent).toHaveBeenCalledTimes(1);
      const [event, tx] = auditRecordEvent.mock.calls[0];
      expect(event).toMatchObject({
        event_type: "dynamic_node_published",
        resource_type: "dynamic_node",
        resource_id: result.dynamicNode.id,
        actor_id: "actor-1",
        group_id: "g-1",
        payload: { slug: "my-node", version: 1, restored: false },
      });
      // The fake transaction wrapper hands the callback fakePrisma itself,
      // so recordEvent receiving it proves the event joins the SAME
      // transaction as the row writes.
      expect(tx).toBe(fakePrisma);
    });

    it("restoring a soft-deleted lineage audits as a publish with restored: true", async () => {
      await repository.createWithFirstVersion(baseInput());
      await repository.softDelete("g-1", "my-node", "actor-1");
      auditRecordEvent.mockClear();
      const result = await repository.createWithFirstVersion(baseInput());
      expect(auditRecordEvent).toHaveBeenCalledTimes(1);
      const [event, tx] = auditRecordEvent.mock.calls[0];
      expect(event).toMatchObject({
        event_type: "dynamic_node_published",
        resource_id: result.dynamicNode.id,
        payload: {
          slug: "my-node",
          version: result.headVersion.versionNumber,
          restored: true,
        },
      });
      expect(tx).toBe(fakePrisma);
    });

    it("publishNewVersion records dynamic_node_version_published with the new version number", async () => {
      await repository.createWithFirstVersion(baseInput());
      auditRecordEvent.mockClear();
      const result = await repository.publishNewVersion({
        ...baseInput(),
        script: "/* v2 */",
        publishedByUserId: undefined,
      });
      expect(auditRecordEvent).toHaveBeenCalledTimes(1);
      const [event, tx] = auditRecordEvent.mock.calls[0];
      expect(event).toMatchObject({
        event_type: "dynamic_node_version_published",
        resource_type: "dynamic_node",
        resource_id: result.dynamicNode.id,
        actor_id: "actor-1",
        group_id: "g-1",
        payload: { slug: "my-node", version: 2 },
      });
      expect(tx).toBe(fakePrisma);
    });

    it("softDelete records dynamic_node_deleted in the same transaction", async () => {
      const created = await repository.createWithFirstVersion(baseInput());
      auditRecordEvent.mockClear();
      await repository.softDelete("g-1", "my-node", "actor-2");
      expect(auditRecordEvent).toHaveBeenCalledTimes(1);
      const [event, tx] = auditRecordEvent.mock.calls[0];
      expect(event).toMatchObject({
        event_type: "dynamic_node_deleted",
        resource_type: "dynamic_node",
        resource_id: created.dynamicNode.id,
        actor_id: "actor-2",
        group_id: "g-1",
        payload: { slug: "my-node" },
      });
      expect(tx).toBe(fakePrisma);
    });

    it("re-deleting an already-deleted lineage is a no-op and records NO second event", async () => {
      await repository.createWithFirstVersion(baseInput());
      await repository.softDelete("g-1", "my-node", "actor-1");
      auditRecordEvent.mockClear();
      await repository.softDelete("g-1", "my-node", "actor-1");
      expect(auditRecordEvent).not.toHaveBeenCalled();
    });

    it("a failed create records no audit event (duplicate slug)", async () => {
      await repository.createWithFirstVersion(baseInput());
      auditRecordEvent.mockClear();
      await expect(
        repository.createWithFirstVersion(baseInput()),
      ).rejects.toBeInstanceOf(DuplicateSlugError);
      expect(auditRecordEvent).not.toHaveBeenCalled();
    });
  });

  describe("countWorkflowsReferencingSlug", () => {
    it("delegates to a Prisma raw count", async () => {
      fakePrisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(3) }]);
      const count = await repository.countWorkflowsReferencingSlug(
        "g-1",
        "my-node",
      );
      expect(count).toBe(3);
      expect(fakePrisma.$queryRaw).toHaveBeenCalled();
    });

    it("returns 0 when the raw query returns no rows", async () => {
      fakePrisma.$queryRaw.mockResolvedValueOnce([]);
      const count = await repository.countWorkflowsReferencingSlug(
        "g-1",
        "my-node",
      );
      expect(count).toBe(0);
    });
  });
});
