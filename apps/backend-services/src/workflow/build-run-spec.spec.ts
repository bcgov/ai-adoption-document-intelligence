import type { Request } from "express";
import { z } from "zod/v4";
import {
  buildRunSpec,
  buildTriggerUrl,
  buildUploadSpec,
} from "./build-run-spec";
import type {
  GraphWorkflowConfig,
  SourceCatalogEntry,
  SourceNode,
} from "./graph-workflow-types";

const baseConfig: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: {},
  entryNodeId: "noop",
  ctx: {},
  nodes: {
    noop: {
      id: "noop",
      type: "activity",
      label: "Noop",
      activityType: "noop.activity",
    },
  },
  edges: [],
};

describe("buildTriggerUrl", () => {
  const mockReq = (
    headers: Record<string, string | string[] | undefined>,
    protocol: string,
  ): Request =>
    ({
      headers,
      protocol,
    }) as unknown as Request;

  it("uses X-Forwarded-Proto + Host when both are set", () => {
    const url = buildTriggerUrl(
      mockReq(
        {
          "x-forwarded-proto": "https",
          host: "api.example.com",
        },
        "http",
      ),
      "wf-abc",
    );
    expect(url).toBe("https://api.example.com/api/workflows/wf-abc/runs");
  });

  it("falls back to req.protocol when X-Forwarded-Proto is missing", () => {
    const url = buildTriggerUrl(
      mockReq({ host: "api.example.com" }, "http"),
      "wf-abc",
    );
    expect(url).toBe("http://api.example.com/api/workflows/wf-abc/runs");
  });

  it("uses the local fallback when host header is missing", () => {
    const url = buildTriggerUrl(mockReq({}, "http"), "wf-abc");
    expect(url).toBe("http://localhost:3002/api/workflows/wf-abc/runs");
  });

  it("handles an array X-Forwarded-Proto header by taking the first value", () => {
    const url = buildTriggerUrl(
      mockReq(
        {
          "x-forwarded-proto": ["https", "http"],
          host: "api.example.com",
        },
        "http",
      ),
      "wf-abc",
    );
    expect(url).toBe("https://api.example.com/api/workflows/wf-abc/runs");
  });
});

describe("buildRunSpec", () => {
  it("assembles a full spec from a library workflow config", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      metadata: {
        kind: "library",
        inputs: [{ label: "Foo", path: "foo", type: "string" }],
      },
    };
    const url = "http://localhost:3002/api/workflows/wf-abc/runs";

    const spec = buildRunSpec(config, url);

    expect(spec.triggerUrl).toBe(url);
    expect(spec.inputSchema.required).toEqual(["foo"]);
    expect(spec.inputSchema.properties.foo).toEqual({
      type: "string",
      title: "Foo",
    });
    expect(spec.authNotes).toMatch(/x-api-key/);
    expect(spec.sampleCurl).toContain(url);
    expect(spec.sampleCurl).toContain("x-api-key");
    expect(spec.sampleCurl).toContain('{"foo":""}');
  });

  it("emits an empty-body curl when the workflow has no inputs", () => {
    const url = "http://localhost:3002/api/workflows/wf-empty/runs";

    const spec = buildRunSpec(baseConfig, url);

    expect(spec.inputSchema.properties).toEqual({});
    expect(spec.inputSchema.required).toEqual([]);
    expect(spec.sampleCurl).toContain("{}");
  });

  it("uses defaultValue in the stub body when present", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      ctx: {
        count: { type: "number", isInput: true, defaultValue: 5 },
        customerId: { type: "string", isInput: true },
      },
    };
    const url = "http://localhost:3002/api/workflows/wf-mixed/runs";

    const spec = buildRunSpec(config, url);

    expect(spec.sampleCurl).toMatch(/"count":5/);
    expect(spec.sampleCurl).toMatch(/"customerId":""/);
  });
});

