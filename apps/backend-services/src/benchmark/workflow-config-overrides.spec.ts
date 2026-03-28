import { describe, it, expect } from "vitest";
import type { GraphWorkflowConfig } from "../workflow/graph-workflow-types";
import {
  extractExposedParamDefaults,
  validateWorkflowConfigOverrides,
  applyWorkflowConfigOverrides,
} from "./workflow-config-overrides";

function makeWorkflowConfig(
  overrides?: Partial<Pick<GraphWorkflowConfig, "nodeGroups">>,
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "test-workflow" },
    nodes: {},
    edges: [],
    entryNodeId: "node1",
    ctx: {},
    nodeGroups: {
      groupA: {
        label: "Group A",
        nodeIds: ["node1"],
        exposedParams: [
          {
            label: "Model",
            path: "nodes.node1.parameters.model",
            type: "select",
            options: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
            default: "gpt-4o-mini",
          },
          {
            label: "Temperature",
            path: "nodes.node1.parameters.temperature",
            type: "number",
            default: 0.7,
          },
        ],
      },
      groupB: {
        label: "Group B",
        nodeIds: ["node2"],
        exposedParams: [
          {
            label: "Max Tokens",
            path: "nodes.node2.parameters.maxTokens",
            type: "number",
            default: 1024,
          },
          {
            label: "Language",
            path: "ctx.language.defaultValue",
            type: "select",
            options: ["en", "fr", "de"],
            default: "en",
          },
        ],
      },
    },
    ...overrides,
  } as unknown as GraphWorkflowConfig;
}

// ---------------------------------------------------------------------------
// extractExposedParamDefaults
// ---------------------------------------------------------------------------

describe("extractExposedParamDefaults", () => {
  it("returns a map of all exposed param paths to their defaults", () => {
    const config = makeWorkflowConfig();
    const defaults = extractExposedParamDefaults(config);

    expect(defaults).toEqual({
      "nodes.node1.parameters.model": "gpt-4o-mini",
      "nodes.node1.parameters.temperature": 0.7,
      "nodes.node2.parameters.maxTokens": 1024,
      "ctx.language.defaultValue": "en",
    });
  });

  it("returns empty object when nodeGroups is undefined", () => {
    const config = makeWorkflowConfig({ nodeGroups: undefined });
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({});
  });

  it("returns empty object when nodeGroups is empty", () => {
    const config = makeWorkflowConfig({ nodeGroups: {} });
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({});
  });

  it("skips node groups without exposedParams", () => {
    const config = makeWorkflowConfig({
      nodeGroups: {
        groupA: {
          label: "Group A",
          nodeIds: ["node1"],
        },
        groupB: {
          label: "Group B",
          nodeIds: ["node2"],
          exposedParams: [
            {
              label: "Temperature",
              path: "nodes.node2.parameters.temperature",
              type: "number",
              default: 0.5,
            },
          ],
        },
      },
    });
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({
      "nodes.node2.parameters.temperature": 0.5,
    });
  });

  it("handles params with undefined default values", () => {
    const config = makeWorkflowConfig({
      nodeGroups: {
        groupA: {
          label: "Group A",
          nodeIds: ["node1"],
          exposedParams: [
            {
              label: "No Default",
              path: "nodes.node1.parameters.noDefault",
              type: "string",
            },
          ],
        },
      },
    });
    const defaults = extractExposedParamDefaults(config);
    expect(defaults).toEqual({
      "nodes.node1.parameters.noDefault": undefined,
    });
    expect(Object.keys(defaults)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// validateWorkflowConfigOverrides
// ---------------------------------------------------------------------------

describe("validateWorkflowConfigOverrides", () => {
  it("returns empty array for valid overrides", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "gpt-4o",
      "nodes.node1.parameters.temperature": 0.9,
    });
    expect(errors).toEqual([]);
  });

  it("returns empty array for empty overrides", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {});
    expect(errors).toEqual([]);
  });

  it("rejects unknown override paths", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.unknownParam": "value",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"nodes.node1.parameters.unknownParam"');
    expect(errors[0]).toContain("not an exposed configurable parameter");
  });

  it("rejects invalid select values", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "claude-3-opus",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"claude-3-opus"');
    expect(errors[0]).toContain("nodes.node1.parameters.model");
    expect(errors[0]).toContain("gpt-4o, gpt-4o-mini, gpt-3.5-turbo");
  });

  it("accepts valid select values", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "gpt-3.5-turbo",
    });
    expect(errors).toEqual([]);
  });

  it("accepts non-select params with any value", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.temperature": 99,
    });
    expect(errors).toEqual([]);
  });

  it("returns multiple errors for multiple invalid overrides", () => {
    const config = makeWorkflowConfig();
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.unknownParam": "value",
      "nodes.node1.parameters.model": "invalid-model",
    });
    expect(errors).toHaveLength(2);
  });

  it("returns empty array when nodeGroups is undefined and overrides is empty", () => {
    const config = makeWorkflowConfig({ nodeGroups: undefined });
    const errors = validateWorkflowConfigOverrides(config, {});
    expect(errors).toEqual([]);
  });

  it("treats all paths as unknown when nodeGroups is undefined", () => {
    const config = makeWorkflowConfig({ nodeGroups: undefined });
    const errors = validateWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "gpt-4o",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("not an exposed configurable parameter");
  });
});

