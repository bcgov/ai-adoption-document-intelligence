import type { ClassifiedDocument } from "./azure-classify-poll";
import {
  type SelectClassifiedPagesInput,
  selectClassifiedPages,
} from "./select-classified-pages";

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
    { confidence: 0.7, pageRange: { start: 5, end: 6 } },
  ],
  receipt: [{ confidence: 0.85, pageRange: { start: 3, end: 4 } }],
};

const BASE_INPUT: SelectClassifiedPagesInput = {
  labeledDocuments: LABELED_DOCUMENTS,
  targetLabel: "invoice",
};

describe("selectClassifiedPages activity", () => {
  describe("Scenario 1: Target label found — single result", () => {
    it("returns a segments array with the single matching entry", async () => {
      const input: SelectClassifiedPagesInput = {
        labeledDocuments: {
          invoice: [{ confidence: 0.9, pageRange: { start: 1, end: 2 } }],
        },
        targetLabel: "invoice",
      };

      const result = await selectClassifiedPages(input);

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toEqual({
        pageRange: { start: 1, end: 2 },
        confidence: 0.9,
      });
    });
  });

  describe("Scenario 2: Target label found — multiple results, all returned sorted", () => {
    it("returns all segments for the target label sorted by pageRange.start ascending", async () => {
      const input: SelectClassifiedPagesInput = {
        labeledDocuments: {
          invoice: [
            { confidence: 0.7, pageRange: { start: 5, end: 6 } },
            { confidence: 0.9, pageRange: { start: 1, end: 2 } },
          ],
        },
        targetLabel: "invoice",
      };

      const result = await selectClassifiedPages(input);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        pageRange: { start: 1, end: 2 },
        confidence: 0.9,
      });
      expect(result.segments[1]).toEqual({
        pageRange: { start: 5, end: 6 },
        confidence: 0.7,
      });
    });
  });

  describe("Scenario 3: Target label not found", () => {
    it("throws a non-retryable ApplicationFailure naming the missing label and listing available labels", async () => {
      const input: SelectClassifiedPagesInput = {
        ...BASE_INPUT,
        targetLabel: "unknown-label",
      };

      await expect(selectClassifiedPages(input)).rejects.toMatchObject({
        message: expect.stringContaining("unknown-label"),
        nonRetryable: true,
      });
    });

    it("includes the available labels in the error message", async () => {
      const input: SelectClassifiedPagesInput = {
        ...BASE_INPUT,
        targetLabel: "missing",
      };

      await expect(selectClassifiedPages(input)).rejects.toMatchObject({
        message: expect.stringContaining("invoice"),
      });
    });
  });

  describe("Scenario 4: labeledDocuments is empty or null", () => {
    it("throws a non-retryable ApplicationFailure when labeledDocuments is an empty object", async () => {
      const input: SelectClassifiedPagesInput = {
        labeledDocuments: {},
        targetLabel: "invoice",
      };

      await expect(selectClassifiedPages(input)).rejects.toMatchObject({
        message: expect.stringContaining("empty or null"),
        nonRetryable: true,
      });
    });

    it("throws a non-retryable ApplicationFailure when labeledDocuments is null", async () => {
      const input = {
        labeledDocuments: null as unknown as Record<
          string,
          ClassifiedDocument[]
        >,
        targetLabel: "invoice",
      };

      await expect(selectClassifiedPages(input)).rejects.toMatchObject({
        nonRetryable: true,
      });
    });
  });

  describe("Scenario 5: Activity is registered and exported", () => {
    it("exports selectClassifiedPages as a function", () => {
      expect(typeof selectClassifiedPages).toBe("function");
    });
  });
});
