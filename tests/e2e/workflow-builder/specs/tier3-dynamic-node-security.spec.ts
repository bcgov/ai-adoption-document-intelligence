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
    // An A/B on ONE script and ONE host: denied when the host is absent from
    // allowNet, permitted when it is present. That is the whole claim — the
    // allowlist, and nothing else, is what produces the denial above.
    //
    // The target is a CLOSED LOOPBACK PORT, not a public hostname, and that is
    // deliberate. The granted half has to let the fetch actually reach the
    // network layer to prove no permission error is raised, which means the
    // request's failure mode becomes the test's clock. Against a non-existent
    // public host that clock is DNS, and DNS is not ours: on a corporate
    // network the sandbox's resolver took >8s to conclude NXDOMAIN (six search
    // domains, upstream forwarders), overrunning the runner's own 5s timeout,
    // so the runner returned `timedOut: true` / exit −1 and this test failed
    // for a reason that had nothing to do with permissions. 127.0.0.1:9 (the
    // discard port, closed) skips resolution entirely and refuses in ~40ms.
    // Deno gates loopback exactly as it gates any other host, so the gate
    // under test is unchanged — only the environmental dependency is gone.
    const script = `export default async function () {
  try {
    await fetch("http://127.0.0.1:9/");
    return { reached: true };
  } catch (e) {
    return { reached: false, error: String(e) };
  }
}`;

    // The script catches its own failure, so the denial surfaces as the
    // returned error string rather than a non-zero exit — which is the point
    // of the A/B: one script, one host, and the ONLY difference between the
    // two outcomes below is the allowNet argument. (The uncaught form, where
    // the denial kills the process, is the preceding test.)
    const denied = await execViaRunner(request, { script, allowNet: [] });
    expect(denied.stdout).toMatch(/Requires net access/i);
    expect(denied.stdout).toContain("127.0.0.1:9");
    expect(denied.stdout).toContain(`"reached":false`);

    const granted = await execViaRunner(request, {
      script,
      allowNet: ["127.0.0.1:9"],
    });

    expect(
      granted.timedOut,
      `granted run timed out: ${JSON.stringify(granted)}`,
    ).toBe(false);
    expect(granted.exitCode).toBe(0);
    // Crucially, the failure mode is NOT a permission denial — the script got
    // past the gate and reported an ordinary connection error instead.
    expect(granted.stderr).not.toMatch(/Requires net access/i);
    expect(granted.stdout).not.toMatch(/Requires net access/i);
    expect(granted.stdout).not.toMatch(/NotCapable/);
    expect(granted.stdout).toContain(`"reached":false`);
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
