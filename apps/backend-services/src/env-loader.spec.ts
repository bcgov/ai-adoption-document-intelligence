/**
 * Tests the env-loader via child processes so each case gets a clean
 * process.env (dotenv mutates the current process and cannot be re-run cleanly).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const LOADER = resolve(__dirname, "env-loader.ts");
// Spawn children from this package dir so `ts-node` and `dotenv` resolve from
// node_modules. We chdir to the test's fake repo dir inside the child script
// before requiring the loader, since the loader uses process.cwd() for the
// repo-local .env lookup.
const PACKAGE_DIR = resolve(__dirname, "..");

function runLoader(opts: {
  cwd: string;
  secretsDir?: string;
  readVars: string[];
}): Record<string, string | undefined> {
  const script = `
    require('ts-node/register/transpile-only');
    process.chdir(${JSON.stringify(opts.cwd)});
    require(${JSON.stringify(LOADER)});
    const out = {};
    for (const k of ${JSON.stringify(opts.readVars)}) out[k] = process.env[k];
    process.stdout.write(JSON.stringify(out));
  `;
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Strip any inherited values so the loader's behaviour is observable.
  for (const k of opts.readVars) delete env[k];
  if (opts.secretsDir) env.DI_SECRETS_DIR = opts.secretsDir;
  else delete env.DI_SECRETS_DIR;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: PACKAGE_DIR,
    env,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("env-loader (backend-services)", () => {
  let tmp: string;
  let repoDir: string;
  let secretsDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "env-loader-be-"));
    repoDir = join(tmp, "repo");
    secretsDir = join(tmp, "secrets");
    mkdirSync(repoDir);
    mkdirSync(secretsDir);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("override file wins over repo-local .env", () => {
    writeFileSync(
      join(secretsDir, "backend-services.env"),
      "SECRET_KEY=from-override\n",
    );
    writeFileSync(join(repoDir, ".env"), "SECRET_KEY=from-local\n");
    const result = runLoader({
      cwd: repoDir,
      secretsDir,
      readVars: ["SECRET_KEY"],
    });
    expect(result.SECRET_KEY).toBe("from-override");
  });

  it("repo-local .env fills gaps not set by override", () => {
    writeFileSync(
      join(secretsDir, "backend-services.env"),
      "SECRET_KEY=from-override\n",
    );
    writeFileSync(
      join(repoDir, ".env"),
      "SECRET_KEY=from-local\nPUBLIC_KEY=public-val\n",
    );
    const result = runLoader({
      cwd: repoDir,
      secretsDir,
      readVars: ["SECRET_KEY", "PUBLIC_KEY"],
    });
    expect(result.SECRET_KEY).toBe("from-override");
    expect(result.PUBLIC_KEY).toBe("public-val");
  });

  it("no override file: uses only repo-local .env", () => {
    writeFileSync(join(repoDir, ".env"), "SECRET_KEY=from-local\n");
    const result = runLoader({
      cwd: repoDir,
      secretsDir,
      readVars: ["SECRET_KEY"],
    });
    expect(result.SECRET_KEY).toBe("from-local");
  });

  it("no files at all: var remains unset", () => {
    const result = runLoader({
      cwd: repoDir,
      secretsDir,
      readVars: ["SECRET_KEY"],
    });
    expect(result.SECRET_KEY).toBeUndefined();
  });
});
