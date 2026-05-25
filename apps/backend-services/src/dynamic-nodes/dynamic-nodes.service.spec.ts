import {
  ACTIVITY_CATALOG,
  type DynamicNodeSignature,
} from "@ai-di/graph-workflow";
import { Test, TestingModule } from "@nestjs/testing";
import {
  DenoRunnerClient,
  DenoRunnerUnavailableError,
} from "./deno-runner.client";
import {
  DuplicateSlugError,
  DynamicNodeNotFoundError,
} from "./dynamic-node.errors";
import { DynamicNodeRepository } from "./dynamic-node.repository";
import {
  DynamicNodesService,
  NameMismatchError,
  PublishValidationError,
} from "./dynamic-nodes.service";

/**
 * Valid script template used by happy-path tests. The shared
 * `parseDynamicNodeSignature` parser is exercised end-to-end (no mocking)
 * so signature semantics are real.
 */
const VALID_SCRIPT = `/**
 * @workflow-node
 * @name my-node
 * @description Uppercases the document URL.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(ctx: { document: { url: string } }) {
  return { result: { url: ctx.document.url.toUpperCase() } };
}
`;

/**
 * Variant of the valid script with a bad TS type — passes parser stages
 * but fails the `deno check` stage. We don't actually run `deno check`
 * in unit tests; the DenoRunnerClient mock returns the diagnostic.
 */
const VALID_SCRIPT_WITH_TS_ERROR = VALID_SCRIPT;