// ---------------------------------------------------------------------------
// applyWorkflowConfigOverrides
// ---------------------------------------------------------------------------

describe("applyWorkflowConfigOverrides", () => {
  it("applies node parameter overrides", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "gpt-4o",
    });
    expect(
      (result as unknown as Record<string, unknown>)["nodes"],
    ).toBeDefined();
    const nodes = (result as unknown as Record<string, Record<string, unknown>>)["nodes"];
    expect(
      (nodes["node1"] as Record<string, Record<string, unknown>>)["parameters"]["model"],
    ).toBe("gpt-4o");
  });

  it("applies ctx overrides", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {
      "ctx.language.defaultValue": "fr",
    });
    expect(result.ctx["language"]).toEqual({ defaultValue: "fr" });
  });

  it("applies multiple overrides", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {
      "ctx.language.defaultValue": "de",
      "nodes.node1.parameters.temperature": 0.2,
    });
    expect(result.ctx["language"]).toEqual({ defaultValue: "de" });
    const nodes = (result as unknown as Record<string, Record<string, unknown>>)["nodes"];
    expect(
      (nodes["node1"] as Record<string, Record<string, unknown>>)["parameters"]["temperature"],
    ).toBe(0.2);
  });

  it("does not mutate the original config", () => {
    const config = makeWorkflowConfig();
    const originalCtx = JSON.stringify(config.ctx);
    applyWorkflowConfigOverrides(config, {
      "ctx.language.defaultValue": "fr",
    });
    expect(JSON.stringify(config.ctx)).toBe(originalCtx);
  });

  it("returns a deep copy even with empty overrides", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {});
    expect(result).toEqual(config);
    expect(result).not.toBe(config);
    expect(result.nodeGroups).not.toBe(config.nodeGroups);
  });

  it("creates intermediate objects for deeply nested paths", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.deeply.nested.value": 42,
    });
    const nodes = (result as unknown as Record<string, Record<string, unknown>>)["nodes"];
    const params = (nodes["node1"] as Record<string, unknown>)["parameters"] as Record<string, unknown>;
    expect((params["deeply"] as Record<string, unknown>)["nested"]).toEqual({ value: 42 });
  });

  it("overwrites existing intermediate objects", () => {
    const config = makeWorkflowConfig();
    const result = applyWorkflowConfigOverrides(config, {
      "nodes.node1.parameters.model": "gpt-4o",
      "nodes.node1.parameters.temperature": 0.1,
    });
    const nodes = (result as unknown as Record<string, Record<string, unknown>>)["nodes"];
    const params = (nodes["node1"] as Record<string, Record<string, unknown>>)["parameters"];
    expect(params["model"]).toBe("gpt-4o");
    expect(params["temperature"]).toBe(0.1);
  });
});