// ---------------------------------------------------------------------------
// US-112 — buildUploadSpec (source.upload extension of /run-spec)
// ---------------------------------------------------------------------------
describe("buildUploadSpec", () => {
  /**
   * Synthetic `source.upload` catalog entry. The real entry is
   * registered by US-116; until then tests inject this fake via the
   * `getSourceCatalogEntry` option (mirrors the validator and US-111's
   * injection patterns). The Zod schema applies the documented
   * DOCUMENT_SOURCES_DESIGN.md §3.2 defaults via `.default(...)`.
   */
  const sourceUploadParametersSchema = z.object({
    allowedMimeTypes: z
      .array(z.string())
      .default(["application/pdf", "image/*"]),
    maxFileSizeMB: z.number().default(50),
    ctxKey: z.string().default("documentUrl"),
  });

  const fakeSourceUploadEntry: SourceCatalogEntry = {
    type: "source.upload",
    category: "source",
    displayName: "File upload (test)",
    description: "Synthetic source.upload entry used in unit tests",
    parametersSchema: sourceUploadParametersSchema,
    runtime: "manual",
    outputKind: "Document",
    deriveOutputSchema: (parameters) => {
      const ctxKey =
        typeof parameters?.ctxKey === "string"
          ? parameters.ctxKey
          : "documentUrl";
      return {
        type: "object",
        properties: { [ctxKey]: { type: "string", format: "uri" } },
        required: [ctxKey],
      };
    },
  };

  const synthLookup = (sourceType: string) =>
    sourceType === "source.upload" ? fakeSourceUploadEntry : undefined;

  const sourceUploadNode = (
    parameters: Record<string, unknown>,
    id = "src-upload-1",
  ): SourceNode => ({
    id,
    type: "source",
    label: "Upload source",
    sourceType: "source.upload",
    parameters,
  });

  const baseUrl = "http://localhost:3002";

  it("Scenario 2: returns undefined when no source.upload node exists", () => {
    const spec = buildUploadSpec(baseConfig, "wf-1", baseUrl, {
      getSourceCatalogEntry: synthLookup,
    });
    expect(spec).toBeUndefined();
  });

  it("Scenario 1: surfaces explicit parameters verbatim", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      nodes: {
        ...baseConfig.nodes,
        upload: sourceUploadNode(
          {
            ctxKey: "myFile",
            allowedMimeTypes: ["application/pdf"],
            maxFileSizeMB: 25,
          },
          "upload",
        ),
      },
    };

    const spec = buildUploadSpec(config, "wf-1", baseUrl, {
      getSourceCatalogEntry: synthLookup,
    });

    expect(spec).toEqual({
      sourceNodeId: "upload",
      uploadUrl:
        "http://localhost:3002/api/workflows/wf-1/sources/upload/upload",
      allowedMimeTypes: ["application/pdf"],
      maxFileSizeMB: 25,
      ctxKey: "myFile",
    });
  });

  it("Scenario 1 (defaults): fills in defaults from parametersSchema when parameters are absent", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      nodes: {
        ...baseConfig.nodes,
        upload: sourceUploadNode({}, "upload"),
      },
    };

    const spec = buildUploadSpec(config, "wf-1", baseUrl, {
      getSourceCatalogEntry: synthLookup,
    });

    expect(spec).toEqual({
      sourceNodeId: "upload",
      uploadUrl:
        "http://localhost:3002/api/workflows/wf-1/sources/upload/upload",
      allowedMimeTypes: ["application/pdf", "image/*"],
      maxFileSizeMB: 50,
      ctxKey: "documentUrl",
    });
  });

  it("fills in defaults when the source node has no parameters object at all", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      nodes: {
        ...baseConfig.nodes,
        upload: {
          id: "upload",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
        },
      },
    };

    const spec = buildUploadSpec(config, "wf-1", baseUrl, {
      getSourceCatalogEntry: synthLookup,
    });

    expect(spec?.allowedMimeTypes).toEqual(["application/pdf", "image/*"]);
    expect(spec?.maxFileSizeMB).toBe(50);
    expect(spec?.ctxKey).toBe("documentUrl");
  });

  it("returns undefined when the catalog lookup yields nothing for source.upload", () => {
    const config: GraphWorkflowConfig = {
      ...baseConfig,
      nodes: {
        ...baseConfig.nodes,
        upload: sourceUploadNode({}, "upload"),
      },
    };

    const spec = buildUploadSpec(config, "wf-1", baseUrl, {
      getSourceCatalogEntry: () => undefined,
    });

    expect(spec).toBeUndefined();
  });
});
