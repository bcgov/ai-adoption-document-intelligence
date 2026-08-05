import * as ocrRefUtils from "../ocr-activity-ref-utils";
import type { OCRResult } from "../types";
import { getPrismaClient } from "./database-client";
import {
  type ApplyReviewCriteriaParams,
  applyReviewCriteria,
} from "./hitl-apply-review-criteria";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const DOC_ID = "doc-review-criteria-test";

function run(
  params: Omit<ApplyReviewCriteriaParams, "documentId" | "rules"> &
    Partial<Pick<ApplyReviewCriteriaParams, "documentId">> & {
      rules: ApplyReviewCriteriaParams["rules"];
    },
) {
  return applyReviewCriteria({ documentId: DOC_ID, ...params });
}

beforeEach(() => {
  jest
    .spyOn(ocrRefUtils, "resolveOcrResultInput")
    .mockImplementation(async (params) => ({
      ocrResult: params.ocrResult as OCRResult,
      groupId: "gtestgroupidfortests01",
    }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeOcrResult(
  documentFields: Record<
    string,
    { content?: string; confidence?: number; type?: string }
  >,
  kvps: Array<{ key: string; value: string; confidence: number }> = [],
): OCRResult {
  return {
    success: true,
    status: "succeeded",
    apimRequestId: "test",
    fileName: "test.pdf",
    fileType: "pdf",
    modelId: "custom-model",
    extractedText: "",
    pages: [],
    paragraphs: [],
    tables: [],
    sections: [],
    figures: [],
    keyValuePairs: kvps.map((k) => ({
      key: { content: k.key, boundingRegions: [], spans: [] },
      value: {
        content: k.value,
        boundingRegions: [],
        spans: [],
      },
      confidence: k.confidence,
    })),
    documents: [
      {
        docType: "custom",
        fields: documentFields,
      },
    ],
    processedAt: new Date().toISOString(),
  };
}

describe("applyReviewCriteria activity", () => {
  it("flags a field for review when confidence is below threshold", async () => {
    const ocrResult = makeOcrResult({
      total_amount: { content: "100.00", confidence: 0.4 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "low-confidence",
          select: {},
          when: [{ confidenceBelow: 0.7 }],
          action: "review",
          reason: "Low confidence extraction",
        },
      ],
    });

    expect(result.reviewPlan).toEqual([
      {
        field: "total_amount",
        decision: "review",
        reason: "Low confidence extraction",
        ruleName: "low-confidence",
        confidence: 0.4,
      },
    ]);
    expect(result.requiresReview).toBe(true);
    expect(result.reviewFieldCount).toBe(1);
    expect(result.countsByRule).toEqual({ "low-confidence": 1 });
  });

  it("does not flag a field when confidence is at/above threshold", async () => {
    const ocrResult = makeOcrResult({
      total_amount: { content: "100.00", confidence: 0.95 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "low-confidence",
          select: {},
          when: [{ confidenceBelow: 0.7 }],
          action: "review",
          reason: "Low confidence extraction",
        },
      ],
      defaultAction: "skip",
    });

    expect(result.reviewPlan).toEqual([
      {
        field: "total_amount",
        decision: "skip",
        reason: 'No rule matched; default action "skip" applied',
        ruleName: "__default__",
        confidence: 0.95,
      },
    ]);
    expect(result.requiresReview).toBe(false);
  });

  it("uses skipWhen to suppress a rule when prediction is blank", async () => {
    const ocrResult = makeOcrResult({
      middle_name: { content: "", confidence: 0.3 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "low-confidence",
          select: {},
          when: [{ confidenceBelow: 0.7 }],
          skipWhen: [{ predictionIsBlank: true }],
          action: "review",
          reason: "Low confidence extraction",
        },
      ],
    });

    // The rule's `when` matched (low confidence) but `skipWhen` also
    // matched (blank prediction), so the rule is skipped and the field
    // falls through to the default action.
    expect(result.reviewPlan[0].decision).toBe("skip");
    expect(result.reviewPlan[0].ruleName).toBe("__default__");
    expect(result.requiresReview).toBe(false);
  });

  it("flags a field via predictionLengthAtMost", async () => {
    const ocrResult = makeOcrResult({
      notes: { content: "ok", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "too-short",
          select: {},
          when: [{ predictionLengthAtMost: 3 }],
          action: "review",
          reason: "Suspiciously short value",
        },
      ],
    });

    expect(result.reviewPlan[0]).toMatchObject({
      decision: "review",
      ruleName: "too-short",
    });
  });

  it("flags a field via formatValidationFails using documentType schema", async () => {
    const prismaMock = {
      templateModel: {
        findUnique: jest.fn().mockResolvedValue({
          id: "proj-1",
          field_schema: [
            {
              field_key: "sin_number",
              field_type: "string",
              field_format: null,
              format_spec: JSON.stringify({
                canonicalize: "digits",
                pattern: "^\\d{9}$",
              }),
            },
          ],
        }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);

    const ocrResult = makeOcrResult({
      sin_number: { content: "12-34", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      documentType: "proj-1",
      rules: [
        {
          name: "bad-format",
          select: {},
          when: [{ formatValidationFails: true }],
          action: "review",
          reason: "Fails format validation",
        },
      ],
    });

    expect(result.reviewPlan[0]).toMatchObject({
      field: "sin_number",
      decision: "review",
      ruleName: "bad-format",
    });
  });

  it("does not flag formatValidationFails when the value matches the pattern", async () => {
    const prismaMock = {
      templateModel: {
        findUnique: jest.fn().mockResolvedValue({
          id: "proj-1",
          field_schema: [
            {
              field_key: "sin_number",
              field_type: "string",
              field_format: null,
              format_spec: JSON.stringify({
                canonicalize: "digits",
                pattern: "^\\d{9}$",
              }),
            },
          ],
        }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);

    const ocrResult = makeOcrResult({
      sin_number: { content: "123456789", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      documentType: "proj-1",
      rules: [
        {
          name: "bad-format",
          select: {},
          when: [{ formatValidationFails: true }],
          action: "review",
          reason: "Fails format validation",
        },
      ],
    });

    expect(result.reviewPlan[0].decision).toBe("skip");
  });

  it("applies defaultAction 'skip' when no rule matches", async () => {
    const ocrResult = makeOcrResult({
      unrelated_field: { content: "value", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "low-confidence",
          select: { fields: ["some_other_field"] },
          when: [{ confidenceBelow: 0.7 }],
          action: "review",
          reason: "Low confidence extraction",
        },
      ],
    });

    expect(result.reviewPlan[0]).toEqual({
      field: "unrelated_field",
      decision: "skip",
      reason: 'No rule matched; default action "skip" applied',
      ruleName: "__default__",
      confidence: 0.99,
    });
    expect(result.requiresReview).toBe(false);
  });

  it("evaluates multiple rules in order and applies the first match", async () => {
    const ocrResult = makeOcrResult({
      field_a: { content: "", confidence: 0.99 },
      field_b: { content: "value", confidence: 0.5 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "blank-review",
          select: {},
          when: [{ predictionIsBlank: true }],
          action: "review",
          reason: "Blank value",
        },
        {
          name: "low-confidence-review",
          select: {},
          when: [{ confidenceBelow: 0.7 }],
          action: "review",
          reason: "Low confidence",
        },
      ],
    });

    expect(result.reviewPlan).toEqual([
      {
        field: "field_a",
        decision: "review",
        reason: "Blank value",
        ruleName: "blank-review",
        confidence: 0.99,
      },
      {
        field: "field_b",
        decision: "review",
        reason: "Low confidence",
        ruleName: "low-confidence-review",
        confidence: 0.5,
      },
    ]);
    expect(result.reviewFieldCount).toBe(2);
    expect(result.countsByRule).toEqual({
      "blank-review": 1,
      "low-confidence-review": 1,
    });
  });

  it("selects fields using glob field patterns", async () => {
    const ocrResult = makeOcrResult({
      applicant_date_of_birth: { content: "", confidence: 0.99 },
      applicant_name: { content: "Jane Doe", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "date-fields-blank",
          select: { fieldPatterns: ["*_date_*"] },
          when: [{ predictionIsBlank: true }],
          action: "review",
          reason: "Blank date field",
        },
      ],
    });

    const dobEntry = result.reviewPlan.find(
      (e) => e.field === "applicant_date_of_birth",
    );
    const nameEntry = result.reviewPlan.find(
      (e) => e.field === "applicant_name",
    );

    expect(dobEntry).toMatchObject({
      decision: "review",
      ruleName: "date-fields-blank",
    });
    expect(nameEntry).toMatchObject({
      decision: "skip",
      ruleName: "__default__",
    });
  });

  it("never consults ground truth — only prediction-side fields are read", async () => {
    const ocrResult = makeOcrResult({
      total_amount: { content: "100.00", confidence: 0.99 },
    });
    // Simulate a payload that also carries ground truth alongside the
    // prediction (as some benchmark contexts do); the activity's params
    // type has no slot for it, and the implementation must never reach
    // for anything resembling ground truth even if present on ctx.
    const paramsWithExtraneousGroundTruth = {
      ocrResult,
      groundTruth: { total_amount: "999.99" },
      rules: [
        {
          name: "always-skip",
          select: {},
          when: [{ always: true }],
          action: "skip" as const,
          reason: "n/a",
        },
      ],
    };

    const result = await run(
      paramsWithExtraneousGroundTruth as unknown as Omit<
        ApplyReviewCriteriaParams,
        "documentId" | "rules"
      > & { rules: ApplyReviewCriteriaParams["rules"] },
    );

    expect(result.reviewPlan[0]).toMatchObject({
      field: "total_amount",
      decision: "skip",
      ruleName: "always-skip",
    });
  });

  it("flags a field via valueOutsideRange", async () => {
    const ocrResult = makeOcrResult({
      age: { content: "150", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "implausible-age",
          select: { fields: ["age"] },
          when: [{ valueOutsideRange: { min: 0, max: 120 } }],
          action: "review",
          reason: "Implausible age",
        },
      ],
    });

    expect(result.reviewPlan[0]).toMatchObject({
      decision: "review",
      ruleName: "implausible-age",
    });
  });

  it("flags a field via valueWasInferred", async () => {
    const ocrResult = makeOcrResult({
      middle_name: { content: "J", confidence: 0.99 },
    });

    const result = await run({
      ocrResult,
      inferredFieldKeys: ["middle_name"],
      rules: [
        {
          name: "inferred-review",
          select: {},
          when: [{ valueWasInferred: true }],
          action: "review",
          reason: "Value was inferred by a prior correction step",
        },
      ],
    });

    expect(result.reviewPlan[0]).toMatchObject({
      decision: "review",
      ruleName: "inferred-review",
    });
  });

  it("walks keyValuePairs when documents are absent", async () => {
    const ocrResult = makeOcrResult({}, [
      { key: "Name", value: "", confidence: 0.99 },
    ]);
    ocrResult.documents = [];

    const result = await run({
      ocrResult,
      rules: [
        {
          name: "blank-review",
          select: {},
          when: [{ predictionIsBlank: true }],
          action: "review",
          reason: "Blank value",
        },
      ],
    });

    expect(result.reviewPlan).toEqual([
      {
        field: "Name",
        decision: "review",
        reason: "Blank value",
        ruleName: "blank-review",
        confidence: 0.99,
      },
    ]);
  });

  it("does not short-circuit for benchmark- prefixed document ids", async () => {
    const ocrResult = makeOcrResult({
      total_amount: { content: "1.00", confidence: 0.1 },
    });

    const result = await applyReviewCriteria({
      documentId: "benchmark-abc123",
      ocrResult,
      rules: [
        {
          name: "low-confidence",
          select: {},
          when: [{ confidenceBelow: 0.7 }],
          action: "review",
          reason: "Low confidence",
        },
      ],
    });

    expect(result.requiresReview).toBe(true);
    expect(result.reviewFieldCount).toBe(1);
  });
});
