import type { Request } from "express";
import { buildRunSpec, buildTriggerUrl } from "./build-run-spec";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

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
