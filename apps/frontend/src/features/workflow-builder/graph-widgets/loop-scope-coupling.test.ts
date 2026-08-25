import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { analyzeMapBody } from "../settings/control-flow/map-body-analysis";
import { buildVariableOptions } from "./VariablePicker";

/**
 * Coupling guard: a map's body is a SCOPE, and three subsystems have to agree
 * on who is inside it — the canvas body box, this variable picker, and the
 * runtime. They agree only because they share `analyzeMapBody`'s forward
 * entry→exit walk.
 *
 * The failure this guards against already happened once: an earlier membership
 * test asked "is this node an ancestor of the exit?", which silently excluded
 * dead-end branches. Those nodes sat visibly inside the green body box and
 * received the loop item at runtime, but the picker refused to offer it — so an
 * author hand-typed the key instead, which works, which is why nobody reported
 * it.
 *
 * This lives here rather than in the e2e suite deliberately: it is a question
 * about scope resolution, not about the canvas, and driving a Mantine
 * Autocomplete open through a real browser added flake without adding coverage.
 */

/**
 * `router` branches to `deadEnd` and to `exit`. Only `exit` is the body exit,
 * so `deadEnd` never rejoins — it is inside the loop but is not an ancestor of
 * the exit, which is precisely the shape the old test got wrong.
 */
const configWithDeadEndBranch = {
  schemaVersion: "1.0",
  metadata: { name: "dead-end branch" },
  entryNodeId: "loop",
  ctx: { docs: { type: "array" } },
  nodes: {
    loop: {
      id: "loop",
      type: "map",
      label: "Each doc",
      collectionCtxKey: "docs",
      itemCtxKey: "currentDoc",
      indexCtxKey: "docIndex",
      bodyEntryNodeId: "router",
      bodyExitNodeId: "exit",
    },
    router: {
      id: "router",
      type: "switch",
      label: "Route",
      cases: [],
      defaultEdge: "e-exit",
    },
    deadEnd: {
      id: "deadEnd",
      type: "activity",
      activityType: "file.prepare",
      label: "Dead end",
    },
    exit: {
      id: "exit",
      type: "activity",
      activityType: "document.updateStatus",
      label: "Exit",
      parameters: { status: "complete" },
    },
    // Outside the map entirely — the negative control that makes the positive
    // assertions meaningful.
    outside: {
      id: "outside",
      type: "activity",
      activityType: "file.prepare",
      label: "Outside",
    },
  },
  edges: [
    { id: "e-dead", source: "router", target: "deadEnd", type: "normal" },
    { id: "e-exit", source: "router", target: "exit", type: "normal" },
  ],
} as unknown as GraphWorkflowConfig;

describe("loop-variable scope (map body membership)", () => {
  it("counts a dead-end branch as inside the body", () => {
    const { bodyNodeIds } = analyzeMapBody(
      configWithDeadEndBranch,
      "router",
      "exit",
    );
    expect(bodyNodeIds).toContain("deadEnd");
    expect(bodyNodeIds).toContain("exit");
    expect(bodyNodeIds).not.toContain("outside");
  });

  it("offers the loop item and index on a dead-end branch node", () => {
    const options = buildVariableOptions(configWithDeadEndBranch, "deadEnd");
    const keys = options.flatMap((g) => g.items);
    expect(keys).toContain("currentDoc");
    expect(keys).toContain("docIndex");
  });

  it("does NOT offer them to a node outside the loop", () => {
    // The failing state that makes the assertions above falsifiable: move the
    // consumer out of the body and the keys must disappear.
    const options = buildVariableOptions(configWithDeadEndBranch, "outside");
    const keys = options.flatMap((g) => g.items);
    expect(keys).not.toContain("currentDoc");
    expect(keys).not.toContain("docIndex");
  });

  it("groups an undeclared loop key under 'Loop variables'", () => {
    // Every SHIPPED map declares its item key in config.ctx, which dedupes it
    // into "Workflow context" — so this heading is unreachable on real
    // fixtures. Asserting it there would pass even with loop scoping removed.
    // Here the key is deliberately NOT declared, which is the only shape that
    // can actually exercise the grouping.
    const options = buildVariableOptions(configWithDeadEndBranch, "deadEnd");
    const loopGroup = options.find((g) => g.group === "Loop variables");
    expect(loopGroup?.items).toEqual(
      expect.arrayContaining(["currentDoc", "docIndex"]),
    );
  });
});
