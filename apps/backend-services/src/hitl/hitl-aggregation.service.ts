/**
 * HITL Correction Aggregation Service
 *
 * Provides aggregated per-field correction data suitable for AI consumption.
 * The existing analytics endpoints only return high-level counts; this service
 * returns individual (field_key, original_value, corrected_value) tuples.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-03-ai-hitl-processing-tool-selection.md
 */

import { CorrectionAction, type Prisma } from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface HitlCorrectionRecord {
  fieldKey: string;
  originalValue: string;
  correctedValue: string;
  action: string;
  originalConfidence: number | null;
  sessionId: string;
  documentId: string;
  createdAt: Date;
}

export interface HitlAggregationFilters {
  startDate?: Date;
  endDate?: Date;
  groupIds?: string[];
  fieldKeys?: string[];
  actions?: string[];
  limit?: number;
}

export interface HitlAggregationResult {
  corrections: HitlCorrectionRecord[];
  total: number;
  filters: HitlAggregationFilters;
}

@Injectable()
export class HitlAggregationService {
  private readonly logger = new Logger(HitlAggregationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch aggregated per-field correction records matching the given filters.
   * Returns individual correction tuples suitable for AI recommendation input.
   */
  async getAggregatedCorrections(
    filters: HitlAggregationFilters,
  ): Promise<HitlAggregationResult> {
    const where: Prisma.FieldCorrectionWhereInput = {};

    if (filters.actions && filters.actions.length > 0) {
      where.action = {
        in: filters.actions as CorrectionAction[],
      };
    } else {
      // Default to reviewed HITL rows that can still inform OCR improvement.
      // Confirmed rows often capture a reviewer-validated value alongside corrected ones.
      where.action = {
        in: [CorrectionAction.confirmed, CorrectionAction.corrected],
      };
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = filters.startDate;
      if (filters.endDate) where.created_at.lte = filters.endDate;
    }

    if (filters.groupIds && filters.groupIds.length > 0) {
      where.session = {
        document: { group_id: { in: filters.groupIds } },
      };
    }

    if (filters.fieldKeys && filters.fieldKeys.length > 0) {
      where.field_key = { in: filters.fieldKeys };
    }

    // Do not use Prisma startsWith("_") here: in PostgreSQL LIKE '_%' treats _
    // as a wildcard, so NOT LIKE '_%' matches only the empty string. We exclude
    // internal fields (keys starting with "_") in application code below.

    const limit = Math.min(filters.limit ?? 5000, 10000);

    const corrections = await this.prisma.prisma.fieldCorrection.findMany({
      where,
      select: {
        field_key: true,
        original_value: true,
        corrected_value: true,
        action: true,
        original_conf: true,
        created_at: true,
        session_id: true,
        session: {
          select: {
            document_id: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    const records: HitlCorrectionRecord[] = corrections
      .filter(
        (c) =>
          !c.field_key.startsWith("_") &&
          c.original_value != null &&
          c.corrected_value != null,
      )
      .map((c) => ({
        fieldKey: c.field_key,
        originalValue: c.original_value!,
        correctedValue: c.corrected_value!,
        action: c.action,
        originalConfidence: c.original_conf,
        sessionId: c.session_id,
        documentId: c.session.document_id,
        createdAt: c.created_at,
      }));

    this.logger.debug(
      `Aggregated ${records.length} corrections (after excluding internal fields)`,
    );
    if (records.length === 0) {
      this.logger.log(
        `HITL aggregation returned 0 corrections; filters used: ${JSON.stringify(filters)}`,
      );
    }

    return {
      corrections: records,
      total: records.length,
      filters,
    };
  }

  /**
   * Get correction pattern summary: groups corrections by field_key and
   * counts occurrences of each (original→corrected) transformation.
   */
  async getCorrectionPatterns(filters: HitlAggregationFilters): Promise<
    Array<{
      fieldKey: string;
      originalValue: string;
      correctedValue: string;
      count: number;
    }>
  > {
    const { corrections } = await this.getAggregatedCorrections(filters);

    const patternMap = new Map<
      string,
      {
        fieldKey: string;
        originalValue: string;
        correctedValue: string;
        count: number;
      }
    >();

    for (const c of corrections) {
      const key = `${c.fieldKey}|${c.originalValue}|${c.correctedValue}`;
      const existing = patternMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternMap.set(key, {
          fieldKey: c.fieldKey,
          originalValue: c.originalValue,
          correctedValue: c.correctedValue,
          count: 1,
        });
      }
    }

    return Array.from(patternMap.values()).sort((a, b) => b.count - a.count);
  }
}
