/**
 * Tests for the Phase 6 Milestone C (US-168) typed error hierarchy.
 *
 * Verifies the three guarantees the Phase 7 agent's revision loop depends on:
 *   - structured prefix on `toErrorMessage()` (so the agent can grep)
 *   - structured payload on each instance (so the agent can re-target a fix)
 *   - `instanceof` discrimination — sibling subclasses are distinguishable
 *     and the shared base catches all
 */

import { describe, expect, it } from "@jest/globals";
import {
  DynamicNodeDeletedError,
  DynamicNodeError,
  DynamicNodeHeadMissingError,
  DynamicNodeOutputInvalidJsonError,
  DynamicNodeOutputShapeError,
  DynamicNodeRuntimeError,
  DynamicNodeStdoutTooLargeError,
  DynamicNodeTimeoutError,
  DynamicNodeVersionNotFoundError,
} from "./errors";

describe("DynamicNodeError hierarchy — Scenario 1 + 4: exports + Temporal-serialisable", () => {
  it("every concrete class extends the shared DynamicNodeError base + Error", () => {
    const samples: DynamicNodeError[] = [
      new DynamicNodeDeletedError("my-node"),
      new DynamicNodeVersionNotFoundError("my-node", 3),
      new DynamicNodeHeadMissingError("my-node"),
      new DynamicNodeTimeoutError("my-node", "v1", 1000),
      new DynamicNodeStdoutTooLargeError("my-node", "v1", 5_242_880, 6_000_000),
      new DynamicNodeRuntimeError("my-node", "v1", 1, "Error: boom"),
      new DynamicNodeOutputInvalidJsonError("my-node", "v1", "not json"),
      new DynamicNodeOutputShapeError("my-node", "v1", ["tables"]),
    ];
    for (const s of samples) {
      expect(s).toBeInstanceOf(DynamicNodeError);
      expect(s).toBeInstanceOf(Error);
      // Each carries a stable `name` (Temporal serialises this).
      expect(s.name.startsWith("DynamicNode")).toBe(true);
      // And a non-empty `message` (Temporal also serialises this).
      expect(s.message.length).toBeGreaterThan(0);
    }
  });
});

describe("DynamicNodeError — Scenario 2: structured payload per class", () => {
  it("DynamicNodeDeletedError carries { slug }", () => {
    const e = new DynamicNodeDeletedError("my-node");
    expect(e.slug).toBe("my-node");
  });

  it("DynamicNodeVersionNotFoundError carries { slug, version }", () => {
    const e = new DynamicNodeVersionNotFoundError("my-node", 3);
    expect(e.slug).toBe("my-node");
    expect(e.version).toBe(3);
  });

  it("DynamicNodeHeadMissingError carries { slug }", () => {
    const e = new DynamicNodeHeadMissingError("my-node");
    expect(e.slug).toBe("my-node");
  });

  it("DynamicNodeTimeoutError carries { slug, versionId, timeoutMs }", () => {
    const e = new DynamicNodeTimeoutError("my-node", "ckV1", 1000);
    expect(e.slug).toBe("my-node");
    expect(e.versionId).toBe("ckV1");
    expect(e.timeoutMs).toBe(1000);
  });

  it("DynamicNodeStdoutTooLargeError carries { slug, versionId, capBytes, actualBytes }", () => {
    const e = new DynamicNodeStdoutTooLargeError(
      "my-node",
      "ckV1",
      5_242_880,
      6_000_000,
    );
    expect(e.slug).toBe("my-node");
    expect(e.versionId).toBe("ckV1");
    expect(e.capBytes).toBe(5_242_880);
    expect(e.actualBytes).toBe(6_000_000);
  });

  it("DynamicNodeRuntimeError carries { slug, versionId, exitCode, stderrTail }", () => {
    const e = new DynamicNodeRuntimeError(
      "my-node",
      "ckV1",
      1,
      "Error: boom\n  at fn",
    );
    expect(e.slug).toBe("my-node");
    expect(e.versionId).toBe("ckV1");
    expect(e.exitCode).toBe(1);
    expect(e.stderrTail).toContain("Error: boom");
  });

  it("DynamicNodeOutputInvalidJsonError carries { slug, versionId, stdoutHead }", () => {
    const e = new DynamicNodeOutputInvalidJsonError(
      "my-node",
      "ckV1",
      "not json",
    );
    expect(e.slug).toBe("my-node");
    expect(e.versionId).toBe("ckV1");
    expect(e.stdoutHead).toBe("not json");
  });

  it("DynamicNodeOutputShapeError carries { slug, versionId, missingPorts }", () => {
    const e = new DynamicNodeOutputShapeError("my-node", "ckV1", [
      "tables",
      "fields",
    ]);
    expect(e.slug).toBe("my-node");
    expect(e.versionId).toBe("ckV1");
    expect(e.missingPorts).toEqual(["tables", "fields"]);
  });
});

