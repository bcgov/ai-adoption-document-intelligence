import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import { Test, TestingModule } from "@nestjs/testing";
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

  beforeEach(async () => {
    fakePrisma = new FakePrismaClient();
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
      ],
    }).compile();
    repository = module.get<DynamicNodeRepository>(DynamicNodeRepository);
  });

  describe("createWithFirstVersion", () => {
    it("atomically creates lineage + v1 + sets head pointer", async () => {
      const sig = makeSignature();
      const result = await repository.createWithFirstVersion({
        groupId: "g-1",
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
        slug: "my-node",
        script: "/* a */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await expect(
        repository.createWithFirstVersion({
          groupId: "g-1",
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
        slug: "my-node",
        script: "/* a */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const result = await repository.createWithFirstVersion({
        groupId: "g-2",
        slug: "my-node",
        script: "/* b */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      expect(result.dynamicNode.groupId).toBe("g-2");
    });
  });

  describe("publishNewVersion", () => {
    it("appends v2 and moves head pointer", async () => {
      const sig = makeSignature();
      const v1 = await repository.createWithFirstVersion({
        groupId: "g-1",
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v2 = await repository.publishNewVersion({
        groupId: "g-1",
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
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v2 = await repository.publishNewVersion({
        groupId: "g-1",
        slug: "my-node",
        script: "/* v2 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const v3 = await repository.publishNewVersion({
        groupId: "g-1",
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
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "my-node");
      await expect(
        repository.publishNewVersion({
          groupId: "g-1",
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
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.publishNewVersion({
        groupId: "g-1",
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
        slug: "my-node",
        script: "/* v1 */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "my-node");
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
        slug: "alpha",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.createWithFirstVersion({
        groupId: "g-1",
        slug: "beta",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "beta");
      const list = await repository.listForGroup("g-1");
      expect(list.map((l) => l.slug)).toEqual(["alpha"]);
    });

    it("includes soft-deleted when includeDeleted=true", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        slug: "alpha",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.softDelete("g-1", "alpha");
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
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      await repository.publishNewVersion({
        groupId: "g-1",
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
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const deleted = await repository.softDelete("g-1", "my-node");
      expect(deleted.deletedAt).not.toBeNull();
    });

    it("is idempotent — second delete preserves the original deletedAt", async () => {
      const sig = makeSignature();
      await repository.createWithFirstVersion({
        groupId: "g-1",
        slug: "my-node",
        script: "/* */",
        signature: sig,
        allowNet: [],
        deterministic: false,
      });
      const first = await repository.softDelete("g-1", "my-node");
      const firstDeletedAt = first.deletedAt;
      const second = await repository.softDelete("g-1", "my-node");
      expect(second.deletedAt).toEqual(firstDeletedAt);
    });

    it("throws DynamicNodeNotFoundError for unknown slug", async () => {
      await expect(
        repository.softDelete("g-1", "missing"),
      ).rejects.toBeInstanceOf(DynamicNodeNotFoundError);
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
