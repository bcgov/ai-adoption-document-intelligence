/**
 * Unit tests for the Phase 6 Milestone C (US-170) `dyn.run` activity body.
 *
 * Tests stub the `DenoRunnerClient` + prisma so they verify the activity's
 * logic (allowNet intersection, ambient env composition, runner-failure →
 * typed-error mapping, output structural check) without needing the live
 * deno-runner container. The integration tests against the real runner live
 * in `dyn-run.activity.spec.ts` (US-172).
 */

import { createHash } from "node:crypto";
import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import type { PrismaClient } from "@generated/client";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  type DenoExecuteRequest,
  type DenoExecuteResponse,
  type DenoRunnerClient,
  DenoRunnerUnavailableError,
} from "./deno-runner.client";
import { computeAllowNet, dynRun, extractHost } from "./dyn-run.activity";
import { DYN_RUN_ACTIVITY_OPTIONS } from "./dyn-run.types";
import { DynamicNodeTimeoutError } from "./errors";
import { versionCache } from "./version-cache";

// All tests pre-populate `versionCache`, so the activity's script lookup
// never calls Prisma. The stub still has to carry the `internalToken`
// delegate: every invocation mints a per-run internal token (Change W) and
// best-effort deletes it afterwards. Recreated per test via `beforeEach`.
let internalTokenCreate: jest.Mock;
let internalTokenDelete: jest.Mock;
let stubPrisma: PrismaClient;

beforeEach(() => {
  internalTokenCreate = jest
    .fn()
    .mockImplementation(async () => ({ id: "tok-row-1" })) as jest.Mock;
  internalTokenDelete = jest
    .fn()
    .mockImplementation(async () => ({})) as jest.Mock;
  stubPrisma = {
    internalToken: {
      create: internalTokenCreate,
      delete: internalTokenDelete,
    },
  } as unknown as PrismaClient;
});

function makeSignature(
  overrides: Partial<DynamicNodeSignature> = {},
): DynamicNodeSignature {
  return {
    name: "my-node",
    description: "test",
    category: "Custom",
    deterministic: false,
    inputs: [],
    outputs: [{ name: "url", kind: "string" }],
    paramsSchema: {},
    allowNet: ["api.example.com"],
    timeoutMs: 1000,
    maxMemoryMB: 128,
    ...overrides,
  };
}

function setupCachedVersion(
  versionId: string,
  signature: DynamicNodeSignature,
  allowNet = signature.allowNet,
) {
  versionCache.set(versionId, {
    script: "export default async () => ({ url: 'FOO' });",
    signature,
    allowNet,
    deterministic: signature.deterministic,
  });
}

function makeClientStub(response: DenoExecuteResponse) {
  const execute = jest
    .fn<
      (
        req: DenoExecuteRequest,
        signal?: AbortSignal,
      ) => Promise<DenoExecuteResponse>
    >()
    .mockResolvedValue(response);
  return {
    client: { execute } as unknown as DenoRunnerClient,
    execute,
  };
}

describe("dynRun — Scenario 2: permission flags computed", () => {
  beforeEach(() => versionCache.clear());

  it("intersects global + signature allowNet and adds the API host", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client, execute } = makeClientStub({
      stdout: '{"url":"FOO"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    await dynRun(
      {
        slug: "my-node",
        versionId: "v1",
        parameters: {},
        inputCtx: {},
        groupId: "g1",
        workflowRunId: "run-1",
      },
      {
        client,
        prisma: stubPrisma,
        readEnv: (name) => {
          if (name === "DYNAMIC_NODE_ALLOW_NET")
            return "api.example.com,api.mistral.ai";
          if (name === "AI_DI_API_BASE_URL") return "http://localhost:3002";
          return undefined;
        },
      },
    );

    const req = execute.mock.calls[0][0];
    expect(req.allowNet).toEqual(["api.example.com", "localhost:3002"]);
  });
});

