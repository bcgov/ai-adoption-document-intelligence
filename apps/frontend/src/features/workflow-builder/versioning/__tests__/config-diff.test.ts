/**
 * Tests for the structural config diff behind the compare-to-head modal.
 *
 * The unit under test is the answer to "what changed between these two
 * versions" — so the cases are the ones a workflow author actually produces:
 * a retuned parameter, a node added, a node deleted, a step deleted from the
 * middle of a chain, an edge list that grew, and a key order that changed
 * without anything changing.
 */

import { describe, expect, it } from "vitest";
import {
  type ConfigDiffEntry,
  describeDiff,
  diffConfigs,
  summariseDiff,
} from "../config-diff";

function find(entries: ConfigDiffEntry[], path: string): ConfigDiffEntry {
  const entry = entries.find((e) => e.path === path);
  if (!entry) throw new Error(`no diff entry for ${path}`);
  return entry;
}

describe("diffConfigs", () => {
  it("reports a retuned parameter as one changed leaf, not a changed node", () => {
    const left = { nodes: { ocr: { parameters: { pages: 1, dpi: 300 } } } };
    const right = { nodes: { ocr: { parameters: { pages: 4, dpi: 300 } } } };

    const entries = diffConfigs(left, right);

    expect(find(entries, "nodes.ocr.parameters.pages")).toEqual({
      path: "nodes.ocr.parameters.pages",
      kind: "changed",
      left: "1",
      right: "4",
    });
    expect(find(entries, "nodes.ocr.parameters.dpi").kind).toBe("unchanged");
    expect(summariseDiff(entries)).toEqual({
      added: 0,
      removed: 0,
      changed: 1,
      unchanged: 1,
    });
  });

  it("expands a node that exists only in head into added leaves", () => {
    const left = { nodes: {} };
    const right = { nodes: { review: { type: "hitl", label: "Review" } } };

    const entries = diffConfigs(left, right);

    expect(find(entries, "nodes.review.type")).toEqual({
      path: "nodes.review.type",
      kind: "added",
      right: "hitl",
    });
    expect(find(entries, "nodes.review.label").kind).toBe("added");
    expect(summariseDiff(entries).added).toBe(2);
  });

  it("expands a node that exists only in the older version into removed leaves", () => {
    const left = { nodes: { legacy: { type: "activity" } } };
    const right = { nodes: {} };

    const entries = diffConfigs(left, right);

    expect(find(entries, "nodes.legacy.type")).toEqual({
      path: "nodes.legacy.type",
      kind: "removed",
      left: "activity",
    });
  });

  it("indexes list items that have no identity, so an appended one is attributable", () => {
    const left = { edges: [{ from: "a", to: "b" }] };
    const right = {
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const entries = diffConfigs(left, right);

    expect(find(entries, "edges[0].from").kind).toBe("unchanged");
    expect(find(entries, "edges[1].to")).toEqual({
      path: "edges[1].to",
      kind: "added",
      right: "c",
    });
  });

  it("is insensitive to key order — a reordered config has no differences", () => {
    const left = { metadata: { name: "A", tags: [] }, entryNodeId: "start" };
    const right = { entryNodeId: "start", metadata: { tags: [], name: "A" } };

    const entries = diffConfigs(left, right);

    expect(entries.every((e) => e.kind === "unchanged")).toBe(true);
  });

  it("keeps an empty object or array visible as a leaf", () => {
    const left = { ctx: {}, edges: [] };
    const right = { ctx: {}, edges: [] };

    const entries = diffConfigs(left, right);

    expect(find(entries, "ctx").kind).toBe("unchanged");
    expect(find(entries, "edges").left).toBe("[]");
  });

  it("reports a shape change (scalar becomes object) as a single changed leaf", () => {
    const left = { nodes: { a: { parameters: "none" } } };
    const right = { nodes: { a: { parameters: { mode: "fast" } } } };

    const entries = diffConfigs(left, right);

    const entry = find(entries, "nodes.a.parameters");
    expect(entry.kind).toBe("changed");
    expect(entry.left).toBe("none");
    expect(entry.right).toBe('{"mode":"fast"}');
  });

  it("treats null as a value rather than an absence", () => {
    const left = { description: null };
    const right = { description: "now set" };

    const entries = diffConfigs(left, right);

    expect(find(entries, "description")).toEqual({
      path: "description",
      kind: "changed",
      left: "null",
      right: "now set",
    });
  });
});

describe("list items with an identity", () => {
  const wire = (id: string, source: string, target: string) => ({
    id,
    type: "normal",
    source,
    target,
  });

  it("deleting a middle step reports only its own wires, not the ones after it", () => {
    // Upload → A → B → C → D, then B deleted: its two wires go, and C → D
    // moves up the list but is the same wire.
    const left = {
      edges: [
        wire("upload1-stepA", "upload1", "stepA"),
        wire("stepA-stepB", "stepA", "stepB"),
        wire("stepB-stepC", "stepB", "stepC"),
        wire("stepC-stepD", "stepC", "stepD"),
      ],
    };
    const right = {
      edges: [
        wire("upload1-stepA", "upload1", "stepA"),
        wire("stepC-stepD", "stepC", "stepD"),
      ],
    };

    const entries = diffConfigs(left, right);
    const differences = entries.filter((e) => e.kind !== "unchanged");

    expect(differences.every((e) => e.kind === "removed")).toBe(true);
    expect(
      [...new Set(differences.map((e) => e.path.split("].")[0]))].sort(),
    ).toEqual(["edges[id=stepA-stepB", "edges[id=stepB-stepC"]);
    expect(find(entries, "edges[id=stepB-stepC].source")).toEqual({
      path: "edges[id=stepB-stepC].source",
      kind: "removed",
      left: "stepB",
    });
    expect(find(entries, "edges[id=stepC-stepD].id").kind).toBe("unchanged");
    expect(find(entries, "edges[id=stepC-stepD].target").kind).toBe(
      "unchanged",
    );
    expect(summariseDiff(entries)).toEqual({
      added: 0,
      removed: 8,
      changed: 0,
      unchanged: 8,
    });
  });

  it("reports a wire added in head under its id", () => {
    const left = { edges: [wire("a-b", "a", "b")] };
    const right = { edges: [wire("x-a", "x", "a"), wire("a-b", "a", "b")] };

    const entries = diffConfigs(left, right);

    expect(find(entries, "edges[id=x-a].source")).toEqual({
      path: "edges[id=x-a].source",
      kind: "added",
      right: "x",
    });
    expect(find(entries, "edges[id=a-b].target").kind).toBe("unchanged");
    expect(summariseDiff(entries).added).toBe(4);
  });

  it("matches a step's input and output bindings by port", () => {
    const left = {
      nodes: {
        ocr: {
          inputs: [
            { port: "file", ctxKey: "__auto.prep.file" },
            { port: "documentId", ctxKey: "documentId" },
          ],
          outputs: [{ port: "result", ctxKey: "ocrResult" }],
        },
      },
    };
    const right = {
      nodes: {
        ocr: {
          inputs: [{ port: "documentId", ctxKey: "documentId" }],
          outputs: [{ port: "result", ctxKey: "ocrRaw" }],
        },
      },
    };

    const entries = diffConfigs(left, right);

    expect(find(entries, "nodes.ocr.inputs[port=file].ctxKey").kind).toBe(
      "removed",
    );
    expect(find(entries, "nodes.ocr.inputs[port=documentId].ctxKey").kind).toBe(
      "unchanged",
    );
    expect(find(entries, "nodes.ocr.outputs[port=result].ctxKey")).toEqual({
      path: "nodes.ocr.outputs[port=result].ctxKey",
      kind: "changed",
      left: "ocrResult",
      right: "ocrRaw",
    });
    expect(summariseDiff(entries)).toEqual({
      added: 0,
      removed: 2,
      changed: 1,
      unchanged: 3,
    });
  });

  it("finds no differences when only the order of identified items changed", () => {
    const left = { edges: [wire("a-b", "a", "b"), wire("b-c", "b", "c")] };
    const right = { edges: [wire("b-c", "b", "c"), wire("a-b", "a", "b")] };

    const entries = diffConfigs(left, right);

    expect(entries.every((e) => e.kind === "unchanged")).toBe(true);
  });

  it("falls back to position when two items share an identity", () => {
    const left = { edges: [wire("dup", "a", "b"), wire("dup", "b", "c")] };
    const right = { edges: [wire("dup", "a", "b")] };

    const entries = diffConfigs(left, right);

    expect(find(entries, "edges[0].target").kind).toBe("unchanged");
    expect(find(entries, "edges[1].target").kind).toBe("removed");
  });

  it("falls back to position when an item has no identity", () => {
    const left = { edges: [wire("a-b", "a", "b"), { source: "b" }] };
    const right = { edges: [wire("a-b", "a", "b")] };

    const entries = diffConfigs(left, right);

    expect(find(entries, "edges[0].id").kind).toBe("unchanged");
    expect(find(entries, "edges[1].source").kind).toBe("removed");
  });

  it("names a deleted step's own bindings by port", () => {
    const left = {
      nodes: {
        stepB: { inputs: [{ port: "documentId", ctxKey: "documentId" }] },
      },
    };
    const right = { nodes: {} };

    const entries = diffConfigs(left, right);

    expect(find(entries, "nodes.stepB.inputs[port=documentId].ctxKey")).toEqual(
      {
        path: "nodes.stepB.inputs[port=documentId].ctxKey",
        kind: "removed",
        left: "documentId",
      },
    );
  });

  it("names each removed item by identity when a list is emptied", () => {
    const left = { edges: [wire("a-b", "a", "b")] };
    const right = { edges: [] };

    const entries = diffConfigs(left, right);

    expect(find(entries, "edges[id=a-b].id")).toEqual({
      path: "edges[id=a-b].id",
      kind: "removed",
      left: "a-b",
    });
  });
});

describe("derived fields", () => {
  it("omits metadata.configHash, which changes on every save regardless", () => {
    const left = {
      metadata: { configHash: "aaa", description: "one" },
    };
    const right = {
      metadata: { configHash: "bbb", description: "two" },
    };

    const entries = diffConfigs(left, right);

    expect(entries.map((e) => e.path)).toEqual(["metadata.description"]);
    expect(summariseDiff(entries).changed).toBe(1);
  });
});

describe("describeDiff", () => {
  it("leads with the counts a reader needs", () => {
    const entries = diffConfigs(
      { a: 1, b: 2, c: 3 },
      { a: 9, b: 2, d: 4 }, // a changed, c removed, d added, b unchanged
    );
    expect(describeDiff(summariseDiff(entries))).toBe(
      "1 changed, 1 added, 1 removed fields of 4.",
    );
  });

  it("says so plainly when nothing differs", () => {
    const entries = diffConfigs({ a: 1 }, { a: 1 });
    expect(describeDiff(summariseDiff(entries))).toBe(
      "No differences — the two configs are identical.",
    );
  });

  it("uses the singular for a single difference", () => {
    const entries = diffConfigs({ a: 1 }, { a: 2 });
    expect(describeDiff(summariseDiff(entries))).toBe("1 changed field of 1.");
  });
});
