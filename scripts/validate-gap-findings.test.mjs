// scripts/validate-gap-findings.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFindings } from "./validate-gap-findings.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT_PATH = new URL("./validate-gap-findings.mjs", import.meta.url).pathname;

const VALID = {
  id: "B-001",
  pass: "B",
  title: "No canvas-level undo/redo",
  severity: "major",
  type: "design-gap",
  evidence: "apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx:45",
  surfaces: ["canvas"],
  disposition: "fix",
  rationale: "Deletion cascades with no recovery path.",
};

const check = (findings) => validateFindings(findings, { repoRoot: REPO_ROOT }).errors;

describe("validateFindings", () => {
  it("accepts a well-formed finding whose evidence resolves", () => {
    assert.deepEqual(check([VALID]), []);
  });

  it("rejects a missing required field", () => {
    const { rationale, ...missing } = VALID;
    const errors = check([missing]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /rationale/);
  });

  it("rejects an out-of-vocabulary enum value", () => {
    const errors = check([{ ...VALID, severity: "catastrophic" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /severity/);
  });

  it("rejects evidence pointing at a file that does not exist", () => {
    const errors = check([{ ...VALID, evidence: "apps/frontend/src/does-not-exist.tsx:12" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does-not-exist/);
  });

  it("rejects evidence pointing past the end of a real file", () => {
    const errors = check([{ ...VALID, evidence: "package.json:999999" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /999999/);
  });

  it("accepts prose evidence that is not a file reference", () => {
    const errors = check([
      { ...VALID, evidence: "Repro: open the map demo, drag the exit node right by 400px." },
    ]);
    assert.deepEqual(errors, []);
  });

  it("rejects duplicate ids", () => {
    const errors = check([VALID, VALID]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /duplicate/);
  });

  it("rejects an explicit null in a required field", () => {
    const errors = check([{ ...VALID, rationale: null }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /rationale/);
  });

  it("rejects a citation one line past true EOF (trailing-newline off-by-one)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gap-findings-eof-"));
    const fixture = join(dir, "eof-fixture.txt");
    writeFileSync(fixture, "line1\nline2\nline3\n");

    const errors = check([{ ...VALID, evidence: `${fixture}:4` }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /4/);
  });

  it("rejects line 0 (files are 1-indexed)", () => {
    const errors = check([{ ...VALID, evidence: "package.json:0" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /0/);
  });

  it("accepts line 1 of a real file (guards against over-correcting)", () => {
    const errors = check([{ ...VALID, evidence: "package.json:1" }]);
    assert.deepEqual(errors, []);
  });
});

describe("validate-gap-findings CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "gap-findings-cli-"));

  const runCli = (args) =>
    spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: "utf8" });

  it("reports a missing file cleanly and exits 1", () => {
    const missing = join(dir, "does-not-exist.json");
    const result = runCli([missing]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read/);
  });

  it("reports invalid JSON cleanly and exits 1", () => {
    const badJson = join(dir, "invalid.json");
    writeFileSync(badJson, "{ not valid json");
    const result = runCli([badJson]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid JSON/);
  });

  it("reports a non-array JSON payload cleanly and exits 1", () => {
    const notArray = join(dir, "not-array.json");
    writeFileSync(notArray, JSON.stringify({}));
    const result = runCli([notArray]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected a JSON array/);
  });

  it("continues past a malformed file to validate the rest of the batch", () => {
    const badJson = join(dir, "batch-bad.json");
    const clean = join(dir, "batch-clean.json");
    writeFileSync(badJson, "{ not valid json");
    writeFileSync(clean, JSON.stringify([VALID]));

    const result = runCli([badJson, clean]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid JSON/);
    assert.match(result.stdout, new RegExp(`${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*clean`));
  });

  it("exits 2 with a usage message when called with no arguments", () => {
    const result = runCli([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});
