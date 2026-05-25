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
});
