/**
 * Phase 6 Milestone C (US-172) — integration tests for the `dyn.run`
 * activity against the LIVE `deno-runner` container.
 *
 * Prerequisites:
 *   - `deno-runner` container reachable at `DENO_RUNNER_URL` (default
 *     `http://localhost:9099`). Start with
 *       `docker compose -f deployments/local/docker-compose.deno.yml up -d`
 *   - A real Postgres reachable via `DATABASE_URL` so the activity can
 *     read `DynamicNodeVersion` rows. Tests pre-populate the worker-side
 *     LRU cache (`versionCache`) to keep tests independent of a specific
 *     row layout; the prisma client is still injected so the lazy
 *     `getPrismaClient()` fallback never trips.
 *
 * If either prerequisite is unavailable the suite is SKIPPED (not failed)
 * so unrelated CI environments don't break.
 *
 * Covers:
 *   - Scenario 1 — uppercase-URL success path
 *   - Scenario 2 — timeout
 *   - Scenario 3 — stdout-too-large
 *   - Scenario 4 — runtime + invalid-JSON
 *   - Scenario 5 — missing-port + runner-unreachable
 *   - Scenario 6 — ambient env-var assertion
 */

import "../env-loader";
import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import type { PrismaClient } from "@generated/client";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { DenoRunnerClient } from "./deno-runner.client";
import { dynRun } from "./dyn-run.activity";
import {
  DynamicNodeOutputInvalidJsonError,
  DynamicNodeOutputShapeError,
  DynamicNodeRuntimeError,
  DynamicNodeStdoutTooLargeError,
  DynamicNodeTimeoutError,
} from "./errors";
import { type ScriptCacheEntry, versionCache } from "./version-cache";

const RUNNER_URL = process.env.DENO_RUNNER_URL ?? "http://localhost:9099";

