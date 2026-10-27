/**
 * Activity: Persist the HITL review plan onto the document
 *
 * Stores the per-field review/skip plan produced by
 * `hitl.applyReviewCriteria` on `Document.review_plan` so the review UI can
 * default to showing only the fields a reviewer needs to look at (and why).
 *
 * Also records a best-effort `audit_events` row. Audit failures never fail
 * the main update — the review plan write is the operation that matters.
 *
 * See docs-md/architecture/HITL_REVIEW_CRITERIA.md
 */

import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import type { Prisma } from "@generated/client";
import { createActivityLogger } from "../logger";
import { getPrismaClient } from "./database-client";
import type { ReviewPlanEntry } from "./hitl-apply-review-criteria";

export interface PersistReviewPlanParams {
  documentId: string;
  reviewPlan: ReviewPlanEntry[];
  /** Group of the running workflow; only that group's document is updated. */
  groupId?: string | null;
}

export async function persistReviewPlan(
  params: PersistReviewPlanParams,
): Promise<void> {
  const activityName = "persistReviewPlan";
  const { documentId, reviewPlan, groupId } = params;
  if (!groupId) {
    throw new Error(
      `groupId is required to persist the review plan for document ${documentId}`,
    );
  }
  const log = createActivityLogger(activityName, { documentId });
  const startTime = Date.now();

  const fieldCount = reviewPlan.length;
  const reviewFieldCount = reviewPlan.filter(
    (entry) => entry.decision === "review",
  ).length;

  log.info("Persist review plan start", {
    event: "start",
    fieldCount,
    reviewFieldCount,
  });

  try {
    const prisma = getPrismaClient();

    const { count } = await prisma.document.updateMany({
      where: { id: documentId, group_id: groupId },
      data: {
        review_plan: reviewPlan as unknown as Prisma.InputJsonValue,
      },
    });

    // No row matches in this group. Benchmark runs use synthetic
    // "benchmark-" document ids with no document record, so this is expected
    // there. Log and move on without an audit event.
    if (count === 0) {
      const duration = Date.now() - startTime;
      log.info("Persist review plan skipped", {
        event: "skipped",
        reason: "document_not_found",
        durationMs: duration,
      });
      return;
    }

    try {
      await prisma.auditEvent.create({
        data: {
          event_type: "document_review_plan_updated",
          resource_type: "document",
          resource_id: documentId,
          document_id: documentId,
          group_id: groupId,
          payload: {
            field_count: fieldCount,
            review_field_count: reviewFieldCount,
          },
        },
      });
    } catch (auditError) {
      log.error("Persist review plan: audit event failed", {
        event: "audit_error",
        error: getErrorMessage(auditError),
        stack: getErrorStack(auditError),
      });
    }

    log.info("Persist review plan complete", {
      event: "complete",
      fieldCount,
      reviewFieldCount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Persist review plan error", {
      event: "error",
      error: getErrorMessage(error),
      durationMs: duration,
      stack: getErrorStack(error),
    });
    throw error;
  }
}
