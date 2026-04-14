import { isRegisteredActivityType } from "./activity-types";

describe("activity-types", () => {
  describe("isRegisteredActivityType", () => {
    it("returns true for benchmark OCR cache activities used in graph validation", () => {
      expect(isRegisteredActivityType("benchmark.loadOcrCache")).toBe(true);
      expect(isRegisteredActivityType("benchmark.persistOcrCache")).toBe(true);
    });

    it("returns false for unknown types", () => {
      expect(isRegisteredActivityType("benchmark.notReal")).toBe(false);
    });
  });
});