describe("DynamicNodeError — Scenario 3: toErrorMessage() prefix + payload", () => {
  it("DynamicNodeDeletedError → [DynamicNodeDeletedError] slug=…", () => {
    expect(new DynamicNodeDeletedError("my-node").toErrorMessage()).toBe(
      "[DynamicNodeDeletedError] slug=my-node",
    );
  });

  it("DynamicNodeVersionNotFoundError → [DynamicNodeVersionNotFoundError] slug=… version=…", () => {
    expect(
      new DynamicNodeVersionNotFoundError("my-node", 3).toErrorMessage(),
    ).toBe("[DynamicNodeVersionNotFoundError] slug=my-node version=3");
  });

  it("DynamicNodeHeadMissingError → [DynamicNodeHeadMissingError] slug=…", () => {
    expect(new DynamicNodeHeadMissingError("my-node").toErrorMessage()).toBe(
      "[DynamicNodeHeadMissingError] slug=my-node",
    );
  });

  it("DynamicNodeTimeoutError → [DynamicNodeTimeoutError] slug=… versionId=… timeoutMs=…", () => {
    expect(
      new DynamicNodeTimeoutError("my-node", "ckV1", 1000).toErrorMessage(),
    ).toBe(
      "[DynamicNodeTimeoutError] slug=my-node versionId=ckV1 timeoutMs=1000",
    );
  });

  it("DynamicNodeStdoutTooLargeError → [DynamicNodeStdoutTooLargeError] slug=… versionId=… capBytes=… actualBytes=…", () => {
    expect(
      new DynamicNodeStdoutTooLargeError(
        "my-node",
        "ckV1",
        5_242_880,
        6_000_000,
      ).toErrorMessage(),
    ).toBe(
      "[DynamicNodeStdoutTooLargeError] slug=my-node versionId=ckV1 capBytes=5242880 actualBytes=6000000",
    );
  });

  it("DynamicNodeStdoutTooLargeError omits actualBytes when undefined", () => {
    expect(
      new DynamicNodeStdoutTooLargeError(
        "my-node",
        "ckV1",
        5_242_880,
      ).toErrorMessage(),
    ).toBe(
      "[DynamicNodeStdoutTooLargeError] slug=my-node versionId=ckV1 capBytes=5242880",
    );
  });

  it("DynamicNodeRuntimeError → [DynamicNodeRuntimeError] slug=… versionId=… exitCode=…\\n<stderrTail>", () => {
    expect(
      new DynamicNodeRuntimeError(
        "my-node",
        "ckV1",
        1,
        "Error: boom\n  at fn",
      ).toErrorMessage(),
    ).toBe(
      "[DynamicNodeRuntimeError] slug=my-node versionId=ckV1 exitCode=1\nError: boom\n  at fn",
    );
  });

  it("DynamicNodeOutputInvalidJsonError → [DynamicNodeOutputInvalidJsonError] slug=… versionId=…\\n<stdoutHead>", () => {
    expect(
      new DynamicNodeOutputInvalidJsonError(
        "my-node",
        "ckV1",
        "not json",
      ).toErrorMessage(),
    ).toBe(
      "[DynamicNodeOutputInvalidJsonError] slug=my-node versionId=ckV1\nnot json",
    );
  });

  it("DynamicNodeOutputShapeError → [DynamicNodeOutputShapeError] slug=… versionId=… missingPorts=…", () => {
    expect(
      new DynamicNodeOutputShapeError("my-node", "ckV1", [
        "tables",
        "fields",
      ]).toErrorMessage(),
    ).toBe(
      "[DynamicNodeOutputShapeError] slug=my-node versionId=ckV1 missingPorts=tables,fields",
    );
  });
});

describe("DynamicNodeError — Scenario 5: instanceof discrimination", () => {
  it("base class catches every sibling but siblings don't catch each other", () => {
    const deleted = new DynamicNodeDeletedError("my-node");
    const timeout = new DynamicNodeTimeoutError("my-node", "v1", 1000);
    const runtime = new DynamicNodeRuntimeError("my-node", "v1", 1, "boom");

    // Each instance matches its own class.
    expect(deleted).toBeInstanceOf(DynamicNodeDeletedError);
    expect(timeout).toBeInstanceOf(DynamicNodeTimeoutError);
    expect(runtime).toBeInstanceOf(DynamicNodeRuntimeError);

    // Siblings do NOT cross-match.
    expect(deleted).not.toBeInstanceOf(DynamicNodeTimeoutError);
    expect(timeout).not.toBeInstanceOf(DynamicNodeRuntimeError);
    expect(runtime).not.toBeInstanceOf(DynamicNodeDeletedError);

    // Shared base catches all.
    expect(deleted).toBeInstanceOf(DynamicNodeError);
    expect(timeout).toBeInstanceOf(DynamicNodeError);
    expect(runtime).toBeInstanceOf(DynamicNodeError);
  });
});
