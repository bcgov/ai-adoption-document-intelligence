/**
 * Unit tests for ConfusionMatrixService.
 * Tests the pure computation logic (alignAndDiff, computeFromPairs) without
 * requiring database or Prisma connections.
 */

import { ConfusionMatrixService } from "./confusion-matrix.service";

describe("ConfusionMatrixService", () => {
  let service: ConfusionMatrixService;

  beforeEach(() => {
    // Pass null for PrismaService since we only test pure computation methods
    service = new ConfusionMatrixService(null as never);
  });

  describe("alignAndDiff", () => {
    it("returns empty array for identical strings", () => {
      expect(service.alignAndDiff("hello", "hello")).toEqual([]);
    });

    it("detects single character substitution in equal-length strings", () => {
      const diffs = service.alignAndDiff("1O0", "100");
      expect(diffs).toEqual([{ trueChar: "0", recognizedChar: "O" }]);
    });

    it("detects multiple substitutions in equal-length strings", () => {
      const diffs = service.alignAndDiff("Ol", "01");
      expect(diffs).toEqual([
        { trueChar: "0", recognizedChar: "O" },
        { trueChar: "1", recognizedChar: "l" },
      ]);
    });

    it("handles different-length strings via alignment", () => {
      // "1O0a" vs "100": alignment removes 'a' (deletion) and substitutes O→0
      const diffs = service.alignAndDiff("1O0a", "100");
      expect(diffs.length).toBeGreaterThanOrEqual(1);
    });

    it("detects substitutions in different-length strings", () => {
      // "hOllo" vs "hello": O→e substitution + same length match
      const diffs = service.alignAndDiff("hOllo", "hello");
      expect(diffs).toContainEqual({
        trueChar: "e",
        recognizedChar: "O",
      });
    });

    it("returns empty for both empty strings", () => {
      expect(service.alignAndDiff("", "")).toEqual([]);
    });
  });

  describe("computeFromPairs", () => {
    it("builds a matrix from correction pairs", () => {
      const pairs = [
        { originalValue: "1O0", correctedValue: "100", fieldKey: "amount" },
        { originalValue: "2O24", correctedValue: "2024", fieldKey: "year" },
        { originalValue: "l5", correctedValue: "15", fieldKey: "day" },
      ];

      const result = service.computeFromPairs(pairs);

      expect(result.schemaVersion).toBe("1.0");
      expect(result.type).toBe("character");
      expect(result.metadata.sampleCount).toBe(3);
      expect(result.metadata.fieldCount).toBe(3);

      expect(result.matrix["0"]).toBeDefined();
      expect(result.matrix["0"]["O"]).toBeGreaterThanOrEqual(2);

      expect(result.matrix["1"]).toBeDefined();
      expect(result.matrix["1"]["l"]).toBe(1);

      expect(result.totals.totalConfusions).toBeGreaterThan(0);
      expect(result.totals.uniquePairs).toBeGreaterThan(0);
      expect(result.totals.topConfusions.length).toBeGreaterThan(0);
      expect(result.totals.topConfusions[0].count).toBeGreaterThanOrEqual(
        result.totals.topConfusions[result.totals.topConfusions.length - 1]
          .count,
      );
    });

    it("skips pairs where original equals corrected", () => {
      const pairs = [
        { originalValue: "hello", correctedValue: "hello", fieldKey: "name" },
      ];
      const result = service.computeFromPairs(pairs);
      expect(result.totals.totalConfusions).toBe(0);
      expect(result.metadata.fieldCount).toBe(0);
    });

    it("skips pairs with empty values", () => {
      const pairs = [
        { originalValue: "", correctedValue: "hello", fieldKey: "name" },
        { originalValue: "hello", correctedValue: "", fieldKey: "name" },
      ];
      const result = service.computeFromPairs(pairs);
      expect(result.totals.totalConfusions).toBe(0);
    });

    it("handles single-character confusions", () => {
      const pairs = [
        { originalValue: "O", correctedValue: "0", fieldKey: "digit" },
      ];
      const result = service.computeFromPairs(pairs);
      expect(result.matrix["0"]["O"]).toBe(1);
      expect(result.totals.totalConfusions).toBe(1);
    });

    it("returns metadata with correct filter info", () => {
      const filters = {
        startDate: "2026-01-01",
        endDate: "2026-03-01",
        groupIds: ["g1"],
      };
      const result = service.computeFromPairs([], filters);
      expect(result.metadata.filters).toEqual(filters);
    });
  });
});
