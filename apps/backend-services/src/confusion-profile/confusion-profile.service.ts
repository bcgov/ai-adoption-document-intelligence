/**
 * Confusion Profile Service
 *
 * CRUD operations and derivation logic for confusion profiles.
 * Derives character-level confusion matrices from HITL corrections
 * and benchmark run mismatches, with source examples and field counts.
 */

import { CorrectionAction, Prisma } from "@generated/client";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import type { ConfusionProfileResponseDto } from "./dto";

export interface CorrectionPair {
  originalValue: string;
  correctedValue: string;
  fieldKey: string;
}

interface CreateProfileInput {
  name: string;
  description?: string;
  matrix: Record<string, Record<string, number>>;
  metadata?: Record<string, unknown>;
  groupId: string;
}

interface UpdateProfileInput {
  name?: string;
  description?: string;
  matrix?: Record<string, Record<string, number>>;
  metadata?: Record<string, unknown>;
}

interface DeriveSources {
  templateModelIds?: string[];
  benchmarkRunIds?: string[];
  fieldKeys?: string[];
  startDate?: string;
  endDate?: string;
}

interface DeriveAndSaveInput {
  name: string;
  description?: string;
  groupId: string;
  sources?: DeriveSources;
}

/** Example of a character confusion occurrence. */
interface ConfusionExample {
  fieldKey: string;
  predicted: string;
  expected: string;
}

const MAX_EXAMPLES_PER_PAIR = 5;

