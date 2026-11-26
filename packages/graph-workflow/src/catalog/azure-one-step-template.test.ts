import { readFileSync } from "node:fs";
import * as path from "node:path";
import { validateGraphConfig } from "../index";
import type { GraphWorkflowConfig } from "../types";
import { ACTIVITY_CATALOG } from "./index";

const template = JSON.parse(
  readFileSync(
    path.resolve(
      __dirname,
      "..",
      "..",
      "templates",
      "azure-extract-and-classify-workflow.json",
    ),
    "utf8",
  ),
) as GraphWorkflowConfig;

describe("azure-extract-and-classify-workflow template", () => {
  it("uses the one-step Azure nodes and validates against the catalog", () => {
    const types = Object.values(template.nodes).map((n) =>
      n.type === "activity"
        ? n.activityType
        : n.type === "source"
          ? n.sourceType
          : n.type,
    );
    expect(types).toEqual([
      "source.upload",
      "azureOcr.analyze",
      "ocr.storeResults",
      "azureClassify.analyze",
    ]);

    const result = validateGraphConfig(template, {
      isRegisteredActivityType: (t) => t in ACTIVITY_CATALOG,
      validateActivityParameters: () => undefined,
    });
    expect(result.errors).toEqual([]);
  });
});
