/**
 * Tests for `outputPortKind` / `inputPortKind` / `portFromHandleId` — the
 * catalog kind lookups behind the connect-gesture layer (drag-to-bind and
 * the upcoming connect-time validation). See `port-kinds.ts`.
 */
import { describe, expect, it } from "vitest";
import type { ActivityNode, SwitchNode } from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import { inputPortKind, outputPortKind, portFromHandleId } from "./port-kinds";

describe("outputPortKind / inputPortKind", () => {
  it("returns the catalog kind for an activity output port", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
        }),
      },
    });

    expect(outputPortKind(cfg, "A", "preparedData")).toBe("Document");
  });

  it("returns the catalog kind for an activity input port", () => {
    const cfg = config({
      nodes: {
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
      },
    });

    expect(inputPortKind(cfg, "B", "fileData")).toBe("Document");
  });

  it("returns undefined for control-flow/source nodes, unknown ports, unknown node ids, and catalog-less activity types", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
        }),
        S: node<SwitchNode>({ id: "S", type: "switch", cases: [] }),
        D: node<ActivityNode>({
          id: "D",
          type: "activity",
          activityType: "dyn.unknown-activity",
        }),
      },
    });

    // Control-flow node — not activity/pollUntil.
    expect(outputPortKind(cfg, "S", "anything")).toBeUndefined();
    expect(inputPortKind(cfg, "S", "anything")).toBeUndefined();

    // Unknown port name on a real catalog entry.
    expect(outputPortKind(cfg, "A", "notAPort")).toBeUndefined();
    expect(inputPortKind(cfg, "A", "notAPort")).toBeUndefined();

    // Unknown node id.
    expect(outputPortKind(cfg, "missing", "preparedData")).toBeUndefined();
    expect(inputPortKind(cfg, "missing", "documentId")).toBeUndefined();

    // Catalog-less (dyn.*) activity type.
    expect(outputPortKind(cfg, "D", "anything")).toBeUndefined();
    expect(inputPortKind(cfg, "D", "anything")).toBeUndefined();
  });
});

describe("portFromHandleId", () => {
  it('extracts the port from "in-x"/"out-x" per direction', () => {
    expect(portFromHandleId("in-fileData", "input")).toBe("fileData");
    expect(portFromHandleId("out-preparedData", "output")).toBe("preparedData");
  });

  it('returns null for node-level handle ids (null, undefined, "out", "error", wrong prefix for direction)', () => {
    expect(portFromHandleId(null, "input")).toBeNull();
    expect(portFromHandleId(undefined, "input")).toBeNull();
    expect(portFromHandleId("out", "output")).toBeNull();
    expect(portFromHandleId("error", "output")).toBeNull();
    // Wrong prefix for the requested direction.
    expect(portFromHandleId("out-preparedData", "input")).toBeNull();
    expect(portFromHandleId("in-fileData", "output")).toBeNull();
  });
});
