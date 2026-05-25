/**
 * deno-runner HTTP server entry point.
 *
 * Exposes three endpoints used by apps/backend-services (publish-time validation)
 * and apps/temporal (runtime dyn.run activity). The runner spawns Deno subprocesses
 * inside this container — the calling services never spawn Deno themselves.
 *
 *   POST /execute  — run a user script against an input ctx
 *   POST /check    — type-check a user script via `deno check`
 *   GET  /health   — liveness probe
 */

import { handleExecute } from "./execute.ts";
import { handleCheck } from "./check.ts";
import { handleHealth } from "./health.ts";

const PORT = Number(Deno.env.get("PORT") ?? "9090");
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const start = performance.now();

  try {
    if (req.method === "POST" && url.pathname === "/execute") {
      return await handleExecute(req);
    }
    if (req.method === "POST" && url.pathname === "/check") {
      return await handleCheck(req);
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return await handleHealth();
    }
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runner] handler error on ${req.method} ${url.pathname}:`, message);
    return new Response(
      JSON.stringify({ error: "InternalServerError", message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  } finally {
    const ms = Math.round(performance.now() - start);
    console.log(`[runner] ${req.method} ${url.pathname} ${ms}ms`);
  }
}

console.log(`[runner] starting on ${HOST}:${PORT}`);
Deno.serve({ port: PORT, hostname: HOST }, handler);
