/**
 * An output binding names a port its step returns.
 *
 * The engine copies `result[binding.port]` into the binding's variable, so a
 * port the step does not return writes an empty value, and the next step
 * reads nothing. The validator warns about it rather than blocking runs.
 */
import type {
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  ValidateGraphConfigOptions,
} from "../index";
import { validateGraphConfig } from "../index";

const OPTIONS: ValidateGraphConfigOptions = {
  isRegisteredActivityType: () => true,
  validateActivityParameters: () => {},
};

function workflowWith(node: GraphNode): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "output ports" },
    ctx: { ocrResultRef: { type: "object" }, cleaned: { type: "object" } },
    nodes: { [node.id]: node },
    edges: [],
    entryNodeId: node.id,
  };
}

function outputPortWarnings(
  config: GraphWorkflowConfig,
): GraphValidationError[] {
  return validateGraphConfig(config, OPTIONS).errors.filter((e) =>
    e.path.includes(".outputs."),
  );
}

describe("validator — output bindings name a port the step returns", () => {
  it("warns about a port the step does not return, without blocking runs", () => {
    const config = workflowWith({
      id: "normalize",
      type: "activity",
      label: "Normalize Fields",
      activityType: "ocr.normalizeFields",
      inputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
      outputs: [{ port: "result", ctxKey: "cleaned" }],
    } as GraphNode);

    expect(outputPortWarnings(config)).toEqual([
      {
        path: "nodes.normalize.outputs.result",
        message:
          "Output `result` on node `normalize` is not something `ocr.normalizeFields` returns, so `cleaned` will be empty",
        severity: "warning",
      },
    ]);
    expect(validateGraphConfig(config, OPTIONS).valid).toBe(true);
  });

  it("stays silent when every output is a port the step returns", () => {
    const config = workflowWith({
      id: "normalize",
      type: "activity",
      label: "Normalize Fields",
      activityType: "ocr.normalizeFields",
      inputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
      outputs: [{ port: "ocrResult", ctxKey: "cleaned" }],
    } as GraphNode);

    expect(outputPortWarnings(config)).toEqual([]);
  });

  it("skips a step with no catalog entry to check against", () => {
    const config = workflowWith({
      id: "unknown",
      type: "activity",
      label: "Unknown",
      activityType: "custom.unknownStep",
      outputs: [{ port: "anything", ctxKey: "cleaned" }],
    } as GraphNode);

    expect(outputPortWarnings(config)).toEqual([]);
  });

  it("checks the step a wait-and-retry node runs", () => {
    const config = workflowWith({
      id: "poll",
      type: "pollUntil",
      label: "Wait for OCR Result",
      activityType: "azureOcr.poll",
      condition: {
        operator: "not-equals",
        left: { ref: "cleaned.status" },
        right: { literal: "running" },
      },
      interval: "10s",
      outputs: [{ port: "ocrResult", ctxKey: "cleaned" }],
    } as unknown as GraphNode);

    expect(outputPortWarnings(config)).toEqual([
      expect.objectContaining({
        path: "nodes.poll.outputs.ocrResult",
        severity: "warning",
      }),
    ]);
  });
});