describe("DynamicNodesService", () => {
  let service: DynamicNodesService;
  let repository: {
    createWithFirstVersion: jest.Mock;
    publishNewVersion: jest.Mock;
    listForGroup: jest.Mock;
  };
  let denoClient: { check: jest.Mock };

  const originalAllowlist = process.env.DYNAMIC_NODE_ALLOW_NET;

  afterAll(() => {
    if (originalAllowlist === undefined) {
      delete process.env.DYNAMIC_NODE_ALLOW_NET;
    } else {
      process.env.DYNAMIC_NODE_ALLOW_NET = originalAllowlist;
    }
  });

  async function buildService(envAllowlist?: string): Promise<void> {
    if (envAllowlist === undefined) {
      delete process.env.DYNAMIC_NODE_ALLOW_NET;
    } else {
      process.env.DYNAMIC_NODE_ALLOW_NET = envAllowlist;
    }

    repository = {
      createWithFirstVersion: jest.fn(),
      publishNewVersion: jest.fn(),
      listForGroup: jest.fn().mockResolvedValue([]),
    };
    denoClient = {
      check: jest.fn().mockResolvedValue({ ok: true, errors: [] }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicNodesService,
        { provide: DynamicNodeRepository, useValue: repository },
        { provide: DenoRunnerClient, useValue: denoClient },
      ],
    }).compile();
    service = module.get<DynamicNodesService>(DynamicNodesService);
  }

  describe("publish — happy path", () => {
    beforeEach(async () => {
      await buildService();
    });

    it("creates v1 + returns slug/version/signature", async () => {
      repository.createWithFirstVersion.mockResolvedValue({
        dynamicNode: { id: "dn-1" },
        headVersion: { id: "dnv-1", versionNumber: 1 },
      });

      const result = await service.publish({
        groupId: "g-1",
        script: VALID_SCRIPT,
        mode: "create",
        actorUserId: "u-1",
      });

      expect(result.slug).toBe("my-node");
      expect(result.version).toBe(1);
      expect(result.signature.name).toBe("my-node");
      expect(result.signature.inputs[0].name).toBe("document");
      expect(result.signature.outputs[0].name).toBe("result");
      expect(denoClient.check).toHaveBeenCalledWith(VALID_SCRIPT);
      expect(repository.createWithFirstVersion).toHaveBeenCalledTimes(1);
      expect(repository.publishNewVersion).not.toHaveBeenCalled();
    });

    it("update-mode delegates to publishNewVersion when @name matches pathSlug", async () => {
      repository.publishNewVersion.mockResolvedValue({
        dynamicNode: { id: "dn-1" },
        headVersion: { id: "dnv-2", versionNumber: 2 },
      });

      const result = await service.publish({
        groupId: "g-1",
        pathSlug: "my-node",
        script: VALID_SCRIPT,
        mode: "update",
        actorUserId: "u-1",
      });

      expect(result.version).toBe(2);
      expect(repository.publishNewVersion).toHaveBeenCalledTimes(1);
      expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
    });
  });

  describe("publish — stage short-circuit", () => {
    beforeEach(async () => {
      await buildService();
    });

    it("jsdoc-parse failure short-circuits — ts-check is not called", async () => {
      const badScript = "// no JSDoc at all\nexport default function () {}";
      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          script: badScript,
          mode: "create",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PublishValidationError);
      const errors = (thrown as PublishValidationError).errors;
      expect(errors[0].stage).toBe("jsdoc-parse");
      expect(denoClient.check).not.toHaveBeenCalled();
      expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
    });

    it("signature-semantics failure short-circuits — ts-check is not called", async () => {
      // Slug with invalid characters → signature-semantics rejects it.
      const badScript = `/**
 * @workflow-node
 * @name INVALID_SLUG
 * @description bad slug
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode() {}
`;
      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          script: badScript,
          mode: "create",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PublishValidationError);
      const errors = (thrown as PublishValidationError).errors;
      expect(errors[0].stage).toBe("signature-semantics");
      expect(denoClient.check).not.toHaveBeenCalled();
    });

    it("ts-check failure is mapped to stage='ts-check' errors", async () => {
      denoClient.check.mockResolvedValue({
        ok: false,
        errors: [
          {
            line: 10,
            column: 7,
            message: "Type 'string' is not assignable to type 'number'.",
          },
        ],
      });

      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          script: VALID_SCRIPT_WITH_TS_ERROR,
          mode: "create",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PublishValidationError);
      const errors = (thrown as PublishValidationError).errors;
      expect(errors).toEqual([
        {
          stage: "ts-check",
          line: 10,
          column: 7,
          message: "Type 'string' is not assignable to type 'number'.",
        },
      ]);
      expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
    });
  });

  describe("publish — allowlist intersection", () => {
    it("rejects out-of-allowlist hosts with stage='allowlist'", async () => {
      await buildService("api.landingai.com,api.mistral.ai");
      const scriptWithBadHost = `/**
 * @workflow-node
 * @name my-node
 * @description Calls a host.
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 * @allowNet ["api.landingai.com", "evil.example.com"]
 */
export default async function dynamicNode() {}
`;
      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          script: scriptWithBadHost,
          mode: "create",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PublishValidationError);
      const errors = (thrown as PublishValidationError).errors;
      expect(errors).toEqual([
        expect.objectContaining({
          stage: "allowlist",
          rejectedHost: "evil.example.com",
        }),
      ]);
    });

    it("passes through when every declared host is in the global allowlist", async () => {
      await buildService("api.landingai.com,api.mistral.ai");
      repository.createWithFirstVersion.mockResolvedValue({
        dynamicNode: { id: "dn-1" },
        headVersion: { id: "dnv-1", versionNumber: 1 },
      });
      const goodScript = `/**
 * @workflow-node
 * @name my-node
 * @description Calls a host.
 * @inputs { document: { kind: "Document" } }
 * @outputs { result: { kind: "Artifact" } }
 * @allowNet ["api.landingai.com"]
 */
export default async function dynamicNode() {}
`;
      const result = await service.publish({
        groupId: "g-1",
        script: goodScript,
        mode: "create",
      });
      expect(result.signature.allowNet).toEqual(["api.landingai.com"]);
      expect(repository.createWithFirstVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe("publish — update-mode name mismatch", () => {
    beforeEach(async () => {
      await buildService();
    });

    it("throws NameMismatchError when @name != pathSlug", async () => {
      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          pathSlug: "different-node",
          script: VALID_SCRIPT,
          mode: "update",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(NameMismatchError);
      const err = thrown as NameMismatchError;
      expect(err.pathSlug).toBe("different-node");
      expect(err.scriptName).toBe("my-node");
      expect(denoClient.check).not.toHaveBeenCalled();
      expect(repository.publishNewVersion).not.toHaveBeenCalled();
    });
  });

  describe("publish — DENO_RUNNER_UNAVAILABLE", () => {
    beforeEach(async () => {
      await buildService();
    });

    it("propagates DenoRunnerUnavailableError when the runner is unreachable", async () => {
      denoClient.check.mockRejectedValue(
        new DenoRunnerUnavailableError("connect ECONNREFUSED"),
      );

      let thrown: unknown = null;
      try {
        await service.publish({
          groupId: "g-1",
          script: VALID_SCRIPT,
          mode: "create",
        });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(DenoRunnerUnavailableError);
      expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
    });
  });

  describe("publish — repo error propagation", () => {
    beforeEach(async () => {
      await buildService();
    });

    it("propagates DuplicateSlugError from create-mode", async () => {
      repository.createWithFirstVersion.mockRejectedValue(
        new DuplicateSlugError("my-node"),
      );
      await expect(
        service.publish({
          groupId: "g-1",
          script: VALID_SCRIPT,
          mode: "create",
        }),
      ).rejects.toBeInstanceOf(DuplicateSlugError);
    });

    it("propagates DynamicNodeNotFoundError from update-mode", async () => {
      repository.publishNewVersion.mockRejectedValue(
        new DynamicNodeNotFoundError("my-node"),
      );
      await expect(
        service.publish({
          groupId: "g-1",
          pathSlug: "my-node",
          script: VALID_SCRIPT,
          mode: "update",
        }),
      ).rejects.toBeInstanceOf(DynamicNodeNotFoundError);
    });
  });

  // ---------------------------------------------------------------------
  // US-173 — merged catalog + per-group cache + invalidation
  // ---------------------------------------------------------------------
  describe("getMergedCatalogForGroup", () => {
    beforeEach(async () => {
      await buildService();
    });

    function fakeLineage(slug: string, version: number) {
      const signature: DynamicNodeSignature = {
        name: slug,
        description: `description for ${slug}`,
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
      };
      return {
        slug,
        deletedAt: null,
        headVersion: {
          versionNumber: version,
          signature,
        },
        _count: { versions: version },
      };
    }

    it("Scenario 1 — merges static + dynamic; statics first, dynamic sorted by slug", async () => {
      repository.listForGroup.mockResolvedValue([
        fakeLineage("zeta-node", 2),
        fakeLineage("alpha-node", 1),
      ]);

      const entries = await service.getMergedCatalogForGroup("g-1");

      const staticCount = Object.keys(ACTIVITY_CATALOG).length;
      expect(entries.length).toBe(staticCount + 2);
      // Last two are the dynamic entries, alphabetically sorted.
      const dynamicTail = entries.slice(staticCount);
      expect(dynamicTail.map((e) => e.dynamicNodeSlug)).toEqual([
        "alpha-node",
        "zeta-node",
      ]);
      // Static entries come first and match the package's catalog values.
      const staticHead = entries.slice(0, staticCount);
      for (const entry of staticHead) {
        expect(entry.dynamicNodeSlug).toBeUndefined();
      }
      // Each dynamic entry carries the Phase 6 fields.
      for (const dyn of dynamicTail) {
        expect(dyn.activityType.startsWith("dyn.")).toBe(true);
        expect(dyn.colorHint).toBe("dyn");
        expect(dyn.dynamicNodeVersion).toBeGreaterThan(0);
      }
    });

    it("Scenario 5 — preserves the existing entry shape (inputs/outputs/paramsSchema)", async () => {
      repository.listForGroup.mockResolvedValue([fakeLineage("alpha-node", 1)]);
      const entries = await service.getMergedCatalogForGroup("g-1");
      const alpha = entries.find((e) => e.dynamicNodeSlug === "alpha-node");
      expect(alpha).toBeDefined();
      expect(alpha?.inputs[0]).toMatchObject({
        name: "document",
        kind: "Document",
      });
      expect(alpha?.outputs[0]).toMatchObject({
        name: "result",
        kind: "Artifact",
      });
      expect(alpha?.paramsSchema).toEqual({
        type: "object",
        properties: {},
        additionalProperties: false,
      });
    });

    it("Scenario 2 — soft-deleted lineages are excluded (listForGroup default)", async () => {
      // The repo's listForGroup already excludes soft-deleted lineages
      // by default. Assert the service propagates that: only the
      // non-deleted lineage shows up.
      repository.listForGroup.mockResolvedValue([fakeLineage("kept", 1)]);
      const entries = await service.getMergedCatalogForGroup("g-1");
      const slugs = entries
        .map((e) => e.dynamicNodeSlug)
        .filter((s): s is string => s !== undefined);
      expect(slugs).toEqual(["kept"]);
    });

    it("Scenario 3 — cross-group isolation: g-2 sees only its own lineages", async () => {
      repository.listForGroup.mockImplementation((groupId: string) => {
        if (groupId === "g-1") {
          return Promise.resolve([
            fakeLineage("only-in-g1-a", 1),
            fakeLineage("only-in-g1-b", 1),
          ]);
        }
        return Promise.resolve([]);
      });

      const g1 = await service.getMergedCatalogForGroup("g-1");
      const g2 = await service.getMergedCatalogForGroup("g-2");

      const g1Dyn = g1.filter((e) => e.dynamicNodeSlug !== undefined);
      const g2Dyn = g2.filter((e) => e.dynamicNodeSlug !== undefined);
      expect(g1Dyn.length).toBe(2);
      expect(g2Dyn.length).toBe(0);
    });

    it("Scenario 4 — 100 reads in a row consult the DB at most once (TTL cache)", async () => {
      repository.listForGroup.mockResolvedValue([fakeLineage("alpha", 1)]);

      for (let i = 0; i < 100; i++) {
        await service.getMergedCatalogForGroup("g-1");
      }
      expect(repository.listForGroup).toHaveBeenCalledTimes(1);
    });

    it("Scenario 4 — invalidateGroupCatalogCache forces the next read to re-query", async () => {
      repository.listForGroup.mockResolvedValue([fakeLineage("alpha", 1)]);

      await service.getMergedCatalogForGroup("g-1");
      await service.getMergedCatalogForGroup("g-1");
      expect(repository.listForGroup).toHaveBeenCalledTimes(1);

      service.invalidateGroupCatalogCache("g-1");

      await service.getMergedCatalogForGroup("g-1");
      expect(repository.listForGroup).toHaveBeenCalledTimes(2);
    });

    it("Scenario 4 — invalidating g-1 does not affect g-2's cached entry", async () => {
      repository.listForGroup.mockImplementation((groupId: string) =>
        Promise.resolve([fakeLineage(`only-in-${groupId}`, 1)]),
      );

      await service.getMergedCatalogForGroup("g-1");
      await service.getMergedCatalogForGroup("g-2");
      expect(repository.listForGroup).toHaveBeenCalledTimes(2);

      service.invalidateGroupCatalogCache("g-1");

      await service.getMergedCatalogForGroup("g-2"); // still cached
      await service.getMergedCatalogForGroup("g-1"); // cache busted
      expect(repository.listForGroup).toHaveBeenCalledTimes(3);
    });

    it("skips lineages missing a head version defensively", async () => {
      repository.listForGroup.mockResolvedValue([
        {
          slug: "broken",
          deletedAt: null,
          headVersion: null,
          _count: { versions: 0 },
        },
        fakeLineage("kept", 1),
      ]);
      const entries = await service.getMergedCatalogForGroup("g-1");
      const slugs = entries
        .map((e) => e.dynamicNodeSlug)
        .filter((s): s is string => s !== undefined);
      expect(slugs).toEqual(["kept"]);
    });
  });
});
