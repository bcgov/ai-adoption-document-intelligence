/**
 * Tests for `describeCondition` — a condition written out as the sentence the
 * poll and switch panels show above the condition editor.
 *
 * The poll step is Standard OCR's own: Poll OCR Results stops polling once
 * its Poll status output is no longer "running".
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityNode,
  ConditionExpression,
  GraphWorkflowConfig,
  PollUntilNode,
} from "../../../types/workflow";
import { describeCondition } from "./condition-sentence";

const STOPS_WHEN_DONE: ConditionExpression = {
  operator: "not-equals",
  left: { ref: "ctx.ocrStatus" },
  right: { literal: "running" },
};

function pollConfig(): GraphWorkflowConfig {
  const prepare: ActivityNode = {
    id: "prepareFileData",
    type: "activity",
    label: "Prepare File Data",
    activityType: "file.prepare",
  };
  const poll: PollUntilNode = {
    id: "pollOcrResults",
    type: "pollUntil",
    label: "Poll OCR Results",
    activityType: "azureOcr.poll",
    outputs: [{ port: "status", ctxKey: "ocrStatus" }],
    condition: STOPS_WHEN_DONE,
    interval: "10s",
  };
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "prepareFileData",
    nodes: { prepareFileData: prepare, pollOcrResults: poll },
    edges: [
      {
        id: "e1",
        source: "prepareFileData",
        target: "pollOcrResults",
        type: "normal",
      },
    ],
    ctx: {},
  };
}

/** No step produces any of these keys, so they read as their own names. */
function bareConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: "",
    nodes: {},
    edges: [],
    ctx: {},
  };
}

const eq = (key: string, literal: number): ConditionExpression => ({
  operator: "equals",
  left: { ref: `ctx.${key}` },
  right: { literal },
});

describe("describeCondition — a comparison", () => {
  it("names a step's output the way the step picker does", () => {
    expect(
      describeCondition(STOPS_WHEN_DONE, pollConfig(), "pollOcrResults"),
    ).toBe('Poll OCR Results → Poll status is not equal to "running"');
  });

  it("names a field drilled out of a step's output after it", () => {
    const expr: ConditionExpression = {
      operator: "equals",
      left: { ref: "ctx.ocrStatus.code" },
      right: { literal: 200 },
    };
    expect(describeCondition(expr, pollConfig(), "pollOcrResults")).toBe(
      "Poll OCR Results → Poll status · code is equal to 200",
    );
  });

  it("writes a variable no step produces by its own name", () => {
    const expr: ConditionExpression = {
      operator: "lt",
      left: { ref: "ctx.score" },
      right: { literal: 0.95 },
    };
    expect(describeCondition(expr, bareConfig())).toBe(
      "score is less than 0.95",
    );
  });

  it("writes typed text in quotes and typed numbers and booleans bare", () => {
    const expr: ConditionExpression = {
      operator: "equals",
      left: { ref: "ctx.requiresReview" },
      right: { literal: true },
    };
    expect(describeCondition(expr, bareConfig())).toBe(
      "requiresReview is equal to true",
    );
  });

  it("marks a value that has not been chosen yet", () => {
    const expr: ConditionExpression = {
      operator: "equals",
      left: { ref: "" },
      right: { literal: "x" },
    };
    expect(describeCondition(expr, bareConfig())).toBe('… is equal to "x"');
  });
});

describe("describeCondition — the other kinds", () => {
  it("writes an emptiness check", () => {
    expect(
      describeCondition(
        { operator: "is-null", value: { ref: "ctx.note" } },
        bareConfig(),
      ),
    ).toBe("note is empty");
  });

  it("writes a list check", () => {
    expect(
      describeCondition(
        {
          operator: "in",
          value: { ref: "ctx.docType" },
          list: { literal: ["invoice", "receipt"] },
        },
        bareConfig(),
      ),
    ).toBe('docType is in the list ["invoice","receipt"]');
  });

  it("spells out AND and OR, bracketing a group inside a group", () => {
    const expr: ConditionExpression = {
      operator: "and",
      operands: [
        eq("a", 1),
        { operator: "or", operands: [eq("b", 2), eq("c", 3)] },
      ],
    };
    expect(describeCondition(expr, bareConfig())).toBe(
      "a is equal to 1 and (b is equal to 2 or c is equal to 3)",
    );
  });

  it("wraps NOT around what it negates", () => {
    expect(
      describeCondition({ operator: "not", operand: eq("a", 1) }, bareConfig()),
    ).toBe("not (a is equal to 1)");
  });
});
