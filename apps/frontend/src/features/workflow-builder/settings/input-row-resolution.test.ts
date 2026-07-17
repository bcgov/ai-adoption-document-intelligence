/**
 * Tests for `resolveWireableInputRows` — the shared wireable-input row
 * resolver consumed by InputsSection + ConnectSummaryPopover.
 *
 * Focus: a freshly-dropped activity node must NOT carry a placeholder input
 * binding (`ctxKey = portName`). With no such binding, an unsatisfied typed
 * input honestly reports "unsatisfied" (needs a source) rather than the
 * misleading "ctx-bound" ("from <portname>") state that a placeholder binding
 * would have forced. When a compatible upstream producer exists, the same
 * port resolves "auto-bound".
 */
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { resolveWireableInputRows } from "./input-row-resolution";

/**
 * A single `azureOcr.submit` node shaped exactly as the de-placeholdered
 * drop path now produces it: empty `inputs`/`outputs`, no ctx declarations
 * named after ports.
 */
function configWithLoneSubmit(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "lone-submit" },
    ctx: {},
    nodes: {
      submit_1: {
        id: "submit_1",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        inputs: [],
        outputs: [],
        parameters: {},
      },
    },
    edges: [],
    entryNodeId: "submit_1",
  };
}

/**
 * `file.prepare` → `azureOcr.submit`, connected by a normal edge, both with
 * the new empty-binding drop shape. `file.prepare` produces
 * `preparedData: Document`, which is the compatible producer for
 * `azureOcr.submit.fileData: Document`.
 */
function configWithUpstreamPrepare(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "prepare-then-submit" },
    ctx: {},
    nodes: {
      prep_1: {
        id: "prep_1",
        type: "activity",
        label: "Prepare File",
        activityType: "file.prepare",
        inputs: [],
        outputs: [],
        parameters: {},
      },
      submit_1: {
        id: "submit_1",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        inputs: [],
        outputs: [],
        parameters: {},
      },
    },
    edges: [{ id: "e1", source: "prep_1", target: "submit_1", type: "normal" }],
    entryNodeId: "prep_1",
  };
}

describe("resolveWireableInputRows — de-placeholdered drop", () => {
  it("reports a lone submit node's fileData input as unsatisfied (not ctx-bound)", () => {
    const config = configWithLoneSubmit();
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData).toBeDefined();
    expect(fileData?.resolution.status).toBe("unsatisfied");
  });

  it("auto-binds fileData when a compatible upstream Document producer exists", () => {
    const config = configWithUpstreamPrepare();
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData).toBeDefined();
    expect(fileData?.resolution.status).toBe("auto-bound");
    if (fileData?.resolution.status === "auto-bound") {
      expect(fileData.resolution.producerNodeId).toBe("prep_1");
      expect(fileData.resolution.producerPort).toBe("preparedData");
    }
  });

  it("regression: a placeholder input binding (ctxKey=portName) would force the misleading ctx-bound state", () => {
    // This documents WHY the drop path must not stamp `ctxKey = portName`:
    // with such a binding + a matching ctx declaration, the honest
    // "unsatisfied" collapses into "ctx-bound" ("from fileData").
    const config = configWithLoneSubmit();
    config.ctx = { fileData: { type: "string" } };
    const submit = config.nodes.submit_1;
    if (submit.type === "activity") {
      submit.inputs = [{ port: "fileData", ctxKey: "fileData" }];
    }
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData?.resolution.status).toBe("ctx-bound");
  });
});