describe("dynRun — Scenario 3: ambient env composition", () => {
  beforeEach(() => versionCache.clear());

  it("sends exactly the four AI_DI_ env vars; AI_DI_API_KEY is a freshly minted internal token (Change W)", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client, execute } = makeClientStub({
      stdout: '{"url":"FOO"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    await dynRun(
      {
        slug: "my-node",
        versionId: "v1",
        parameters: {},
        inputCtx: {},
        groupId: "g42",
        workflowRunId: "run-42",
      },
      {
        client,
        prisma: stubPrisma,
        readEnv: (name) => {
          if (name === "AI_DI_API_BASE_URL") return "http://localhost:3002";
          return undefined;
        },
      },
    );

    const req = execute.mock.calls[0][0];
    expect(Object.keys(req.ambientEnv).sort()).toEqual([
      "AI_DI_API_BASE_URL",
      "AI_DI_API_KEY",
      "AI_DI_GROUP_ID",
      "AI_DI_WORKFLOW_RUN_ID",
    ]);
    expect(req.ambientEnv.AI_DI_GROUP_ID).toBe("g42");
    expect(req.ambientEnv.AI_DI_WORKFLOW_RUN_ID).toBe("run-42");

    // The injected key is the RAW minted token (base64url of 32 bytes)...
    const rawToken = req.ambientEnv.AI_DI_API_KEY;
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // ...while the ROW stores only its SHA-256 hash, scoped to the
    // invoking workflow's group, purpose "dyn-run", no user binding, and
    // a 120 s expiry (2x the runner's 60 s wall-clock clamp).
    expect(internalTokenCreate).toHaveBeenCalledTimes(1);
    const createArg = internalTokenCreate.mock.calls[0][0] as {
      data: {
        tokenHash: string;
        groupId: string;
        userId: string | null;
        purpose: string;
        expiresAt: Date;
      };
    };
    expect(createArg.data.tokenHash).toBe(
      createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(createArg.data.groupId).toBe("g42");
    expect(createArg.data.userId).toBeNull();
    expect(createArg.data.purpose).toBe("dyn-run");
    const ttlMs = createArg.data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(110_000);
    expect(ttlMs).toBeLessThanOrEqual(120_000);

    // The row is deleted once the invocation is over.
    expect(internalTokenDelete).toHaveBeenCalledWith({
      where: { id: "tok-row-1" },
    });
  });

  it("mints a fresh token per invocation — two runs never share a credential", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client, execute } = makeClientStub({
      stdout: '{"url":"FOO"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });
    const deps = { client, prisma: stubPrisma };
    const input = {
      slug: "my-node",
      versionId: "v1",
      parameters: {},
      inputCtx: {},
      groupId: "g42",
      workflowRunId: "run-42",
    };

    await dynRun(input, deps);
    await dynRun(input, deps);

    const first = execute.mock.calls[0][0].ambientEnv.AI_DI_API_KEY;
    const second = execute.mock.calls[1][0].ambientEnv.AI_DI_API_KEY;
    expect(first).not.toBe(second);
    expect(internalTokenCreate).toHaveBeenCalledTimes(2);
    expect(internalTokenDelete).toHaveBeenCalledTimes(2);
  });

  it("a failed mint aborts before the runner is invoked, as a RETRYABLE infrastructure failure", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client, execute } = makeClientStub({
      stdout: '{"url":"FOO"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });
    internalTokenCreate.mockImplementation(async () => {
      throw new Error("db down");
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g42",
          workflowRunId: "run-42",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toMatchObject({
      type: "DynamicNodeTokenMintError",
      nonRetryable: false,
    });

    // The runner is never invoked without a token to inject.
    expect(execute).not.toHaveBeenCalled();
    expect(internalTokenDelete).not.toHaveBeenCalled();
  });

  it("the token row is deleted even when the script fails, and a failed delete is swallowed (expiry is the backstop)", async () => {
    setupCachedVersion("v1", makeSignature());
    // Script failure (non-zero exit) — the token must still be cleaned up.
    const { client } = makeClientStub({
      stdout: "",
      stderr: "boom",
      exitCode: 1,
      durationMs: 10,
      timedOut: false,
    });
    internalTokenDelete.mockImplementation(async () => {
      throw new Error("delete raced the sweep");
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g42",
          workflowRunId: "run-42",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toThrow(/exit/i);

    expect(internalTokenDelete).toHaveBeenCalledTimes(1);
  });
});

describe("dynRun — Scenario 5: runner failures mapped to typed errors", () => {
  beforeEach(() => versionCache.clear());

  it("timedOut → DynamicNodeTimeoutError", async () => {
    setupCachedVersion("v1", makeSignature({ timeoutMs: 1000 }));
    const { client } = makeClientStub({
      stdout: "",
      stderr: "",
      exitCode: -1,
      durationMs: 1100,
      timedOut: true,
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toBeInstanceOf(DynamicNodeTimeoutError);
  });

  it("stdoutTooLarge → DynamicNodeStdoutTooLargeError with cap", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client } = makeClientStub({
      stdout: "",
      stderr: "",
      exitCode: 137,
      durationMs: 50,
      timedOut: false,
      stdoutTooLarge: true,
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toMatchObject({
      name: "DynamicNodeStdoutTooLargeError",
      capBytes: 5 * 1024 * 1024,
    });
  });

  it("exitCode != 0 → DynamicNodeRuntimeError with stderrTail", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client } = makeClientStub({
      stdout: "",
      stderr: "Error: boom\n  at fn",
      exitCode: 1,
      durationMs: 50,
      timedOut: false,
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toMatchObject({
      name: "DynamicNodeRuntimeError",
      exitCode: 1,
      stderrTail: expect.stringContaining("Error: boom") as unknown,
    });
  });

  it("runner unreachable → generic Error mapped to 'deno runner unavailable'", async () => {
    setupCachedVersion("v1", makeSignature());
    const failingClient = {
      execute: jest
        .fn<
          (
            req: DenoExecuteRequest,
            signal?: AbortSignal,
          ) => Promise<DenoExecuteResponse>
        >()
        .mockRejectedValue(
          new DenoRunnerUnavailableError("connection refused"),
        ),
    } as unknown as DenoRunnerClient;

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client: failingClient, prisma: stubPrisma },
      ),
    ).rejects.toThrow(/deno runner unavailable/);
  });
});

describe("dynRun — Scenario 6: output structural check", () => {
  beforeEach(() => versionCache.clear());

  it("returns the parsed object on success", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client } = makeClientStub({
      stdout: '{"url":"FOO.PDF"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    const result = await dynRun(
      {
        slug: "my-node",
        versionId: "v1",
        parameters: {},
        inputCtx: {},
        groupId: "g1",
        workflowRunId: "run-1",
      },
      { client, prisma: stubPrisma },
    );
    expect(result).toEqual({ url: "FOO.PDF" });
  });

  it("missing declared port → DynamicNodeOutputShapeError", async () => {
    setupCachedVersion(
      "v1",
      makeSignature({
        outputs: [
          { name: "url", kind: "string" },
          { name: "missing", kind: "string" },
        ],
      }),
    );
    const { client } = makeClientStub({
      stdout: '{"url":"FOO.PDF"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toMatchObject({
      name: "DynamicNodeOutputShapeError",
      missingPorts: ["missing"],
    });
  });

  it("non-JSON stdout → DynamicNodeOutputInvalidJsonError with first 500 chars", async () => {
    setupCachedVersion("v1", makeSignature());
    const { client } = makeClientStub({
      stdout: "not json",
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    await expect(
      dynRun(
        {
          slug: "my-node",
          versionId: "v1",
          parameters: {},
          inputCtx: {},
          groupId: "g1",
          workflowRunId: "run-1",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toMatchObject({
      name: "DynamicNodeOutputInvalidJsonError",
      stdoutHead: "not json",
    });
  });

  it("optional ports (required:false) don't trigger DynamicNodeOutputShapeError", async () => {
    setupCachedVersion(
      "v1",
      makeSignature({
        outputs: [
          { name: "url", kind: "string" },
          { name: "extra", kind: "string", required: false },
        ],
      }),
    );
    const { client } = makeClientStub({
      stdout: '{"url":"FOO.PDF"}',
      stderr: "",
      exitCode: 0,
      durationMs: 10,
      timedOut: false,
    });

    const result = await dynRun(
      {
        slug: "my-node",
        versionId: "v1",
        parameters: {},
        inputCtx: {},
        groupId: "g1",
        workflowRunId: "run-1",
      },
      { client, prisma: stubPrisma },
    );
    expect(result).toEqual({ url: "FOO.PDF" });
  });
});

describe("computeAllowNet + extractHost — unit helpers", () => {
  it("empty global allowlist → drops signature hosts (fail-closed), keeps API host", () => {
    expect(
      computeAllowNet(new Set(), ["api.example.com"], "localhost:3002"),
    ).toEqual(["localhost:3002"]);
  });

  it("global allowlist intersects with signature", () => {
    expect(
      computeAllowNet(
        new Set(["api.example.com"]),
        ["api.example.com", "api.bad.com"],
        null,
      ),
    ).toEqual(["api.example.com"]);
  });

  it("API host always added even if not in signature", () => {
    expect(
      computeAllowNet(
        new Set(["api.example.com"]),
        ["api.example.com"],
        "api.backend",
      ),
    ).toEqual(["api.backend", "api.example.com"]);
  });

  it("extractHost extracts host:port", () => {
    expect(extractHost("http://localhost:3002")).toBe("localhost:3002");
    expect(extractHost("https://api.example.com")).toBe("api.example.com");
    expect(extractHost("not a url")).toBeNull();
  });
});

describe("DYN_RUN_ACTIVITY_OPTIONS — retry classification (Change L)", () => {
  it("retries transport failures (3 attempts with backoff) so a runner restart doesn't fail the run", () => {
    expect(DYN_RUN_ACTIVITY_OPTIONS.retry.maximumAttempts).toBe(3);
    expect(DYN_RUN_ACTIVITY_OPTIONS.retry.initialInterval).toBe("1 second");
    expect(DYN_RUN_ACTIVITY_OPTIONS.retry.backoffCoefficient).toBe(2);
  });

  it("keeps every script-level outcome terminal — those go to the agent for revision, not another attempt", () => {
    expect(DYN_RUN_ACTIVITY_OPTIONS.retry.nonRetryableErrorTypes).toEqual([
      "DynamicNodeTimeoutError",
      "DynamicNodeStdoutTooLargeError",
      "DynamicNodeRuntimeError",
      "DynamicNodeOutputInvalidJsonError",
      "DynamicNodeOutputShapeError",
    ]);
  });
});
