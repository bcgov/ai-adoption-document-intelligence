import {
  isRegisteredActivityType,
  REGISTERED_ACTIVITY_TYPES,
} from "./activity-types";

describe("activity-types", () => {
  it("lists no benchmark.* activity, since only the benchmark workflows run them", () => {
    expect(
      REGISTERED_ACTIVITY_TYPES.filter((type) => type.startsWith("benchmark.")),
    ).toEqual([]);
  });

  describe("isRegisteredActivityType", () => {
    it("accepts an activity a graph node may run", () => {
      expect(isRegisteredActivityType("azureOcr.submit")).toBe(true);
    });

    it.each([
      "benchmark.evaluate",
      "benchmark.aggregate",
      "benchmark.cleanup",
      "benchmark.updateRunStatus",
      "benchmark.compareAgainstBaseline",
      "benchmark.writePrediction",
      "benchmark.flattenPredictionFromRefs",
      "benchmark.materializeDataset",
      "benchmark.loadDatasetManifest",
      "benchmark.loadOcrCache",
      "benchmark.persistOcrCache",
      "benchmark.persistEvaluationDetails",
    ])("refuses %s, which only the benchmark workflows run", (activityType) => {
      expect(isRegisteredActivityType(activityType)).toBe(false);
    });

    it("returns false for unknown types", () => {
      expect(isRegisteredActivityType("benchmark.notReal")).toBe(false);
    });
  });
});
