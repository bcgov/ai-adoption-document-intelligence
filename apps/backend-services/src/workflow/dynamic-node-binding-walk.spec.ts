/**
 * US-174 — Backend-side binding-walk integration for Phase 6 dynamic nodes.
 *
 * Exercises `validateGraphConfigWithDynamicNodes` against synthetic
 * dynamic-node lineages so kind mismatches surface with the standard
 * Phase 3 wording. Tests mock `DynamicNodeRepository` to avoid touching
 * Prisma directly — the focus is on the catalog-merge adapter, not the
 * repo itself (which has its own integration suite).
 */

import type {
  DynamicNodeSignature,
  GraphWorkflowConfig,
} from "@ai-di/graph-workflow";
import type { DynamicNodeRepository } from "@/dynamic-nodes/dynamic-node.repository";
import { validateGraphConfigWithDynamicNodes } from "./graph-schema-validator";

function sig(
  name: string,
  inputs: { name: string; kind: string }[],
  outputs: { name: string; kind: string }[],
): DynamicNodeSignature {
  return {
    name,
    description: `desc ${name}`,
    category: "Custom",
    deterministic: false,
    inputs: inputs.map((p) => ({
      name: p.name,
      kind: p.kind,
      required: false,
    })),
    outputs: outputs.map((p) => ({
      name: p.name,
      kind: p.kind,
      required: false,
    })),
    paramsSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    allowNet: [],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
  };
}

function lineageRow(
  id: string,
  slug: string,
  signature: DynamicNodeSignature,
  versionNumber = 1,
) {
  return {
    id,
    slug,
    deletedAt: null,
    headVersion: {
      versionNumber,
      signature,
    },
    _count: { versions: versionNumber },
  };
}

function makeMockRepository(
  lineages: Array<ReturnType<typeof lineageRow>>,
  versionsBySlug: Map<string, Map<number, DynamicNodeSignature>> = new Map(),
): DynamicNodeRepository {
  return {
    listForGroup: jest.fn().mockResolvedValue(lineages),
    findVersionByNumber: jest.fn(
      async (lineageId: string, versionNumber: number) => {
        const lineage = lineages.find((l) => l.id === lineageId);
        if (!lineage) return null;
        const versions = versionsBySlug.get(lineage.slug);
        if (!versions) return null;
        const signature = versions.get(versionNumber);
        if (!signature) return null;
        return { versionNumber, signature };
      },
    ),
  } as unknown as DynamicNodeRepository;
}

