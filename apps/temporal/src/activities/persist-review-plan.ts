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
  groupId?: string;
}

export async function persistReviewPlan(
  params: PersistReviewPlanParams,
): Promise<void> {
  const activityName = "persistReviewPlan";
  const { documentId, reviewPlan } = params;
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

    // In benchmark mode, the documentId has a "benchmark-" prefix and no
    // corresponding document record exists in the DB. Detect this early and
    // skip the Prisma operations to avoid noisy FK-constraint error logs
    // (same pattern as upsertOcrResult).
    if (documentId.startsWith("benchmark-")) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) {
        const duration = Date.now() - startTime;
        log.info("Persist review plan skipped", {
          event: "skipped",
          reason: "benchmark_mode_no_document",
          durationMs: duration,
        });
        return;
      }
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        review_plan: reviewPlan as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      await prisma.auditEvent.create({
        data: {
          event_type: "document_review_plan_updated",
          resource_type: "document",
          resource_id: documentId,
          document_id: documentId,
          group_id: params.groupId ?? null,
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

    // P2003 = FK constraint violation, P2025 = record not found.
    // In benchmark mode the document doesn't exist in the DB, so DB writes
    // are expected to fail. Log and move on.
    const prismaCode =
      error instanceof Error && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (prismaCode === "P2003" || prismaCode === "P2025") {
      log.info("Persist review plan skipped", {
        event: "skipped",
        reason: "document_not_found",
        durationMs: duration,
      });
      return;
    }

    log.error("Persist review plan error", {
      event: "error",
      error: getErrorMessage(error),
      durationMs: duration,
      stack: getErrorStack(error),
    });
    throw error;
  }
}
