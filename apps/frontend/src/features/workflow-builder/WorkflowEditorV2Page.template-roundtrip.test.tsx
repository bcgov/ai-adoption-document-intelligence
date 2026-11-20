import {
  type GraphWorkflowConfig,
  normaliseLocks,
  resolveBindings,
  stripRedundantLocks,
} from "@ai-di/graph-workflow";
import multiPageReport from "@workflow-templates/multi-page-report-workflow.json";
import standardOcr from "@workflow-templates/standard-ocr-workflow.json";
import { describe, expect, it } from "vitest";

describe("Auto-wire round-trip stability against shipped templates", () => {
  it("multi-page-report-workflow.json is byte-stable through load + save", () => {
    const loaded = resolveBindings(
      normaliseLocks(multiPageReport as GraphWorkflowConfig),
    );
    const saved = stripRedundantLocks(loaded);
    expect(JSON.stringify(saved)).toEqual(JSON.stringify(multiPageReport));
  });

  it("standard-ocr-workflow.json is byte-stable through load + save", () => {
    const loaded = resolveBindings(
      normaliseLocks(standardOcr as GraphWorkflowConfig),
    );
    const saved = stripRedundantLocks(loaded);
    expect(JSON.stringify(saved)).toEqual(JSON.stringify(standardOcr));
  });
});
