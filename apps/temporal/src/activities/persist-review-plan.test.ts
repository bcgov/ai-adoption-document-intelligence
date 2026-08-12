import { getPrismaClient } from "./database-client";
import type { ReviewPlanEntry } from "./hitl-apply-review-criteria";
import { persistReviewPlan } from "./persist-review-plan";

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

const REVIEW_PLAN: ReviewPlanEntry[] = [
  {
    field: "total_amount",
    decision: "review",
    reason: "Low confidence extraction",
    ruleName: "low-confidence",
    confidence: 0.4,
  },
  {
    field: "invoice_number",
    decision: "skip",
    reason: 'No rule matched; default action "skip" applied',
    ruleName: "__default__",
    confidence: 0.99,
  },
];

describe("persistReviewPlan activity", () => {
  let prismaMock: {
    document: {
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    auditEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        update: jest.fn().mockResolvedValue({ id: "doc-1" }),
        findUnique: jest.fn().mockResolvedValue({ id: "doc-1" }),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("updates document.review_plan and records an audit event", async () => {
    await persistReviewPlan({
      documentId: "doc-1",
      reviewPlan: REVIEW_PLAN,
      groupId: "group-1",
    });

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { review_plan: REVIEW_PLAN },
    });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        event_type: "document_review_plan_updated",
        resource_type: "document",
        resource_id: "doc-1",
        document_id: "doc-1",
        group_id: "group-1",
        payload: { field_count: 2, review_field_count: 1 },
      },
    });
  });

  it("defaults group_id to null when not provided", async () => {
    await persistReviewPlan({
      documentId: "doc-1",
      reviewPlan: REVIEW_PLAN,
    });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ group_id: null }),
      }),
    );
  });

  it("does not fail the main operation when the audit insert fails", async () => {
    prismaMock.auditEvent.create.mockRejectedValue(new Error("audit down"));

    await expect(
      persistReviewPlan({ documentId: "doc-1", reviewPlan: REVIEW_PLAN }),
    ).resolves.toBeUndefined();

    expect(prismaMock.document.update).toHaveBeenCalled();
  });

  it("skips gracefully on FK constraint violation (P2003 - benchmark mode)", async () => {
    prismaMock.document.findUnique.mockResolvedValue(null);

    await expect(
      persistReviewPlan({
        documentId: "benchmark-doc-1",
        reviewPlan: REVIEW_PLAN,
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.document.update).not.toHaveBeenCalled();
  });

  it("proceeds normally for benchmark- prefixed docs that DO exist in DB", async () => {
    prismaMock.document.findUnique.mockResolvedValue({
      id: "benchmark-doc-1",
    });

    await persistReviewPlan({
      documentId: "benchmark-doc-1",
      reviewPlan: REVIEW_PLAN,
    });

    expect(prismaMock.document.update).toHaveBeenCalled();
  });

  it("skips gracefully when document update fails with P2025 (record not found)", async () => {
    const notFoundError = Object.assign(new Error("not found"), {
      code: "P2025",
    });
    prismaMock.document.update.mockRejectedValue(notFoundError);

    await expect(
      persistReviewPlan({ documentId: "doc-missing", reviewPlan: REVIEW_PLAN }),
    ).resolves.toBeUndefined();
  });

  it("throws when the document update fails for an unexpected reason", async () => {
    prismaMock.document.update.mockRejectedValue(new Error("db down"));

    await expect(
      persistReviewPlan({ documentId: "doc-1", reviewPlan: REVIEW_PLAN }),
    ).rejects.toThrow("db down");
  });

  it("handles an empty review plan (field_count/review_field_count = 0)", async () => {
    await persistReviewPlan({ documentId: "doc-1", reviewPlan: [] });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { field_count: 0, review_field_count: 0 },
        }),
      }),
    );
  });
});
