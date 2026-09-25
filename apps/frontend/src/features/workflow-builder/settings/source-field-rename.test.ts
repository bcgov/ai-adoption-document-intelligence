/**
 * Tests for G-040 — renaming a `source.api` field carries its consumers.
 */
import type { FieldDescriptor } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig, SourceNode } from "../../../types/workflow";
import {
  applySourceFieldRenames,
  diffFieldNames,
  readFields,
} from "./source-field-rename";

function field(name: string): FieldDescriptor {
  return { name, type: "string", required: false };
}

/** `api` declares `customerId`; `B` reads it on its `docId` input. */
function configWithConsumer(fieldName: string): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    entryNodeId: "api",
    nodes: {
      api: {
        id: "api",
        type: "source",
        label: "API",
        sourceType: "source.api",
        parameters: { fields: [field(fieldName)] },
      },
      B: {
        id: "B",
        type: "activity",
        label: "Fetch",
        activityType: "file.prepare",
        inputs: [{ port: "docId", ctxKey: "customerId" }],
      },
    },
    edges: [],
    ctx: {},
  };
}

describe("diffFieldNames", () => {
  it("reports a same-position name change", () => {
    expect(diffFieldNames([field("a")], [field("b")])).toEqual([
      { from: "a", to: "b" },
    ]);
  });

  it("reports nothing when names are unchanged", () => {
    expect(diffFieldNames([field("a")], [field("a")])).toEqual([]);
  });

  it("infers no rename across an add — a shifted row is not a renamed one", () => {
    expect(diffFieldNames([field("a")], [field("z"), field("a")])).toEqual([]);
  });

  it("infers no rename across a remove", () => {
    expect(diffFieldNames([field("a"), field("b")], [field("b")])).toEqual([]);
  });

  it("treats an empty name as unfinished, not renamed", () => {
    expect(diffFieldNames([field("a")], [field("")])).toEqual([]);
    expect(diffFieldNames([field("")], [field("a")])).toEqual([]);
  });

  it("reports several renames in one diff", () => {
    expect(
      diffFieldNames([field("a"), field("b")], [field("x"), field("y")]),
    ).toEqual([
      { from: "a", to: "x" },
      { from: "b", to: "y" },
    ]);
  });
});

describe("readFields", () => {
  it("tolerates a node with no fields configured", () => {
    expect(readFields(undefined)).toEqual([]);
    expect(readFields({})).toEqual([]);
    expect(readFields({ fields: null })).toEqual([]);
  });
});

describe("applySourceFieldRenames", () => {
  it("rewrites a consumer that read the old field name", () => {
    // The config already carries the NEW name, as it does in the real flow.
    const next = applySourceFieldRenames(
      configWithConsumer("clientId"),
      [field("customerId")],
      [field("clientId")],
    );
    expect(next.nodes.B.inputs?.[0].ctxKey).toBe("clientId");
  });

  it("leaves the source node's own field alone (it is already renamed)", () => {
    const next = applySourceFieldRenames(
      configWithConsumer("clientId"),
      [field("customerId")],
      [field("clientId")],
    );
    const api = next.nodes.api as SourceNode;
    expect(readFields(api.parameters)[0].name).toBe("clientId");
  });

  it("returns the same reference when nothing was renamed", () => {
    const cfg = configWithConsumer("customerId");
    expect(applySourceFieldRenames(cfg, [field("a")], [field("a")])).toBe(cfg);
  });
});
