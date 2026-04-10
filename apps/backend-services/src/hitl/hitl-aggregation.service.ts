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
    const where: Prisma.FieldCorrectionWhereInput = {
      original_value: { not: null },
      corrected_value: { not: null },
    };

    const fieldKeyAnd: Prisma.FieldCorrectionWhereInput[] = [
      { field_key: { not: { startsWith: "_" } } },
    ];
    if (filters.fieldKeys && filters.fieldKeys.length > 0) {
      fieldKeyAnd.push({ field_key: { in: filters.fieldKeys } });
    }
    where.AND = fieldKeyAnd;

    if (filters.actions && filters.actions.length > 0) {
      where.action = {
        in: filters.actions as CorrectionAction[],
      };
    } else {
      // Default to rows where the reviewer changed the value — these carry error signal
      // for OCR improvement. `confirmed` means the OCR output was accepted as-is (often
      // original === corrected), so they consume `take` limit without helping recommendations.
      // Pass `actions` explicitly if you need confirmed rows too.
      where.action = {
        in: [CorrectionAction.corrected],
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

    const records: HitlCorrectionRecord[] = corrections.map((c) => ({
      fieldKey: c.field_key,
      originalValue: c.original_value!,
      correctedValue: c.corrected_value!,
      action: c.action,
      originalConfidence: c.original_conf,
      sessionId: c.session_id,
      documentId: c.session.document_id,
      createdAt: c.created_at,
    }));

    this.logger.debug(`Aggregated ${records.length} corrections`);
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
}
