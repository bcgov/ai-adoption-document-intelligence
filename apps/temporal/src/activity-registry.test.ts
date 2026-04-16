import {
  getActivityEntry,
  getActivityRegistry,
  getRegisteredActivityTypes,
} from "./activity-registry";

const EXPECTED_ACTIVITY_TYPES = [
  "document.updateStatus",
  "file.prepare",
  "azureOcr.submit",
  "azureOcr.poll",
  "azureOcr.extract",
  "ocr.cleanup",
  "ocr.checkConfidence",
  "ocr.storeResults",
  "document.storeRejection",
  "getWorkflowGraphConfig",
  "ocr.enrich",
  "document.split",
  "document.classify",
  "document.splitAndClassify",
  "document.validateFields",
  "segment.combineResult",
  "benchmark.evaluate",
  "benchmark.aggregate",
  "benchmark.cleanup",
  "benchmark.updateRunStatus",
  "benchmark.compareAgainstBaseline",
  "benchmark.writePrediction",
  "benchmark.materializeDataset",
  "benchmark.loadDatasetManifest",
  "executeTransformNode",
];

describe("activity-registry", () => {
  describe("getActivityEntry", () => {
    it.each(
      EXPECTED_ACTIVITY_TYPES,
    )("resolves registered activity type: %s", (activityType) => {
      const entry = getActivityEntry(activityType);
      expect(entry).toBeDefined();
      expect(entry!.activityType).toBe(activityType);
      expect(typeof entry!.activityFn).toBe("function");
      expect(typeof entry!.defaultTimeout).toBe("string");
      expect(entry!.defaultRetry).toBeDefined();
      expect(typeof entry!.description).toBe("string");
    });

    it("returns undefined for unknown activity type", () => {
      const entry = getActivityEntry("nonexistent.activity");
      expect(entry).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      const entry = getActivityEntry("");
      expect(entry).toBeUndefined();
    });
  });

  describe("getActivityRegistry", () => {
    it("returns a map with all registered activity types", () => {
      const registry = getActivityRegistry();
      expect(registry.size).toBe(EXPECTED_ACTIVITY_TYPES.length);
    });

    it("contains all expected activity types", () => {
      const registry = getActivityRegistry();
      for (const activityType of EXPECTED_ACTIVITY_TYPES) {
        expect(registry.has(activityType)).toBe(true);
      }
    });
  });

  describe("getRegisteredActivityTypes", () => {
    it("returns all activity type strings", () => {
      const types = getRegisteredActivityTypes();
      expect(types).toHaveLength(EXPECTED_ACTIVITY_TYPES.length);
      for (const activityType of EXPECTED_ACTIVITY_TYPES) {
        expect(types).toContain(activityType);
      }
    });
  });

  describe("activity function references", () => {
    const allActivities = EXPECTED_ACTIVITY_TYPES;

    it.each(
      allActivities,
    )("maps %s to a valid activity function", (activityType) => {
      const entry = getActivityEntry(activityType);
      expect(entry).toBeDefined();
      expect(typeof entry!.activityFn).toBe("function");
    });
  });

  describe("registry entry metadata", () => {
    it("all entries have non-empty defaultTimeout strings", () => {
      const registry = getActivityRegistry();
      for (const [, entry] of registry) {
        expect(entry.defaultTimeout).toBeTruthy();
        expect(typeof entry.defaultTimeout).toBe("string");
      }
    });

    it("all entries have defaultRetry with maximumAttempts", () => {
      const registry = getActivityRegistry();
      for (const [, entry] of registry) {
        expect(entry.defaultRetry).toBeDefined();
        expect(typeof entry.defaultRetry.maximumAttempts).toBe("number");
      }
    });

    it("all entries have non-empty descriptions", () => {
      const registry = getActivityRegistry();
      for (const [, entry] of registry) {
        expect(entry.description).toBeTruthy();
        expect(typeof entry.description).toBe("string");
      }
    });
  });
});
