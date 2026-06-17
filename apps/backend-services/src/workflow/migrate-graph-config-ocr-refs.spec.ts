import type { GraphWorkflowConfig } from "./graph-workflow-types";
import {
  findLegacyOcrIdentifiers,
  migrateExtractToBase64Bindings,
  migrateGraphConfigToOcrRefs,
  renameBase64ExtractCtxKey,
} from "./migrate-graph-config-ocr-refs";

describe("migrateGraphConfigToOcrRefs", () => {
  it("renames ctx keys and bindings idempotently", () => {
    const config = {
      schemaVersion: "1.0",
      metadata: { name: "t", description: "", tags: [] },
      entryNodeId: "poll",
      ctx: {
        ocrResponse: { type: "object" },
        ocrResult: { type: "object" },
      },
      nodes: {
        poll: {
          id: "poll",
          type: "pollUntil",
          activityType: "azureOcr.poll",
          outputs: [{ port: "response", ctxKey: "ocrResponse" }],
          condition: {
            operator: "not-equals",
            left: { ref: "ctx.ocrResponse.status" },
            right: { literal: "running" },
          },
        },
      },
      edges: [],
    } as unknown as GraphWorkflowConfig;

    const once = migrateGraphConfigToOcrRefs(config);
    expect(once.ctx.ocrResponseRef).toBeDefined();
    expect(once.ctx.ocrResultRef).toBeDefined();
    expect(findLegacyOcrIdentifiers(once)).toHaveLength(0);

    const twice = migrateGraphConfigToOcrRefs(once);
    expect(twice.ctx.ocrResponseRefRef).toBeUndefined();
    expect(findLegacyOcrIdentifiers(twice)).toHaveLength(0);
  });

  it("renames extractToBase64 base64 port bindings to pageBlobPath", () => {
    expect(renameBase64ExtractCtxKey("section2Base64")).toBe(
      "section2PageBlobPath",
    );

    const config = {
      schemaVersion: "1.0",
      metadata: { name: "t", description: "" },
      entryNodeId: "extract",
      ctx: {
        section2Base64: { type: "string" },
      },
      nodes: {
        extract: {
          id: "extract",
          type: "activity",
          activityType: "document.extractToBase64",
          label: "Extract",
          outputs: [
            { port: "base64", ctxKey: "section2Base64" },
            { port: "pageCount", ctxKey: "section2PageCount" },
          ],
        },
      },
      edges: [],
    } as unknown as GraphWorkflowConfig;

    const migrated = migrateExtractToBase64Bindings(config);
    const node = migrated.nodes.extract as {
      inputs?: Array<{ port: string; ctxKey: string }>;
      outputs?: Array<{ port: string; ctxKey: string }>;
    };
    expect(migrated.ctx.section2PageBlobPath).toBeDefined();
    expect(migrated.ctx.section2Base64).toBeUndefined();
    expect(node.outputs?.[0]).toEqual({
      port: "pageBlobPath",
      ctxKey: "section2PageBlobPath",
    });
    expect(node.inputs).toEqual(
      expect.arrayContaining([
        { port: "groupId", ctxKey: "groupId" },
        { port: "documentId", ctxKey: "documentId" },
      ]),
    );
  });
});