async function runnerIsReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${RUNNER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function makeSignature(
  overrides: Partial<DynamicNodeSignature> = {},
): DynamicNodeSignature {
  return {
    name: "test-node",
    description: "integration test",
    category: "Custom",
    deterministic: false,
    inputs: [{ name: "url", kind: "string" }],
    outputs: [{ name: "uppercased", kind: "string" }],
    paramsSchema: {},
    allowNet: [],
    timeoutMs: 5000,
    maxMemoryMB: 64,
    ...overrides,
  };
}

function fixture(versionId: string, entry: ScriptCacheEntry): void {
  versionCache.set(versionId, entry);
}

// All tests pre-populate the LRU cache, so prisma is never touched. A stub
// satisfies the activity's lazy-getter so DATABASE_URL isn't required.
const stubPrisma = {} as unknown as PrismaClient;

let runnerUp = false;

beforeAll(async () => {
  runnerUp = await runnerIsReachable();
  if (!runnerUp) {
    console.warn(
      `[US-172] Skipping integration tests — deno-runner not reachable at ${RUNNER_URL}.\n` +
        "Start it with: docker compose -f deployments/local/docker-compose.deno.yml up -d",
    );
  }
});

afterAll(() => versionCache.clear());

/**
 * Per-test guard. The `describe` block runs always; each `it` aborts early
 * if the runner isn't reachable. We use this pattern (rather than
 * `describe.skip`) because `runnerUp` is only known after `beforeAll`, and
 * jest evaluates the describe-block argument synchronously at parse time.
 */
function requireRunner(): boolean {
  return runnerUp;
}

describe("dyn.run integration — live deno-runner (US-172)", () => {
  it("Scenario 1 — happy path: uppercase URL script returns { uppercased: { url: 'FOO.PDF' } }", async () => {
    if (!requireRunner()) return;
    const script = `
export default async function (inputCtx) {
  return { uppercased: { url: String(inputCtx.url).toUpperCase() } };
}
`;
    fixture("v-success", {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "object" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    const result = await dynRun(
      {
        slug: "test-node",
        versionId: "v-success",
        parameters: {},
        inputCtx: { url: "foo.pdf" },
        groupId: "g-int",
        workflowRunId: "run-int",
      },
      { client, prisma: stubPrisma },
    );

    expect(result).toEqual({ uppercased: { url: "FOO.PDF" } });
  }, 30_000);

  it("Scenario 2 — timeout: script sleeps 70s with timeoutMs: 1000 → DynamicNodeTimeoutError within ~1.5s", async () => {
    if (!requireRunner()) return;
    const script = `
export default async function () {
  await new Promise((resolve) => setTimeout(resolve, 70_000));
  return { uppercased: "never" };
}
`;
    fixture("v-timeout", {
      script,
      signature: makeSignature({
        timeoutMs: 1000,
        outputs: [{ name: "uppercased", kind: "string" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    const start = Date.now();
    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId: "v-timeout",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - start;

    expect(caught).toBeInstanceOf(DynamicNodeTimeoutError);
    expect(elapsed).toBeLessThan(3000);
  }, 30_000);

  it("Scenario 3 — stdout-too-large: 6MB stdout → DynamicNodeStdoutTooLargeError", async () => {
    if (!requireRunner()) return;
    // Script returns an object that JSON-serialises to >5MB. Doing this in
    // the return value forces the runner's stdout cap to trigger.
    const script = `
export default async function () {
  const big = "x".repeat(6 * 1024 * 1024);
  return { uppercased: big };
}
`;
    fixture("v-toobig", {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "string" }],
        timeoutMs: 10_000,
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId: "v-toobig",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DynamicNodeStdoutTooLargeError);
    expect((caught as DynamicNodeStdoutTooLargeError).capBytes).toBe(
      5 * 1024 * 1024,
    );
  }, 30_000);

  it("Scenario 4a — runtime error: script throws → DynamicNodeRuntimeError with stderrTail", async () => {
    if (!requireRunner()) return;
    const script = `
export default async function () {
  throw new Error("boom from user script");
}
`;
    fixture("v-runtime", {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "string" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId: "v-runtime",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DynamicNodeRuntimeError);
    const err = caught as DynamicNodeRuntimeError;
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail).toContain("boom");
  }, 30_000);

  it("Scenario 4b — invalid JSON: stdout 'not json' → DynamicNodeOutputInvalidJsonError", async () => {
    if (!requireRunner()) return;
    // The runner appends a harness that JSON.stringify's the return value, so
    // to actually produce non-JSON stdout we bypass it by writing directly
    // and exiting before the harness can run.
    const script = `
await Deno.stdout.write(new TextEncoder().encode("not json"));
Deno.exit(0);
export default async function () { return {}; }
`;
    fixture("v-badjson", {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "string" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId: "v-badjson",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DynamicNodeOutputInvalidJsonError);
    expect(
      (caught as DynamicNodeOutputInvalidJsonError).stdoutHead.startsWith(
        "not json",
      ),
    ).toBe(true);
  }, 30_000);

  it("Scenario 5a — missing declared port: signature requires 'result', script returns {} → DynamicNodeOutputShapeError", async () => {
    if (!requireRunner()) return;
    const script = `
export default async function () {
  return {};
}
`;
    fixture("v-missing", {
      script,
      signature: makeSignature({
        outputs: [{ name: "result", kind: "string" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId: "v-missing",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DynamicNodeOutputShapeError);
    expect((caught as DynamicNodeOutputShapeError).missingPorts).toEqual([
      "result",
    ]);
  }, 30_000);

  it("Scenario 5b — runner unreachable: client points at closed port → 'deno runner unavailable'", async () => {
    if (!requireRunner()) return;
    const script = `export default async function () { return { uppercased: "x" }; }`;
    fixture("v-unreach", {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "string" }],
      }),
      allowNet: [],
      deterministic: false,
    });
    // Port 9 is the discard port — TCP/IP RFC reserves it; nothing listens.
    const client = new DenoRunnerClient({ baseUrl: "http://127.0.0.1:9" });

    await expect(
      dynRun(
        {
          slug: "test-node",
          versionId: "v-unreach",
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      ),
    ).rejects.toThrow(/deno runner unavailable/);
  }, 30_000);

  it("Scenario 6 — ambient env: script reads each AI_DI_* var → exactly the four are present; unknown vars are denied", async () => {
    if (!requireRunner()) return;
    // `Deno.env.toObject()` requires a global `--allow-env` (no allow-list);
    // the runner intentionally restricts to a fixed allow-list, so we
    // enumerate each candidate name and prove (a) the four AI_DI_* vars
    // ARE readable, (b) attempting to read e.g. `PATH` denies the call.
    const script = `
export default async function () {
  const env = {};
  for (const k of ["AI_DI_API_BASE_URL","AI_DI_API_KEY","AI_DI_GROUP_ID","AI_DI_WORKFLOW_RUN_ID"]) {
    const v = Deno.env.get(k);
    if (v !== undefined) env[k] = v;
  }
  let pathDenied = false;
  try { Deno.env.get("PATH"); } catch (_) { pathDenied = true; }
  return { env, pathDenied };
}
`;
    fixture("v-env", {
      script,
      signature: makeSignature({
        outputs: [
          { name: "env", kind: "object" },
          { name: "pathDenied", kind: "boolean" },
        ],
        timeoutMs: 5000,
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    // Item 4 (security): AI_DI_API_KEY is sourced SERVER-SIDE from the worker's
    // `PLATFORM_API_KEY` config — not from the activity input (which would put
    // it in Temporal's durable history). Inject it via `readEnv` so the
    // assertion is deterministic regardless of the host env.
    const result = await dynRun(
      {
        slug: "test-node",
        versionId: "v-env",
        parameters: {},
        inputCtx: {},
        groupId: "g-int",
        workflowRunId: "run-int",
      },
      {
        client,
        prisma: stubPrisma,
        readEnv: (name) => {
          if (name === "PLATFORM_API_KEY") return "server-side-platform-key";
          return process.env[name];
        },
      },
    );

    const env = result.env as Record<string, string>;
    expect(Object.keys(env).sort()).toEqual([
      "AI_DI_API_BASE_URL",
      "AI_DI_API_KEY",
      "AI_DI_GROUP_ID",
      "AI_DI_WORKFLOW_RUN_ID",
    ]);
    expect(env.AI_DI_GROUP_ID).toBe("g-int");
    expect(env.AI_DI_WORKFLOW_RUN_ID).toBe("run-int");
    expect(env.AI_DI_API_KEY).toBe("server-side-platform-key");
    expect(result.pathDenied).toBe(true);
  }, 30_000);

  // -------------------------------------------------------------------------
  // Item 5 — sandbox-escape negative tests.
  //
  // The deno-runner sandbox spawns Deno with a fixed, minimal permission set
  // (no --allow-read, --allow-write, --allow-run, --allow-ffi; --allow-net is
  // restricted to the computed allowlist; --allow-env is restricted to the
  // four AI_DI_* vars). A script attempting any denied capability must have
  // the call REJECTED by the Deno permission system. Because the harness
  // catches the script's thrown error and returns a non-zero exit, the
  // activity surfaces a `DynamicNodeRuntimeError` whose stderr names the
  // denied permission. Each test below proves one escape vector is closed.
  //
  // These require the LIVE deno-runner (they spawn real Deno) and are SKIPPED
  // when it is unreachable — same gating as every test in this suite. They
  // MUST run in CI with the deno-runner container up to be meaningful.
  // -------------------------------------------------------------------------

  /**
   * Drive a deny-script through `dynRun` and return the resulting
   * `DynamicNodeRuntimeError` so each case can assert on its stderr. The
   * script is expected to throw inside the sandbox (denied capability), which
   * the runner surfaces as a non-zero exit → `DynamicNodeRuntimeError`.
   */
  async function expectSandboxDenied(
    versionId: string,
    script: string,
  ): Promise<DynamicNodeRuntimeError> {
    fixture(versionId, {
      script,
      signature: makeSignature({
        outputs: [{ name: "uppercased", kind: "string" }],
        timeoutMs: 5000,
      }),
      allowNet: [],
      deterministic: false,
    });
    const client = new DenoRunnerClient({ baseUrl: RUNNER_URL });

    let caught: unknown;
    try {
      await dynRun(
        {
          slug: "test-node",
          versionId,
          parameters: {},
          inputCtx: {},
          groupId: "g-int",
          workflowRunId: "run-int",
        },
        { client, prisma: stubPrisma },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DynamicNodeRuntimeError);
    return caught as DynamicNodeRuntimeError;
  }

  it("Item 5 — denies file read (Deno.readTextFile)", async () => {
    if (!requireRunner()) return;
    const err = await expectSandboxDenied(
      "v-deny-read",
      `
export default async function () {
  await Deno.readTextFile("/etc/passwd");
  return { uppercased: "should-not-reach" };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    // Deno's permission error names the read permission.
    expect(err.stderrTail.toLowerCase()).toMatch(/read|permission/);
  }, 30_000);

  it("Item 5 — denies file write (Deno.writeTextFile)", async () => {
    if (!requireRunner()) return;
    const err = await expectSandboxDenied(
      "v-deny-write",
      `
export default async function () {
  await Deno.writeTextFile("/tmp/escape.txt", "pwned");
  return { uppercased: "should-not-reach" };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail.toLowerCase()).toMatch(/write|permission/);
  }, 30_000);

  it("Item 5 — denies subprocess spawn (Deno.Command)", async () => {
    if (!requireRunner()) return;
    const err = await expectSandboxDenied(
      "v-deny-run",
      `
export default async function () {
  const cmd = new Deno.Command("ls", { args: ["/"] });
  await cmd.output();
  return { uppercased: "should-not-reach" };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail.toLowerCase()).toMatch(/run|permission/);
  }, 30_000);

  it("Item 5 — denies FFI (Deno.dlopen)", async () => {
    if (!requireRunner()) return;
    const err = await expectSandboxDenied(
      "v-deny-ffi",
      `
export default async function () {
  Deno.dlopen("libc.so.6", {});
  return { uppercased: "should-not-reach" };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail.toLowerCase()).toMatch(/ffi|permission|unstable/);
  }, 30_000);

  it("Item 5 — denies fetch to a non-allowlisted host", async () => {
    if (!requireRunner()) return;
    // allowNet is [] for this fixture → the runner's computed allowlist
    // contains only the API host; example.com is not reachable.
    const err = await expectSandboxDenied(
      "v-deny-net",
      `
export default async function () {
  await fetch("https://example.com/");
  return { uppercased: "should-not-reach" };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail.toLowerCase()).toMatch(/net|permission/);
  }, 30_000);

  it("Item 5 (review #3) — denies remote import", async () => {
    if (!requireRunner()) return;
    // `--no-remote` (review #3) blocks remote module specifiers at module-graph
    // build time, so evaluation fails before the default export ever runs.
    // Deno's message is "a remote specifier was requested ... but --no-remote
    // is specified."
    const err = await expectSandboxDenied(
      "v-deny-import",
      `
import { serve } from "https://deno.land/std/http/server.ts";
export default async function () {
  return { uppercased: typeof serve };
}
`,
    );
    expect(err.exitCode).not.toBe(0);
    expect(err.stderrTail.toLowerCase()).toMatch(
      /remote|import|net|permission|module/,
    );
  }, 30_000);
});
