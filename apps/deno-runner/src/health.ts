/**
 * GET /health — liveness probe. Returns the runner's Deno version (cached at startup).
 */

const DENO_VERSION = Deno.version.deno;

export function handleHealth(): Promise<Response> {
  return Promise.resolve(
    new Response(
      JSON.stringify({ ok: true, denoVersion: DENO_VERSION }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
}
