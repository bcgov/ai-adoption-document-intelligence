// packages/graph-workflow/src/auto-wire/resolver.test.ts
import type { GraphWorkflowConfig, PortBinding } from "../types";
import { resolveBindings } from "./resolver";

function activity(
  id: string,
  activityType: string,
  extra: Partial<GraphWorkflowConfig["nodes"][string]> = {},
): GraphWorkflowConfig["nodes"][string] {
  return {
    id,
    type: "activity",
    activityType,
    label: id,
    ...extra,
  } as GraphWorkflowConfig["nodes"][string];
}

function makeConfig(
  nodes: Record<string, GraphWorkflowConfig["nodes"][string]>,
  edges: { source: string; target: string }[],
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "normal" as const,
    })),
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: {},
  };
}

function sortByPort(a: PortBinding, b: PortBinding): number {
  return a.port.localeCompare(b.port);
}

/**
 * Sort-normalize every node's inputs/outputs (and the node key order
 * itself) so two configs that differ only in object-key insertion order
 * (e.g. pre- vs post- Postgres jsonb round-trip) compare equal.
 */
function normalizeBindings(
  nodes: GraphWorkflowConfig["nodes"],
): Record<string, { inputs: PortBinding[]; outputs: PortBinding[] }> {
  const result: Record<string, { inputs: PortBinding[]; outputs: PortBinding[] }> =
    {};
  for (const id of Object.keys(nodes).sort()) {
    const node = nodes[id];
    result[id] = {
      inputs: [...(node.inputs ?? [])].sort(sortByPort),
      outputs: [...(node.outputs ?? [])].sort(sortByPort),
    };
  }
  return result;
}