describe("validateGraphConfigWithDynamicNodes (US-174)", () => {
  it("Scenario 2 — dynamic→dynamic kind mismatch surfaces standard wording", async () => {
    const upper = sig(
      "uppercase-doc",
      [{ name: "document", kind: "Document" }],
      [{ name: "docOut", kind: "Document" }],
    );
    const classify = sig(
      "classify-segment",
      [{ name: "segment", kind: "Segment" }],
      [{ name: "classification", kind: "Classification" }],
    );
    const repo = makeMockRepository([
      lineageRow("dn-upper", "uppercase-doc", upper),
      lineageRow("dn-classify", "classify-segment", classify),
    ]);

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "dyn→dyn mismatch" },
      entryNodeId: "uppercase1",
      ctx: { docOut: { type: "object" } },
      nodes: {
        uppercase1: {
          id: "uppercase1",
          type: "activity",
          label: "uppercase",
          activityType: "dyn.uppercase-doc",
          outputs: [{ port: "docOut", ctxKey: "docOut" }],
        },
        classify1: {
          id: "classify1",
          type: "activity",
          label: "classify",
          activityType: "dyn.classify-segment",
          inputs: [{ port: "segment", ctxKey: "docOut" }],
        },
      },
      edges: [
        { id: "e1", source: "uppercase1", target: "classify1", type: "normal" },
      ],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    const mismatches = result.errors.filter((e) =>
      e.message.includes("not assignable"),
    );
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].message).toBe(
      "Input port `segment` (Segment) on node `classify1` reads from ctx key `docOut`, written by node `uppercase1` (Document) — Document not assignable to Segment",
    );
  });

  it("Scenario 3 — static→dynamic mismatch surfaces standard wording", async () => {
    // Use the real static catalog entry for document.split (outputs Segment[])
    // feeding a dynamic node expecting Document.
    const dynConsumer = sig(
      "process-segments",
      [{ name: "doc", kind: "Document" }],
      [{ name: "result", kind: "Artifact" }],
    );
    const repo = makeMockRepository([
      lineageRow("dn-proc", "process-segments", dynConsumer),
    ]);

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "static→dyn mismatch" },
      entryNodeId: "split1",
      ctx: { segments: { type: "object" } },
      nodes: {
        split1: {
          id: "split1",
          type: "activity",
          label: "split",
          activityType: "document.split",
          parameters: {
            pageRangesParameter: "page_ranges",
          },
          outputs: [{ port: "segments", ctxKey: "segments" }],
        },
        proc1: {
          id: "proc1",
          type: "activity",
          label: "process",
          activityType: "dyn.process-segments",
          inputs: [{ port: "doc", ctxKey: "segments" }],
        },
      },
      edges: [{ id: "e1", source: "split1", target: "proc1", type: "normal" }],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    const mismatches = result.errors.filter((e) =>
      e.message.includes("not assignable"),
    );
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches[0].path).toBe("nodes.proc1.inputs.doc");
    expect(mismatches[0].message).toContain("not assignable");
  });

  it("Scenario 3 — dynamic→static mismatch surfaces standard wording", async () => {
    // Dynamic producer outputs Document; static consumer expects Segment.
    const dynProducer = sig(
      "make-doc",
      [],
      [{ name: "out", kind: "Document" }],
    );
    const repo = makeMockRepository([
      lineageRow("dn-make", "make-doc", dynProducer),
    ]);

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "dyn→static mismatch" },
      entryNodeId: "make1",
      ctx: { seg: { type: "object" } },
      nodes: {
        make1: {
          id: "make1",
          type: "activity",
          label: "make",
          activityType: "dyn.make-doc",
          outputs: [{ port: "out", ctxKey: "seg" }],
        },
        seg1: {
          id: "seg1",
          type: "activity",
          label: "segment",
          // document.classify expects a Segment input port.
          activityType: "document.classify",
          parameters: {
            rules: [],
            unmatchedAction: "ignore",
          },
          inputs: [{ port: "segment", ctxKey: "seg" }],
        },
      },
      edges: [{ id: "e1", source: "make1", target: "seg1", type: "normal" }],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    const mismatches = result.errors.filter((e) =>
      e.message.includes("not assignable"),
    );
    expect(mismatches.length).toBeGreaterThanOrEqual(1);
    const target = mismatches.find(
      (m) => m.path === "nodes.seg1.inputs.segment",
    );
    expect(target).toBeDefined();
    expect(target?.message).toContain("Document not assignable to Segment");
  });

  it("Scenario 4 — version pin uses the pinned signature, not head", async () => {
    // v3 declares Segment in/out; head (v5) declares Document in/out.
    // The consumer's port expects Segment — validation MUST pass.
    const v3 = sig(
      "my-node",
      [{ name: "in", kind: "Segment" }],
      [{ name: "out", kind: "Segment" }],
    );
    const v5 = sig(
      "my-node",
      [{ name: "in", kind: "Document" }],
      [{ name: "out", kind: "Document" }],
    );

    const versionsBySlug = new Map<string, Map<number, DynamicNodeSignature>>([
      ["my-node", new Map<number, DynamicNodeSignature>([[3, v3]])],
    ]);
    const repo = makeMockRepository(
      [lineageRow("dn-mine", "my-node", v5, 5)],
      versionsBySlug,
    );

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "version pin" },
      entryNodeId: "n1",
      ctx: { seg: { type: "object" } },
      nodes: {
        n1: {
          id: "n1",
          type: "activity",
          label: "pinned-producer",
          activityType: "dyn.my-node",
          dynamicNodeVersion: 3,
          outputs: [{ port: "out", ctxKey: "seg" }],
        },
        n2: {
          id: "n2",
          type: "activity",
          label: "consumer",
          activityType: "dyn.my-node",
          dynamicNodeVersion: 3,
          inputs: [{ port: "in", ctxKey: "seg" }],
        },
      },
      edges: [{ id: "e1", source: "n1", target: "n2", type: "normal" }],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    const mismatches = result.errors.filter((e) =>
      e.message.includes("not assignable"),
    );
    expect(mismatches).toHaveLength(0);
  });

  it("Scenario 5 — soft-deleted lineage emits the deletion error", async () => {
    // No lineage with slug "deleted-node" in the loaded list.
    const repo = makeMockRepository([]);

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "soft-deleted ref" },
      entryNodeId: "n1",
      ctx: {},
      nodes: {
        n1: {
          id: "n1",
          type: "activity",
          label: "uses deleted",
          activityType: "dyn.deleted-node",
        },
      },
      edges: [],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    const deletionErrors = result.errors.filter((e) =>
      e.message.includes("Workflow references deleted dynamic node"),
    );
    expect(deletionErrors).toHaveLength(1);
    expect(deletionErrors[0].message).toBe(
      "Workflow references deleted dynamic node 'dyn.deleted-node'",
    );
    expect(deletionErrors[0].path).toBe("nodes.n1.activityType");
  });

  it("happy path — dyn→dyn with compatible kinds emits no errors", async () => {
    const producer = sig(
      "produce-doc",
      [],
      [{ name: "out", kind: "Document" }],
    );
    const consumer = sig("consume-doc", [{ name: "in", kind: "Document" }], []);
    const repo = makeMockRepository([
      lineageRow("dn-prod", "produce-doc", producer),
      lineageRow("dn-cons", "consume-doc", consumer),
    ]);

    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "happy path" },
      entryNodeId: "p1",
      ctx: { theDoc: { type: "object" } },
      nodes: {
        p1: {
          id: "p1",
          type: "activity",
          label: "p1",
          activityType: "dyn.produce-doc",
          outputs: [{ port: "out", ctxKey: "theDoc" }],
        },
        c1: {
          id: "c1",
          type: "activity",
          label: "c1",
          activityType: "dyn.consume-doc",
          inputs: [{ port: "in", ctxKey: "theDoc" }],
        },
      },
      edges: [{ id: "e1", source: "p1", target: "c1", type: "normal" }],
    };

    const result = await validateGraphConfigWithDynamicNodes(
      config,
      "g-1",
      repo,
    );
    expect(result.valid).toBe(true);
    const errors = result.errors.filter((e) => e.severity === "error");
    expect(errors).toHaveLength(0);
  });
});
