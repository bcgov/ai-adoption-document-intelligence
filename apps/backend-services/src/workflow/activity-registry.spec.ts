import {
  getRegisteredActivityTypeKeys,
  isRegisteredActivityType,
  REGISTERED_ACTIVITY_TYPES,
} from "./activity-registry";

const EXPECTED_ACTIVITY_TYPES = [
  "document.updateStatus",
  "file.prepare",
  "azureOcr.submit",
  "azureOcr.poll",
  "azureOcr.extract",
  "ocr.cleanup",
  "ocr.enrich",
  "ocr.checkConfidence",
  "ocr.storeResults",
  "document.storeRejection",
  "document.split",
  "document.classify",
  "document.splitAndClassify",
  "document.validateFields",
  "segment.combineResult",
  "ocr.spellcheck",
  "ocr.characterConfusion",
  "ocr.normalizeFields",
  "getWorkflowGraphConfig",
  "document.extractPageRange",
  "azureClassify.submit",
  "azureClassify.poll",
  "document.selectClassifiedPages",
  "document.flattenClassifiedDocuments",
];

describe("activity-registry (backend)", () => {
  describe("REGISTERED_ACTIVITY_TYPES", () => {
    it("contains all 24 expected activity types", () => {
      const keys = Object.keys(REGISTERED_ACTIVITY_TYPES);
      expect(keys).toHaveLength(24);
      for (const activityType of EXPECTED_ACTIVITY_TYPES) {
        expect(activityType in REGISTERED_ACTIVITY_TYPES).toBe(true);
      }
    });

    it("each entry has a non-empty description", () => {
      for (const [, entry] of Object.entries(REGISTERED_ACTIVITY_TYPES)) {
        expect(entry.description).toBeTruthy();
        expect(typeof entry.description).toBe("string");
      }
    });
  });

  describe("isRegisteredActivityType", () => {
    it.each(
      EXPECTED_ACTIVITY_TYPES,
    )("returns true for registered type: %s", (activityType) => {
      expect(isRegisteredActivityType(activityType)).toBe(true);
    });

    it("returns false for unknown activity type", () => {
      expect(isRegisteredActivityType("nonexistent.activity")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isRegisteredActivityType("")).toBe(false);
    });
  });

  describe("getRegisteredActivityTypeKeys", () => {
    it("returns all 24 activity type strings", () => {
      const keys = getRegisteredActivityTypeKeys();
      expect(keys).toHaveLength(24);
      for (const activityType of EXPECTED_ACTIVITY_TYPES) {
        expect(keys).toContain(activityType);
      }
    });
  });
});
