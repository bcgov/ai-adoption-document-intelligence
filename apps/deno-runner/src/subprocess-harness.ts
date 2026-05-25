/**
 * Auto-appended harness that wraps a user-authored dynamic-node script. The
 * user-authored script default-exports an async function; this harness reads
 * one JSON line from stdin, calls the function, and writes the result to stdout.
 *
 * Mirrors apps/temporal/src/dynamic-nodes/subprocess-harness.ts (US-169) so the
 * worker-side cache and the runner agree on what a "script" string contains.
 */

const HARNESS_SUFFIX = `
// --- auto-appended by deno-runner ---
{
  const __input = await new Response(Deno.stdin.readable).text();
  const { inputCtx, parameters } = JSON.parse(__input);
  // deno-lint-ignore no-explicit-any
  const __fn: any = (typeof __script !== "undefined" && __script)
    || (await import("./__SCRIPT_DEFAULT__")).default;
  const __out = await __fn(inputCtx, parameters);
  await Deno.stdout.write(new TextEncoder().encode(JSON.stringify(__out ?? null)));
}
`;

/**
 * Inject the harness suffix at the end of the user script. We rename the
 * user's `export default` to a local `__script` constant so the harness can
 * call it without dynamic-import gymnastics — which is brittle inside a
 * single-file Deno run.
 */
export function buildSubprocessScript(userScript: string): string {
  const rewritten = userScript.replace(
    /export\s+default\s+(async\s+)?function\s*([a-zA-Z_$][a-zA-Z0-9_$]*)?\s*\(/,
    (_match, asyncKw, _name) => `const __script = ${asyncKw ?? ""}function (`,
  );
  return `${rewritten}\n${HARNESS_SUFFIX}`;
}
