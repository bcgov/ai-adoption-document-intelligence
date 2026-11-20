/**
 * Tests for the Phase 8 `SourceNode` variant (US-106).
 *
 * This story is types-only — the source catalog scaffold (US-108) is the
 * first runtime artifact in Phase 8. The assertions below are
 * compile-time smoke checks expressed as runtime code so Jest registers
 * the file: each `expect` is incidental; the load-bearing checks are the
 * explicit type annotations on the constants, which would fail
 * `tsc --noEmit` (and therefore `jest`'s `ts-jest` transform) if the
 * `SourceNode` interface or the `GraphNode` discriminated-union extension
 * regressed.
 *
 * See DOCUMENT_SOURCES_DESIGN.md §1 for the locked schema.
 */

import type { GraphNode, NodeType, SourceNode } from "./types";

describe("SourceNode — discriminated union membership (US-106)", () => {
  it("type-checks as a SourceNode and as a GraphNode", () => {
    const sourceApi: SourceNode = {
      id: "src-1",
      type: "source",
      label: "API endpoint",
      sourceType: "source.api",
      parameters: { fields: [] },
    };

    const sourceUpload: SourceNode = {
      id: "src-2",
      type: "source",
      label: "File upload",
      sourceType: "source.upload",
      // parameters is optional — exercise the absent path too
    };

    const asGraphNodeApi: GraphNode = sourceApi;
    const asGraphNodeUpload: GraphNode = sourceUpload;

    expect(asGraphNodeApi.type).toBe("source");
    expect(asGraphNodeUpload.type).toBe("source");
  });

  it("narrows to SourceNode when discriminating on type === 'source'", () => {
    const node: GraphNode = {
      id: "src-3",
      type: "source",
      label: "API endpoint",
      sourceType: "source.api",
    };

    if (node.type === "source") {
      // Inside this branch, TS narrows `node` to `SourceNode`; accessing
      // `sourceType` would not compile if the discriminator wasn't wired
      // through the `GraphNode` union.
      const narrowed: SourceNode = node;
      expect(narrowed.sourceType).toBe("source.api");
    } else {
      throw new Error("expected node.type to narrow to 'source'");
    }
  });

  it("includes 'source' in the NodeType union", () => {
    const variant: NodeType = "source";
    expect(variant).toBe("source");
  });
});
