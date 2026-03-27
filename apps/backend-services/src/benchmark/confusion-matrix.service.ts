/**
 * Confusion Matrix Service
 *
 * Derives character-level confusion matrices from HITL correction data.
 * Compares original OCR values vs corrected values to identify systematic
 * character recognition errors.
 *
 * See docs-md/OCR_CONFUSION_MATRICES.md for format and usage.
 */

import { CorrectionAction, type Prisma } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface ConfusionMatrixEntry {
  true: string;
  recognized: string;
  count: number;
}

export interface ConfusionMatrixResult {
  schemaVersion: "1.0";
  type: "character";
  metadata: {
    generatedAt: string;
    sampleCount: number;
    fieldCount: number;
    filters: ConfusionMatrixFilters;
  };
  matrix: Record<string, Record<string, number>>;
  totals: {
    totalConfusions: number;
    uniquePairs: number;
    topConfusions: ConfusionMatrixEntry[];
  };
}

export interface ConfusionMatrixFilters {
  startDate?: string;
  endDate?: string;
  groupIds?: string[];
  fieldKeys?: string[];
}

export interface CorrectionPair {
  originalValue: string;
  correctedValue: string;
  fieldKey: string;
}

@Injectable()
export class ConfusionMatrixService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Derive a confusion matrix from HITL correction data matching the given filters.
   */
  async deriveFromHitlCorrections(
    filters: ConfusionMatrixFilters,
  ): Promise<ConfusionMatrixResult> {
    const pairs = await this.fetchCorrectionPairs(filters);
    return this.computeFromPairs(pairs, filters);
  }

  /**
   * Compute a confusion matrix from pre-collected (original, corrected) pairs.
   */
  computeFromPairs(
    pairs: CorrectionPair[],
    filters: ConfusionMatrixFilters = {},
  ): ConfusionMatrixResult {
    const matrix: Record<string, Record<string, number>> = {};
    let fieldCount = 0;

    for (const { originalValue, correctedValue } of pairs) {
      if (!originalValue || !correctedValue) continue;
      if (originalValue === correctedValue) continue;

      fieldCount++;
      const confusions = this.alignAndDiff(originalValue, correctedValue);
      for (const { trueChar, recognizedChar } of confusions) {
        if (!matrix[trueChar]) {
          matrix[trueChar] = {};
        }
        matrix[trueChar][recognizedChar] =
          (matrix[trueChar][recognizedChar] ?? 0) + 1;
      }
    }

    const entries: ConfusionMatrixEntry[] = [];
    let totalConfusions = 0;
    for (const [trueChar, recognized] of Object.entries(matrix)) {
      for (const [recognizedChar, count] of Object.entries(recognized)) {
        entries.push({ true: trueChar, recognized: recognizedChar, count });
        totalConfusions += count;
      }
    }

    entries.sort((a, b) => b.count - a.count);

    return {
      schemaVersion: "1.0",
      type: "character",
      metadata: {
        generatedAt: new Date().toISOString(),
        sampleCount: pairs.length,
        fieldCount,
        filters,
      },
      matrix,
      totals: {
        totalConfusions,
        uniquePairs: entries.length,
        topConfusions: entries.slice(0, 20),
      },
    };
  }

  /**
   * Align two strings and return character-level substitutions.
   * Uses a simple character-by-character comparison on equal-length strings;
   * for different-length strings, uses Levenshtein edit-distance alignment
   * to identify substitutions (ignoring insertions/deletions for the matrix).
   */
  alignAndDiff(
    original: string,
    corrected: string,
  ): Array<{ trueChar: string; recognizedChar: string }> {
    if (original.length === corrected.length) {
      return this.diffEqualLength(original, corrected);
    }
    return this.diffWithAlignment(original, corrected);
  }

  private diffEqualLength(
    original: string,
    corrected: string,
  ): Array<{ trueChar: string; recognizedChar: string }> {
    const diffs: Array<{ trueChar: string; recognizedChar: string }> = [];
    for (let i = 0; i < original.length; i++) {
      if (original[i] !== corrected[i]) {
        diffs.push({ trueChar: corrected[i], recognizedChar: original[i] });
      }
    }
    return diffs;
  }

  /**
   * Use Levenshtein backtrace to find substitutions between unequal-length strings.
   */
  private diffWithAlignment(
    original: string,
    corrected: string,
  ): Array<{ trueChar: string; recognizedChar: string }> {
    const m = original.length;
    const n = corrected.length;

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0),
    );
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (original[i - 1] === corrected[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    const diffs: Array<{ trueChar: string; recognizedChar: string }> = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (original[i - 1] === corrected[j - 1]) {
        i--;
        j--;
      } else if (dp[i][j] === dp[i - 1][j - 1] + 1) {
        diffs.push({
          trueChar: corrected[j - 1],
          recognizedChar: original[i - 1],
        });
        i--;
        j--;
      } else if (dp[i][j] === dp[i - 1][j] + 1) {
        i--;
      } else {
        j--;
      }
    }

    return diffs;
  }

  private async fetchCorrectionPairs(
    filters: ConfusionMatrixFilters,
  ): Promise<CorrectionPair[]> {
    const where: Prisma.FieldCorrectionWhereInput = {
      action: CorrectionAction.corrected,
      original_value: { not: null },
      corrected_value: { not: null },
    };

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = new Date(filters.startDate);
      if (filters.endDate) where.created_at.lte = new Date(filters.endDate);
    }

    if (filters.groupIds && filters.groupIds.length > 0) {
      where.session = {
        document: { group_id: { in: filters.groupIds } },
      };
    }

    if (filters.fieldKeys && filters.fieldKeys.length > 0) {
      where.field_key = { in: filters.fieldKeys };
    }

    const corrections = await this.prisma.prisma.fieldCorrection.findMany({
      where,
      select: {
        field_key: true,
        original_value: true,
        corrected_value: true,
      },
      take: 10000,
    });

    return corrections
      .filter((c) => c.original_value && c.corrected_value)
      .map((c) => ({
        originalValue: c.original_value!,
        correctedValue: c.corrected_value!,
        fieldKey: c.field_key,
      }));
  }
}
