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
      updateMany: jest.Mock;
    };
    auditEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", group_id: "group-1" },
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

  it("updates the document only within the run's group", async () => {
    await persistReviewPlan({
      documentId: "doc-1",
      reviewPlan: REVIEW_PLAN,
      groupId: "group-2",
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.document.updateMany.mock.calls[0][0].where).toEqual({
      id: "doc-1",
      group_id: "group-2",
    });
  });

  it("skips without an audit event when the document is not in the run's group", async () => {
    prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      persistReviewPlan({
        documentId: "doc-in-group-2",
        reviewPlan: REVIEW_PLAN,
        groupId: "group-1",
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("skips without an audit event for a benchmark document id that has no row", async () => {
    prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      persistReviewPlan({
        documentId: "benchmark-doc-1",
        reviewPlan: REVIEW_PLAN,
        groupId: "group-1",
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("throws when groupId is missing and does not touch the database", async () => {
    await expect(
      persistReviewPlan({ documentId: "doc-1", reviewPlan: REVIEW_PLAN }),
    ).rejects.toThrow("groupId is required");

    expect(prismaMock.document.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("does not fail the main operation when the audit insert fails", async () => {
    prismaMock.auditEvent.create.mockRejectedValue(new Error("audit down"));

    await expect(
      persistReviewPlan({
        documentId: "doc-1",
        reviewPlan: REVIEW_PLAN,
        groupId: "group-1",
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.document.updateMany).toHaveBeenCalled();
  });

  it("throws when the document update fails for an unexpected reason", async () => {
    prismaMock.document.updateMany.mockRejectedValue(new Error("db down"));

    await expect(
      persistReviewPlan({
        documentId: "doc-1",
        reviewPlan: REVIEW_PLAN,
        groupId: "group-1",
      }),
    ).rejects.toThrow("db down");
  });

  it("handles an empty review plan (field_count/review_field_count = 0)", async () => {
    await persistReviewPlan({
      documentId: "doc-1",
      reviewPlan: [],
      groupId: "group-1",
    });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { field_count: 0, review_field_count: 0 },
        }),
      }),
    );
  });
});
