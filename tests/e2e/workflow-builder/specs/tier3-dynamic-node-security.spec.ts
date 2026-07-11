import { expect, test } from "@playwright/test";
import {
  attemptPublishScript,
  execViaRunner,
} from "../helpers/dynamic-node-api";

/**
 * Tier 3 (@infra) — dynamic-node security gates (Manual test plan 14.11–14.13).
 *
 * The highest-risk surface: user-authored scripts run inside a Deno sandbox.
 * These specs drive the REAL security machinery end-to-end — the publish
 * pipeline (jsdoc-parse → ts-check → allowlist) and the deno-runner's
 * per-invocation permission sandbox — asserting that each escape vector is
 * closed. Pure-API (no browser): the guarantees live in the backend + runner,
 * not the canvas.
 *
 * Tagged @infra because both the publish `ts-check` stage and every
 * `/execute` call require the deno-runner sidecar live (and are excluded from
 * the hermetic default CI run). The complementary runtime-denial matrix
 * (file/write/subprocess/ffi) is covered against the live runner by
 * `apps/temporal/.../dyn-run.activity.integration.test.ts` (Item 5); here we
 * guard the two vectors reachable through the product's own HTTP surfaces
 * (publish + run) plus prove the allowlist is the actual gate.
 *
 * Design note — why NOT a full Temporal run: driving publish→startRun→
 * node-statuses would additionally depend on the worker's `PLATFORM_API_KEY`
 * being provisioned (absent it, `dyn.run` fails on a config error, not a
 * security denial) and on the run reaching a terminal state the live
 * node-statuses query can serve. The runner fast-path below is what the manual
 * plan documents for exactly this reason: it isolates the permission gate.
 */
test.describe("dynamic-node security @infra", () => {
  test("14.12 — publish rejects a @allowNet host outside the global allowlist", {
    tag: "@infra",
  }, async ({ request }) => {
    // A well-typed, publish-valid script whose ONLY defect is declaring an
    // egress host that isn't in DYNAMIC_NODE_ALLOW_NET. It clears jsdoc-parse,
    // signature-semantics and ts-check, then the allowlist stage rejects it.
    const name = `e2e-sec-allowlist-${Date.now()}`;
    const script = `/**
 * @workflow-node
 * @name ${name}
 * @description Declares a non-allowlisted egress host (security e2e).
 * @inputs {}
 * @outputs { result: { kind: "Artifact" } }
 * @allowNet ["blocked.example.com"]
 */
export default async function dynamicNode(
  _ctx: Record<string, never>,
  _params: Record<string, unknown>,
): Promise<{ result: { ok: boolean } }> {
  return { result: { ok: true } };
}`;

    const { status, body } = await attemptPublishScript(request, script);

    expect(status).toBe(400);
    const allowlistError = body.errors?.find((e) => e.stage === "allowlist");
    expect(
      allowlistError,
      `expected an allowlist-stage error, got: ${JSON.stringify(body)}`,
    ).toBeTruthy();
    expect(allowlistError?.rejectedHost).toBe("blocked.example.com");
    expect(allowlistError?.message).toMatch(/allowlist|DYNAMIC_NODE_ALLOW_NET/);
  });

  test("14.11 — runtime network egress to a non-allowlisted host is denied", {
    tag: "@infra",
  }, async ({ request }) => {
    // allowNet: [] → the runner spawns Deno with `--allow-net=__none__`, so
    // the fetch is rejected by the permission system BEFORE any DNS/connect.
    const result = await execViaRunner(request, {
      script: `export default async function () {
  await fetch("https://blocked.example.com/");
  return { ok: true };
}`,
      allowNet: [],
    });

    expect(result.exitCode).not.toBe(0);
    // Deno's NotCapable error names the denied net permission + the host.
    expect(result.stderr).toMatch(/Requires net access/i);
    expect(result.stderr).toContain("blocked.example.com");
  });

  test("14.11 — the allowlist is the gate: granting the host lifts the denial", {
    tag: "@infra",
  }, async ({ request }) => {
    // Same script, but the host is now in the computed allowlist. The Deno
    // net permission is granted, so the call is no longer permission-denied
    // (it returns cleanly — the script swallows any downstream network error).
    const result = await execViaRunner(request, {
      script: `export default async function () {
  try {
    await fetch("https://blocked.example.com/");
    return { reached: true };
  } catch (_e) {
    return { reached: false };
  }
}`,
      allowNet: ["blocked.example.com"],
    });

    expect(result.exitCode).toBe(0);
    // Crucially, the failure mode (if any) is NOT a permission denial.
    expect(result.stderr).not.toMatch(/Requires net access/i);
  });

  test("14.13 — env isolation: reading a host env var beyond the ambient set is denied", {
    tag: "@infra",
  }, async ({ request }) => {
    // ambientEnv: {} → `--allow-env=__none__`. The worker only ever grants the
    // four AI_DI_* vars; anything else (here PATH) is denied at read time, so
    // no host environment leaks into the subprocess.
    const result = await execViaRunner(request, {
      script: `export default async function () {
  return { path: Deno.env.get("PATH") };
}`,
      ambientEnv: {},
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Requires env access to "PATH"/i);
  });
});
