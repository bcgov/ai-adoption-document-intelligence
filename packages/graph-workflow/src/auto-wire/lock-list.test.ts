import type { GraphNode } from "../types";
import { getLockedInputPorts, getLockedOutputPorts } from "./lock-list";

function node(metadata?: Record<string, unknown>): GraphNode {
  return {
    id: "n",
    type: "activity",
    label: "n",
    activityType: "file.prepare",
    metadata,
  } as GraphNode;
}

describe("getLockedInputPorts / getLockedOutputPorts", () => {
  it("returns [] when metadata is undefined", () => {
    expect(getLockedInputPorts(node())).toEqual([]);
    expect(getLockedOutputPorts(node())).toEqual([]);
  });

  it("returns [] when the field is missing", () => {
    expect(getLockedInputPorts(node({}))).toEqual([]);
  });

  it("returns [] when the field is present but not an array", () => {
    expect(
      getLockedInputPorts(node({ lockedInputPorts: "fileData" })),
    ).toEqual([]);
  });

  it("returns the string entries, dropping non-string values", () => {
    expect(
      getLockedInputPorts(node({ lockedInputPorts: ["a", 1, "b", null] })),
    ).toEqual(["a", "b"]);
  });

  it("getLockedOutputPorts reads from the matching field", () => {
    expect(
      getLockedOutputPorts(node({ lockedOutputPorts: ["preparedData"] })),
    ).toEqual(["preparedData"]);
  });
});
