/**
 * Tests for G-065 — what the `Input` checkbox does to the public run contract.
 *
 * These mirror the precedence in
 * `apps/backend-services/src/workflow/derive-input-schema.ts`. If that file's
 * order changes, these fail — which is the point: the drawer must not describe
 * a contract the backend does not publish.
 */
import { describe, expect, it } from "vitest";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { ctxRunContract, describeRunContract } from "./ctx-run-contract";

function config(overrides: Partial<GraphWorkflowConfig> = {}) {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    entryNodeId: "n1",
    nodes: {
      n1: {
        id: "n1",
        type: "activity",
        label: "Noop",
        activityType: "file.prepare",
      },
    },
    edges: [],
    ctx: {},
    ...overrides,
  } as GraphWorkflowConfig;
}

const flagged: CtxDeclaration = { type: "string", isInput: true };

describe("ctxRunContract", () => {
  it("is internal when the flag is not set", () => {
    expect(ctxRunContract(config(), { type: "string" })).toEqual({
      status: "internal",
    });
  });

  it("is required when flagged with no default", () => {
    expect(ctxRunContract(config(), flagged)).toEqual({ status: "required" });
  });

  it("is optional when a default fills the gap", () => {
    expect(ctxRunContract(config(), { ...flagged, defaultValue: "x" })).toEqual(
      { status: "optional" },
    );
  });

  it("is inert when a source.api node supplies the inputs", () => {
    const cfg = config({
      nodes: {
        api: {
          id: "api",
          type: "source",
          label: "API",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
      },
    });
    expect(ctxRunContract(cfg, flagged)).toEqual({
      status: "ignored",
      reason: "source-api",
    });
  });

  it("is inert for a library workflow", () => {
    const cfg = config({ metadata: { name: "t", kind: "library" } });
    expect(ctxRunContract(cfg, flagged)).toEqual({
      status: "ignored",
      reason: "library",
    });
  });

  it("gives source.api precedence over the library kind, as the backend does", () => {
    const cfg = config({
      metadata: { name: "t", kind: "library" },
      nodes: {
        api: {
          id: "api",
          type: "source",
          label: "API",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
      },
    });
    expect(ctxRunContract(cfg, flagged)).toEqual({
      status: "ignored",
      reason: "source-api",
    });
  });

  it("says nothing about an unflagged key even under a source.api node", () => {
    const cfg = config({
      nodes: {
        api: {
          id: "api",
          type: "source",
          label: "API",
          sourceType: "source.api",
          parameters: { fields: [] },
        },
      },
    });
    expect(ctxRunContract(cfg, { type: "string" })).toEqual({
      status: "internal",
    });
  });
});

describe("describeRunContract", () => {
  it("stays silent for an internal variable", () => {
    expect(describeRunContract({ status: "internal" })).toBeNull();
  });

  it("says callers MUST send a required one", () => {
    expect(describeRunContract({ status: "required" })).toMatch(/must send/);
  });

  it("distinguishes the two inert reasons", () => {
    expect(
      describeRunContract({ status: "ignored", reason: "source-api" }),
    ).toMatch(/API source node/);
    expect(
      describeRunContract({ status: "ignored", reason: "library" }),
    ).toMatch(/library/);
  });
});
