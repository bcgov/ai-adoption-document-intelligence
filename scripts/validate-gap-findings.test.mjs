// scripts/validate-gap-findings.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateFindings } from "./validate-gap-findings.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

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
});
