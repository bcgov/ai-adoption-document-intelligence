/**
 * Tests the env-loader via a child process so it gets a clean process.env
 * (dotenv mutates the current process and cannot be re-run cleanly).
 *
 * The loader resolves the repo-root .env relative to its own file location
 * (../../../.env from apps/<app>/src). The loader source is copied three
 * directories deep under a temp dir *inside* this package so node module
 * resolution (for "dotenv") still finds the real node_modules tree, while
 * the fake repo-root .env lands at the temp dir's own root.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LOADER_SOURCE = resolve(__dirname, "env-loader.ts");
const PACKAGE_DIR = resolve(__dirname, "..");

function runLoader(opts: {
  tmpDir: string;
  readVars: string[];
}): Record<string, string | undefined> {
  const loaderCopy = join(opts.tmpDir, "a/b/src/env-loader.ts");
  mkdirSync(join(opts.tmpDir, "a/b/src"), { recursive: true });
  cpSync(LOADER_SOURCE, loaderCopy);

  const script = `
    require('ts-node/register/transpile-only');
    require(${JSON.stringify(loaderCopy)});
    const out = {};
    for (const k of ${JSON.stringify(opts.readVars)}) out[k] = process.env[k];
    process.stdout.write(JSON.stringify(out));
  `;
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Strip any inherited values so the loader's behaviour is observable.
  for (const k of opts.readVars) delete env[k];
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: PACKAGE_DIR,
    env,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("env-loader (backend-services)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(PACKAGE_DIR, ".env-loader-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads vars from the repo-root .env", () => {
    writeFileSync(join(tmpDir, ".env"), "SECRET_KEY=from-root\n");
    const result = runLoader({ tmpDir, readVars: ["SECRET_KEY"] });
    expect(result.SECRET_KEY).toBe("from-root");
  });

  it("no root .env: var remains unset", () => {
    const result = runLoader({ tmpDir, readVars: ["SECRET_KEY"] });
    expect(result.SECRET_KEY).toBeUndefined();
  });
});