@Injectable()
export class ConfusionProfileService {
  private readonly logger = new Logger(ConfusionProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ────────────────────────────────────────────────────────────

  async create(
    input: CreateProfileInput,
  ): Promise<ConfusionProfileResponseDto> {
    const profile = await this.prisma.prisma.confusionProfile.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        matrix: input.matrix as Prisma.InputJsonValue,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        group_id: input.groupId,
      },
    });
    return this.toDto(profile);
  }

  async findByGroup(groupId: string): Promise<ConfusionProfileResponseDto[]> {
    const profiles = await this.prisma.prisma.confusionProfile.findMany({
      where: { group_id: groupId },
      orderBy: { updated_at: "desc" },
    });
    return profiles.map((p) => this.toDto(p));
  }

  async findById(id: string): Promise<ConfusionProfileResponseDto> {
    const profile = await this.prisma.prisma.confusionProfile.findUnique({
      where: { id },
    });
    if (!profile) {
      throw new NotFoundException(`Confusion profile "${id}" not found`);
    }
    return this.toDto(profile);
  }

  async update(
    id: string,
    input: UpdateProfileInput,
  ): Promise<ConfusionProfileResponseDto> {
    // Ensure profile exists
    await this.findById(id);

    const data: Prisma.ConfusionProfileUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.matrix !== undefined)
      data.matrix = input.matrix as Prisma.InputJsonValue;
    if (input.metadata !== undefined)
      data.metadata = input.metadata as Prisma.InputJsonValue;

    const updated = await this.prisma.prisma.confusionProfile.update({
      where: { id },
      data,
    });
    return this.toDto(updated);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.prisma.confusionProfile.delete({ where: { id } });
  }

  // ── Derivation ──────────────────────────────────────────────────────

  async deriveAndSave(
    input: DeriveAndSaveInput,
  ): Promise<ConfusionProfileResponseDto> {
    this.logger.log(
      `Deriving confusion profile "${input.name}" for group ${input.groupId}`,
    );

    const pairs = await this.gatherCorrectionPairs(
      input.groupId,
      input.sources,
    );

    // Compute matrix with examples tracking
    const { matrix, examples, fieldCounts } =
      this.computeMatrixWithExamples(pairs);

    const metadata: Record<string, unknown> = {
      derivedAt: new Date().toISOString(),
      sources: input.sources ?? { allHitlCorrections: true },
      pairCount: pairs.length,
      examples,
      fieldCounts,
    };

    return this.create({
      name: input.name,
      description: input.description,
      matrix,
      metadata,
      groupId: input.groupId,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Gather correction pairs from HITL corrections and benchmark run mismatches.
   */
  private async gatherCorrectionPairs(
    groupId: string,
    sources?: DeriveSources,
  ): Promise<CorrectionPair[]> {
    // Resolve template model IDs to field keys
    const resolvedFieldKeys = await this.resolveFieldKeys(sources);

    const pairs: CorrectionPair[] = [];

    // 1. HITL corrections
    const hitlPairs = await this.fetchHitlCorrectionPairs(
      groupId,
      sources,
      resolvedFieldKeys,
    );
    pairs.push(...hitlPairs);

    // 2. Benchmark run mismatches
    if (sources?.benchmarkRunIds && sources.benchmarkRunIds.length > 0) {
      const mismatchPairs = await this.fetchBenchmarkMismatchPairs(
        sources.benchmarkRunIds,
        resolvedFieldKeys.length > 0 ? resolvedFieldKeys : sources?.fieldKeys,
      );
      pairs.push(...mismatchPairs);
    }

    this.logger.log(
      `Gathered ${pairs.length} correction pairs (${hitlPairs.length} HITL` +
        `${sources?.benchmarkRunIds?.length ? `, ${pairs.length - hitlPairs.length} benchmark mismatches` : ""})`,
    );

    return pairs;
  }

  /**
   * Resolve template model IDs to field keys by loading field_schema.
   * If both templateModelIds and fieldKeys are provided, intersects them.
   */
  private async resolveFieldKeys(sources?: DeriveSources): Promise<string[]> {
    const explicitFieldKeys = sources?.fieldKeys ?? [];

    if (!sources?.templateModelIds?.length) {
      return explicitFieldKeys;
    }

    const templateModels = await this.prisma.prisma.templateModel.findMany({
      where: { id: { in: sources.templateModelIds } },
      include: { field_schema: { select: { field_key: true } } },
    });
    const tmFieldKeys = templateModels.flatMap((tm) =>
      tm.field_schema.map((f) => f.field_key),
    );

    if (explicitFieldKeys.length > 0) {
      return explicitFieldKeys.filter((k) => tmFieldKeys.includes(k));
    }
    return tmFieldKeys;
  }

  /**
   * Fetch HITL correction pairs, optionally filtered by resolved field keys and date.
   */
  private async fetchHitlCorrectionPairs(
    groupId: string,
    sources?: DeriveSources,
    resolvedFieldKeys?: string[],
  ): Promise<CorrectionPair[]> {
    const where: Prisma.FieldCorrectionWhereInput = {
      action: CorrectionAction.corrected,
      original_value: { not: null },
      corrected_value: { not: null },
      session: {
        document: {
          group_id: groupId,
        },
      },
    };

    if (sources?.startDate || sources?.endDate) {
      where.created_at = {};
      if (sources?.startDate)
        where.created_at.gte = new Date(sources.startDate);
      if (sources?.endDate) where.created_at.lte = new Date(sources.endDate);
    }

    if (resolvedFieldKeys && resolvedFieldKeys.length > 0) {
      where.field_key = { in: resolvedFieldKeys };
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

  /**
   * Extract mismatch pairs from benchmark run perSampleResults.evaluationDetails.
   */
  private async fetchBenchmarkMismatchPairs(
    benchmarkRunIds: string[],
    fieldKeys?: string[],
  ): Promise<CorrectionPair[]> {
    const runs = await this.prisma.prisma.benchmarkRun.findMany({
      where: { id: { in: benchmarkRunIds }, status: "completed" },
      select: { id: true, metrics: true },
    });

    const pairs: CorrectionPair[] = [];

    for (const run of runs) {
      const metrics = run.metrics as Record<string, unknown> | null;
      const perSampleResults = (
        Array.isArray(metrics?.perSampleResults) ? metrics.perSampleResults : []
      ) as Array<{
        sampleId: string;
        evaluationDetails?: Array<{
          field: string;
          matched: boolean;
          expected?: unknown;
          predicted?: unknown;
        }>;
      }>;

      for (const sample of perSampleResults) {
        if (!Array.isArray(sample.evaluationDetails)) continue;
        for (const detail of sample.evaluationDetails) {
          if (detail.matched) continue;
          if (fieldKeys?.length && !fieldKeys.includes(detail.field)) continue;

          const predicted = String(detail.predicted ?? "");
          const expected = String(detail.expected ?? "");
          if (!predicted || !expected || predicted === expected) continue;

          pairs.push({
            originalValue: predicted,
            correctedValue: expected,
            fieldKey: detail.field,
          });
        }
      }
    }

    return pairs;
  }

  /**
   * Compute matrix from pairs while tracking per-pair examples and field counts.
   */
  private computeMatrixWithExamples(pairs: CorrectionPair[]): {
    matrix: Record<string, Record<string, number>>;
    examples: Record<string, Record<string, ConfusionExample[]>>;
    fieldCounts: Record<string, Record<string, number>>;
  } {
    const matrix: Record<string, Record<string, number>> = {};
    const examples: Record<string, Record<string, ConfusionExample[]>> = {};
    const fieldSets: Record<string, Record<string, Set<string>>> = {};

    for (const pair of pairs) {
      if (!pair.originalValue || !pair.correctedValue) continue;
      if (pair.originalValue === pair.correctedValue) continue;

      const confusions = this.alignAndDiff(
        pair.originalValue,
        pair.correctedValue,
      );

      for (const { trueChar, recognizedChar } of confusions) {
        // Matrix count
        if (!matrix[trueChar]) matrix[trueChar] = {};
        matrix[trueChar][recognizedChar] =
          (matrix[trueChar][recognizedChar] ?? 0) + 1;

        // Examples (up to MAX_EXAMPLES_PER_PAIR per char pair)
        if (!examples[trueChar]) examples[trueChar] = {};
        if (!examples[trueChar][recognizedChar])
          examples[trueChar][recognizedChar] = [];
        if (examples[trueChar][recognizedChar].length < MAX_EXAMPLES_PER_PAIR) {
          examples[trueChar][recognizedChar].push({
            fieldKey: pair.fieldKey,
            predicted: pair.originalValue,
            expected: pair.correctedValue,
          });
        }

        // Field count tracking
        if (!fieldSets[trueChar]) fieldSets[trueChar] = {};
        if (!fieldSets[trueChar][recognizedChar])
          fieldSets[trueChar][recognizedChar] = new Set();
        fieldSets[trueChar][recognizedChar].add(pair.fieldKey);
      }
    }

    // Convert field sets to counts
    const fieldCounts: Record<string, Record<string, number>> = {};
    for (const [trueChar, recognized] of Object.entries(fieldSets)) {
      fieldCounts[trueChar] = {};
      for (const [recognizedChar, fieldSet] of Object.entries(recognized)) {
        fieldCounts[trueChar][recognizedChar] = fieldSet.size;
      }
    }

    return { matrix, examples, fieldCounts };
  }

  private alignAndDiff(
    original: string,
    corrected: string,
  ): Array<{ trueChar: string; recognizedChar: string }> {
    if (original.length === corrected.length) {
      const diffs: Array<{ trueChar: string; recognizedChar: string }> = [];
      for (let i = 0; i < original.length; i++) {
        if (original[i] !== corrected[i]) {
          diffs.push({ trueChar: corrected[i], recognizedChar: original[i] });
        }
      }
      return diffs;
    }

    // Use Levenshtein backtrace for unequal-length strings
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

  private toDto(profile: {
    id: string;
    name: string;
    description: string | null;
    matrix: Prisma.JsonValue;
    metadata: Prisma.JsonValue;
    group_id: string;
    created_at: Date;
    updated_at: Date;
  }): ConfusionProfileResponseDto {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      matrix: profile.matrix as Record<string, Record<string, number>>,
      metadata: profile.metadata as Record<string, unknown> | null,
      groupId: profile.group_id,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }
}
