/**
 * POST /check — run `deno check` against a supplied user script + the ambient
 * kinds.d.ts. Parses Deno's stderr into structured { line, column, message } entries.
 */

const TMP_DIR = "/tmp/deno-runner";
const KINDS_DTS_PATH = `${import.meta.dirname}/kinds.d.ts`;

interface CheckRequest {
  script: string;
}

interface CheckError {
  line?: number;
  column?: number;
  message: string;
}

interface CheckResponse {
  ok: boolean;
  errors: CheckError[];
}

async function ensureTmpDir(): Promise<void> {
  try {
    await Deno.mkdir(TMP_DIR, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
  }
}

function validateRequest(body: unknown): CheckRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.script !== "string" || b.script.length === 0) {
    throw new Error("`script` must be a non-empty string");
  }
  return { script: b.script };
}

/**
 * Parse Deno's TS check stderr into structured errors.
 *
 * Deno's check output looks like:
 *
 *   TS2322 [ERROR]: Type 'string' is not assignable to type 'number'.
 *     return "wrong";
 *     ~~~~~~~~~~~~~~
 *       at file:///tmp/deno-runner/check-<uuid>/script.ts:5:5
 *
 *   error: Type checking failed.
 *
 * We pull out the `at file:///...:LINE:COLUMN` lines and pair them with the
 * preceding TS<code> [ERROR]: <message> line.
 */
/** Strip ANSI color escape codes so the parser sees plain text. */
function stripAnsi(text: string): string {
  // deno-lint-ignore no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseStderr(stderr: string, scriptPath: string): CheckError[] {
  const clean = stripAnsi(stderr);
  const errors: CheckError[] = [];
  const lines = clean.split("\n");

  let pendingMessage: string | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Match both:   "error: TS2322 [ERROR]: ..."   and bare "TS2322 [ERROR]: ..."
    const errorMatch = line.match(/(?:error:\s+)?TS\d+\s*\[ERROR\]:\s*(.+)$/);
    if (errorMatch) {
      pendingMessage = errorMatch[1].trim();
      continue;
    }
    const locationMatch = line.match(/at\s+file:\/\/(\S+?):(\d+):(\d+)/);
    if (locationMatch && pendingMessage !== null) {
      const filePath = locationMatch[1];
      const lineNum = Number(locationMatch[2]);
      const colNum = Number(locationMatch[3]);
      if (filePath === scriptPath) {
        errors.push({ line: lineNum, column: colNum, message: pendingMessage });
        pendingMessage = null;
      }
    }
  }
  if (errors.length === 0) {
    // Fallback: surface the first `error:` line as an unlocated error so the
    // caller sees SOMETHING rather than an empty errors array.
    const fallback = lines.find((l) => l.trim().startsWith("error:"));
    if (fallback) {
      errors.push({ message: fallback.trim().replace(/^error:\s*/, "").trim() });
    }
  }
  return errors;
}

export async function handleCheck(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "InvalidJson", message: "Body must be valid JSON" });
  }

  let request: CheckRequest;
  try {
    request = validateRequest(body);
  } catch (err) {
    return jsonResponse(400, {
      error: "InvalidRequest",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  await ensureTmpDir();
  const requestId = crypto.randomUUID();
  const workDir = `${TMP_DIR}/check-${requestId}`;
  await Deno.mkdir(workDir, { recursive: true });

  const scriptPath = `${workDir}/script.ts`;
  const ambientDtsPath = `${workDir}/kinds.d.ts`;

  try {
    let ambientDts: string;
    try {
      ambientDts = await Deno.readTextFile(KINDS_DTS_PATH);
    } catch {
      ambientDts = "// kinds.d.ts not bundled; minimal fallback.\nexport {};\n";
    }
    await Deno.writeTextFile(ambientDtsPath, ambientDts);

    // Rewrite imports of `@ai-di/graph-workflow/kinds` so they resolve to the local
    // sibling kinds.d.ts file at check time. The user-authored script declares the
    // import; we make it resolve in this temp dir.
    const rewrittenScript = request.script.replace(
      /from\s+["']@ai-di\/graph-workflow\/kinds["']/g,
      `from "./kinds.d.ts"`,
    );
    await Deno.writeTextFile(scriptPath, rewrittenScript);

    const command = new Deno.Command("deno", {
      // `--no-remote` disables remote module loading. Static remote imports are
      // resolved during the `deno check` module-graph build (publish time),
      // outside any runtime gating, so they must be blocked here too.
      args: ["check", "--no-remote", "--no-lock", scriptPath],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stderr } = await command.output();
    const stderrText = new TextDecoder().decode(stderr);

    if (code === 0) {
      return jsonResponse(200, { ok: true, errors: [] } satisfies CheckResponse);
    }
    const errors = parseStderr(stderrText, scriptPath);
    return jsonResponse(200, { ok: false, errors } satisfies CheckResponse);
  } finally {
    Deno.remove(workDir, { recursive: true }).catch(() => { /* best-effort */ });
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
