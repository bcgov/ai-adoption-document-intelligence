/**
 * The hand-kept lists of activity names agree with each other.
 *
 * Adding an activity means editing four lists, and nothing else checks them
 * against each other:
 *   - the worker's registry (`activity-registry.ts`): what the worker can run;
 *   - the worker's allowed list (`activity-types.ts`): what a graph node may
 *     run, checked inside the worker;
 *   - the backend's allowed list (`workflow/activity-registry.ts`): what a
 *     saved workflow may use; anything else is an error that blocks runs;
 *   - the catalog (`@ai-di/graph-workflow`): each activity's description,
 *     which the palette, the inputs panel, the validator and the agent read.
 */
import { ACTIVITY_CATALOG } from "@ai-di/graph-workflow";
import { REGISTERED_ACTIVITY_TYPES as BACKEND_ALLOWED } from "../../backend-services/src/workflow/activity-registry";
import { getRegisteredActivityTypes } from "./activity-registry";
import { REGISTERED_ACTIVITY_TYPES as WORKER_ALLOWED } from "./activity-types";

/**
 * Activities a saved workflow may use that have no catalog description yet.
 * Without one, the editor cannot show their inputs, their settings go
 * unchecked and the agent cannot find them. Describing one means removing
 * it from this list.
 */
const UNDESCRIBED = [
  "azureContentUnderstanding.analyze",
  "azureContentUnderstanding.deployAnalyzer",
  "document.persistReviewPlan",
  "hitl.applyReviewCriteria",
  "ocr.recoverNumericZerosFromCheckboxes",
  "vlmDirect.extract",
  "vlmOcrHybrid.extract",
];

/** The palette hides this category: only the benchmark workflows call it. */
const BENCHMARK_CATEGORY = "Benchmarking";

const workerRegistry = new Set(getRegisteredActivityTypes());
const backendAllowed = Object.keys(BACKEND_ALLOWED);

describe("activity lists", () => {
  it("allows the same activities in the worker as in the backend", () => {
    expect([...WORKER_ALLOWED].sort()).toEqual([...backendAllowed].sort());
  });

  it("can run every activity a saved workflow may use", () => {
    expect(backendAllowed.filter((t) => !workerRegistry.has(t))).toEqual([]);
  });

  it("can run every activity the catalog describes", () => {
    expect(
      Object.keys(ACTIVITY_CATALOG).filter((t) => !workerRegistry.has(t)),
    ).toEqual([]);
  });

  it("describes every activity a saved workflow may use, apart from the known gaps", () => {
    expect(
      backendAllowed.filter((t) => ACTIVITY_CATALOG[t] === undefined).sort(),
    ).toEqual([...UNDESCRIBED].sort());
  });

  it("accepts every activity the palette offers", () => {
    const offered = Object.values(ACTIVITY_CATALOG)
      .filter((entry) => entry.category !== BENCHMARK_CATEGORY)
      .map((entry) => entry.activityType);
    expect(offered.filter((t) => BACKEND_ALLOWED[t] === undefined)).toEqual([]);
  });
});
