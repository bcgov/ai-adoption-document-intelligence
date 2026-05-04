import type { ClassifiedDocument } from "./azure-classify-poll";
import {
  type FlattenClassifiedDocumentsInput,
  flattenClassifiedDocuments,
} from "./flatten-classified-documents";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const LABELED_DOCUMENTS: Record<string, ClassifiedDocument[]> = {
  invoice: [
    { confidence: 0.9, pageRange: { start: 1, end: 2 } },
    { confidence: 0.75, pageRange: { start: 7, end: 8 } },
  ],
  receipt: [{ confidence: 0.85, pageRange: { start: 3, end: 4 } }],
  cover: [{ confidence: 0.6, pageRange: { start: 5, end: 5 } }],
};

describe("flattenClassifiedDocuments activity", () => {
  describe("Scenario 1: All labels flattened into ordered array", () => {
    it("returns all segments across all labels sorted by pageRange.start", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: LABELED_DOCUMENTS,
      };

      const result = await flattenClassifiedDocuments(input);

      expect(result.segments).toHaveLength(4);
      expect(result.segments.map((s) => s.pageRange.start)).toEqual([
        1, 3, 5, 7,
      ]);
    });

    it("includes label, pageRange, and confidence on each segment", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: LABELED_DOCUMENTS,
      };

      const result = await flattenClassifiedDocuments(input);
      const invoiceFirst = result.segments.find(
        (s) => s.label === "invoice" && s.pageRange.start === 1,
      );

      expect(invoiceFirst).toEqual({
        label: "invoice",
        pageRange: { start: 1, end: 2 },
        confidence: 0.9,
      });
    });
  });

  describe("Scenario 2: filterLabels restricts output to named labels", () => {
    it("excludes labels not in filterLabels", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: LABELED_DOCUMENTS,
        filterLabels: ["invoice", "receipt"],
      };

      const result = await flattenClassifiedDocuments(input);

      const labels = result.segments.map((s) => s.label);
      expect(labels).not.toContain("cover");
      expect(result.segments).toHaveLength(3);
    });

    it("includes all entries for allowed labels, sorted by pageRange.start", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: LABELED_DOCUMENTS,
        filterLabels: ["invoice"],
      };

      const result = await flattenClassifiedDocuments(input);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].pageRange.start).toBe(1);
      expect(result.segments[1].pageRange.start).toBe(7);
    });
  });

  describe("Scenario 3: filterLabels contains a label not in labeledDocuments", () => {
    it("silently skips the missing label and returns entries for present labels", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: LABELED_DOCUMENTS,
        filterLabels: ["invoice", "missing-label"],
      };

      const result = await flattenClassifiedDocuments(input);

      expect(result.segments).toHaveLength(2);
      const labels = result.segments.map((s) => s.label);
      expect(labels).not.toContain("missing-label");
    });
  });

  describe("Scenario 4: labeledDocuments is empty or null", () => {
    it("returns an empty segments array when labeledDocuments is an empty object", async () => {
      const input: FlattenClassifiedDocumentsInput = {
        labeledDocuments: {},
      };

      const result = await flattenClassifiedDocuments(input);

      expect(result.segments).toEqual([]);
    });

    it("returns an empty segments array when labeledDocuments is null", async () => {
      const input = {
        labeledDocuments: null as unknown as Record<
          string,
          ClassifiedDocument[]
        >,
      };

      const result = await flattenClassifiedDocuments(input);

      expect(result.segments).toEqual([]);
    });
  });

  describe("Scenario 5: Activity is registered and exported", () => {
    it("exports flattenClassifiedDocuments as a function", () => {
      expect(typeof flattenClassifiedDocuments).toBe("function");
    });
  });
});
