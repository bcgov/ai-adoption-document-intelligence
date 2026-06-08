/**
 * POST /execute — spawn a Deno subprocess that runs the supplied user script
 * against the supplied inputCtx + parameters. Enforces per-invocation timeout,
 * stdout cap, allowNet, and ambient env vars.
 */

import { buildSubprocessScript } from "./subprocess-harness.ts";

const STDOUT_CAP_BYTES = 5 * 1024 * 1024; // 5 MB
const HARD_TIMEOUT_CEILING_MS = 60_000;
const HARD_MEMORY_CEILING_MB = 256;
const TMP_DIR = "/tmp/deno-runner";

interface ExecuteRequest {
  script: string;
  inputCtx: Record<string, unknown>;
  parameters: Record<string, unknown>;
  allowNet: string[];
  ambientEnv: Record<string, string>;
  timeoutMs: number;
  maxMemoryMB: number;
}

interface ExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  stdoutTooLarge?: boolean;
}

async function ensureTmpDir(): Promise<void> {
  try {
    await Deno.mkdir(TMP_DIR, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
  }
}

function validateRequest(body: unknown): ExecuteRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.script !== "string" || b.script.length === 0) {
    throw new Error("`script` must be a non-empty string");
  }
  if (typeof b.inputCtx !== "object" || b.inputCtx === null) {
    throw new Error("`inputCtx` must be an object");
  }
  if (typeof b.parameters !== "object" || b.parameters === null) {
    throw new Error("`parameters` must be an object");
  }
  if (!Array.isArray(b.allowNet) || !b.allowNet.every((h) => typeof h === "string")) {
    throw new Error("`allowNet` must be an array of strings");
  }
  if (typeof b.ambientEnv !== "object" || b.ambientEnv === null) {
    throw new Error("`ambientEnv` must be an object");
  }
  if (typeof b.timeoutMs !== "number" || b.timeoutMs <= 0) {
    throw new Error("`timeoutMs` must be a positive number");
  }
  if (typeof b.maxMemoryMB !== "number" || b.maxMemoryMB <= 0) {
    throw new Error("`maxMemoryMB` must be a positive number");
  }
  return b as unknown as ExecuteRequest;
}

export async function handleExecute(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "InvalidJson", message: "Body must be valid JSON" });
  }

  let request: ExecuteRequest;
  try {
    request = validateRequest(body);
  } catch (err) {
    return jsonResponse(400, {
      error: "InvalidRequest",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const timeoutMs = Math.min(request.timeoutMs, HARD_TIMEOUT_CEILING_MS);
  const maxMemoryMB = Math.min(request.maxMemoryMB, HARD_MEMORY_CEILING_MB);
  const ambientEnvKeys = Object.keys(request.ambientEnv);

  await ensureTmpDir();
  const requestId = crypto.randomUUID();
  const tempPath = `${TMP_DIR}/${requestId}.ts`;

  const fullScript = buildSubprocessScript(request.script);
  await Deno.writeTextFile(tempPath, fullScript);

  const allowNetFlag = request.allowNet.length > 0
    ? `--allow-net=${request.allowNet.join(",")}`
    : "--allow-net=__none__";
  const allowEnvFlag = ambientEnvKeys.length > 0
    ? `--allow-env=${ambientEnvKeys.join(",")}`
    : "--allow-env=__none__";

  const args = [
    "run",
    // Disable remote module loading. Static remote imports
    // (`import x from "https://..."`) are fetched during module-graph build,
    // OUTSIDE runtime `--allow-net` gating, so they would otherwise bypass the
    // egress allowlist. User scripts may import only local/std-vendored modules.
    "--no-remote",
    allowNetFlag,
    allowEnvFlag,
    "--no-prompt",
    `--v8-flags=--max-old-space-size=${maxMemoryMB}`,
    tempPath,
  ];

  const start = performance.now();
  const abortController = new AbortController();
  let timeoutFired = false;
  const timeoutId = setTimeout(() => {
    timeoutFired = true;
    abortController.abort();
  }, timeoutMs);

  let stdout = "";
  let stderr = "";
  let exitCode = -1;
  let timedOut = false;
  let stdoutTooLarge = false;

  try {
    const command = new Deno.Command("deno", {
      args,
      env: request.ambientEnv,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      signal: abortController.signal,
    });
    const child = command.spawn();

    const stdinWriter = child.stdin.getWriter();
    const inputJson = JSON.stringify({
      inputCtx: request.inputCtx,
      parameters: request.parameters,
    });
    await stdinWriter.write(new TextEncoder().encode(`${inputJson}\n`));
    await stdinWriter.close();

    const stdoutResult = await readStreamWithCap(child.stdout, STDOUT_CAP_BYTES);
    const stderrResult = await readStream(child.stderr);
    stdout = stdoutResult.text;
    stdoutTooLarge = stdoutResult.tooLarge;
    stderr = stderrResult;

    if (stdoutTooLarge) {
      try {
        child.kill("SIGKILL");
      } catch { /* may already be exiting */ }
    }

    const status = await child.status;
    exitCode = status.code;
    if (timeoutFired) {
      // AbortController fired → subprocess was killed by the runner. Override the
      // exit code so the caller sees a clean timeout signal regardless of the
      // signal-derived code (143 = SIGTERM, etc.).
      timedOut = true;
      exitCode = -1;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      timedOut = true;
      exitCode = -1;
    } else if (timeoutFired) {
      timedOut = true;
      exitCode = -1;
    } else {
      stderr += `\n[runner] subprocess error: ${err instanceof Error ? err.message : String(err)}`;
    }
  } finally {
    clearTimeout(timeoutId);
    Deno.remove(tempPath).catch(() => { /* best-effort cleanup */ });
  }

  const durationMs = Math.round(performance.now() - start);

  const response: ExecuteResponse = {
    stdout,
    stderr,
    exitCode,
    durationMs,
    timedOut,
  };
  if (stdoutTooLarge) response.stdoutTooLarge = true;

  return jsonResponse(200, response);
}

async function readStreamWithCap(
  stream: ReadableStream<Uint8Array>,
  capBytes: number,
): Promise<{ text: string; tooLarge: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  let tooLarge = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > capBytes) {
      tooLarge = true;
      try {
        reader.cancel();
      } catch { /* noop */ }
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { text, tooLarge };
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