describe("resolveBindings", () => {
  it("auto-binds a linear two-node chain end-to-end", () => {
    // file.prepare (output `preparedData`, kind Document)
    //   → azureOcr.submit (input `fileData`, kind Document)
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.A.outputs).toContainEqual({
      port: "preparedData",
      ctxKey: "__auto.A.preparedData",
    });
    expect(out.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "__auto.A.preparedData",
    });
  });

  it("name-binds Artifact identifier ports across an OCR chain", () => {
    // submit → poll → extract. The Artifact-typed identifier ports don't
    // kind-match (Artifact is the wildcard base), but each has a UNIQUE
    // same-named upstream output, so they bind by name.
    const cfg = makeConfig(
      {
        S: activity("S", "azureOcr.submit"),
        P: activity("P", "azureOcr.poll"),
        E: activity("E", "azureOcr.extract"),
      },
      [
        { source: "S", target: "P" },
        { source: "P", target: "E" },
      ],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.P.inputs).toContainEqual({
      port: "apimRequestId",
      ctxKey: "__auto.S.apimRequestId",
    });
    expect(out.nodes.E.inputs).toContainEqual({
      port: "apimRequestId",
      ctxKey: "__auto.S.apimRequestId",
    });
    expect(out.nodes.E.inputs).toContainEqual({
      port: "ocrResponse",
      ctxKey: "__auto.P.ocrResponse",
    });
  });

  it("does NOT touch ports listed in metadata.lockedInputPorts", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit", {
          inputs: [{ port: "fileData", ctxKey: "preparedData" }],
          metadata: { lockedInputPorts: ["fileData"] },
        }),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.B.inputs).toEqual([
      { port: "fileData", ctxKey: "preparedData" },
    ]);
    // Producer output binding is NOT stamped — the locked consumer didn't
    // ask for one.
    expect(out.nodes.A.outputs ?? []).toEqual([]);
  });

  it("reuses an existing output binding's ctxKey when auto-binding consumers", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare", {
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
          metadata: { lockedOutputPorts: ["preparedData"] },
        }),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.B.inputs).toContainEqual({
      port: "fileData",
      ctxKey: "myDoc",
    });
    expect(out.nodes.A.outputs).toEqual([
      { port: "preparedData", ctxKey: "myDoc" },
    ]);
  });

  it("leaves the consumer unbound when ambiguous, no producer output stamped", () => {
    const cfg = makeConfig(
      {
        X: activity("X", "file.prepare"),
        Y: activity("Y", "file.prepare"),
        Z: activity("Z", "azureOcr.submit"),
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );

    const out = resolveBindings(cfg);

    expect(
      out.nodes.Z.inputs?.find((b: { port: string }) => b.port === "fileData"),
    ).toBeUndefined();
    expect(out.nodes.X.outputs ?? []).toEqual([]);
    expect(out.nodes.Y.outputs ?? []).toEqual([]);
  });

  it("is idempotent on a stable config", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    const once = resolveBindings(cfg);
    const twice = resolveBindings(once);
    expect(twice).toEqual(once);
  });

  it("does NOT auto-stamp Artifact-kinded ports even when a compatible upstream exists", () => {
    // file.prepare has `documentId` and `blobKey` inputs. `documentId` has
    // kind "Artifact" (identifier-style, should be skipped). `blobKey` has
    // kind "Document" (typed, eligible). Supply an upstream Document producer
    // and confirm the Artifact port stays unbound while the Document port
    // gets bound normally.
    //
    // We use `azureOcr.submit` as the upstream producer (outputs `requestId`
    // of kind Reference and nothing Document-typed), so `blobKey` stays
    // unsatisfied too — meaning neither input binding should be stamped.
    // The goal: zero inputs stamped on B (no Artifact port picked up spuriously).
    const cfg = makeConfig(
      {
        A: activity("A", "azureOcr.submit"),
        B: activity("B", "file.prepare"),
      },
      [{ source: "A", target: "B" }],
    );

    const out = resolveBindings(cfg);

    // No input bindings should be auto-stamped on B — the only eligible port
    // is `blobKey: Document` but A produces no Document output. The
    // `documentId: Artifact` port must be invisible to the resolver.
    expect(out.nodes.B.inputs ?? []).toEqual([]);
    // A should carry no output bindings either.
    expect(out.nodes.A.outputs ?? []).toEqual([]);
  });

  it("keeps a producer's output binding when its node key is iterated AFTER its consumer's (jsonb key-order regression)", () => {
    // Postgres jsonb normalizes object key order (length-then-bytewise),
    // which for this OCR-ish chain produces {clean, extract, prep, submit}
    // — i.e. `extract`'s key is iterated by Object.entries() BEFORE `clean`
    // resolves its `ocrResult` input (stamping extract.outputs), but
    // `extract`'s OWN inputs get resolved later in the same pass, and that
    // later write-back must not clobber the outputs binding stamped on it
    // earlier. See resolver.ts resolveBindings() consumer loop.
    const cfg = makeConfig(
      {
        clean: activity("clean", "ocr.cleanup"),
        extract: activity("extract", "azureOcr.extract"),
        prep: activity("prep", "file.prepare"),
        submit: activity("submit", "azureOcr.submit"),
      },
      [
        { source: "prep", target: "submit" },
        { source: "submit", target: "extract" },
        { source: "extract", target: "clean" },
      ],
    );

    const out = resolveBindings(cfg);

    expect(out.nodes.extract.outputs).toContainEqual({
      port: "ocrResult",
      ctxKey: "__auto.extract.ocrResult",
    });
    expect(out.nodes.clean.inputs).toContainEqual({
      port: "ocrResult",
      ctxKey: "__auto.extract.ocrResult",
    });
  });

  it("produces order-invariant bindings regardless of node key insertion order", () => {
    const edges = [
      { source: "prep", target: "submit" },
      { source: "submit", target: "extract" },
      { source: "extract", target: "clean" },
    ];

    // jsonb-normalized order: shortest keys first, then bytewise.
    const jsonbOrder = makeConfig(
      {
        clean: activity("clean", "ocr.cleanup"),
        extract: activity("extract", "azureOcr.extract"),
        prep: activity("prep", "file.prepare"),
        submit: activity("submit", "azureOcr.submit"),
      },
      edges,
    );

    // Author/insertion order: topological.
    const insertionOrder = makeConfig(
      {
        prep: activity("prep", "file.prepare"),
        submit: activity("submit", "azureOcr.submit"),
        extract: activity("extract", "azureOcr.extract"),
        clean: activity("clean", "ocr.cleanup"),
      },
      edges,
    );

    const outJsonb = resolveBindings(jsonbOrder);
    const outInsertion = resolveBindings(insertionOrder);

    expect(normalizeBindings(outJsonb.nodes)).toEqual(
      normalizeBindings(outInsertion.nodes),
    );
  });
});
