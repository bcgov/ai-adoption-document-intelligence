import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import {
  ErrorDetectionAnalysisResponseDto,
  ErrorDetectionCurvePointDto,
  ErrorDetectionFieldDto,
} from "./dto";

export interface FieldInstance {
  confidence: number | null;
  correct: boolean;
}

interface PartitionResult {
  evaluable: Array<{ confidence: number; correct: boolean }>;
  /** true iff zero evaluable instances remain after filtering */
  excludedReason: boolean;
}

@Injectable()
export class BenchmarkErrorDetectionService {
  protected readonly cache = new Map<
    string,
    ErrorDetectionAnalysisResponseDto
  >();

  constructor(protected readonly prismaService: PrismaService) {}

  /** Drop instances missing confidence; report whether the field has zero evaluable. */
  partitionInstances(instances: FieldInstance[]): PartitionResult {
    const evaluable: Array<{ confidence: number; correct: boolean }> = [];
    for (const i of instances) {
      if (typeof i.confidence === "number" && !Number.isNaN(i.confidence)) {
        evaluable.push({ confidence: i.confidence, correct: i.correct });
      }
    }
    return { evaluable, excludedReason: evaluable.length === 0 };
  }

  /** Compute the full (tp, fp, fn, tn) curve and suggested thresholds for a single field. */
  computeField(
    name: string,
    instances: Array<{ confidence: number; correct: boolean }>,
  ): ErrorDetectionFieldDto {
    const evaluatedCount = instances.length;
    const errorCount = instances.filter((i) => !i.correct).length;
    const errorRate = evaluatedCount === 0 ? 0 : errorCount / evaluatedCount;

    const curve: ErrorDetectionCurvePointDto[] = [];
    for (let step = 0; step <= 100; step++) {
      const threshold = step / 100;
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (const inst of instances) {
        const flagged = inst.confidence < threshold;
        if (flagged && !inst.correct) tp++;
        else if (flagged && inst.correct) fp++;
        else if (!flagged && !inst.correct) fn++;
        else tn++;
      }
      curve.push({ threshold, tp, fp, fn, tn });
    }

    return {
      name,
      evaluatedCount,
      errorCount,
      errorRate,
      curve,
      suggestedCatch90: this.findSmallestThresholdForRecall(curve, 0.9),
      suggestedBestBalance: this.findBestF1Threshold(curve),
      suggestedMinimizeReview: this.findLargestThresholdForFprCap(curve, 0.1),
    };
  }

  /**
   * Build the error-detection analysis for a run. Cached by runId.
   */
  async getAnalysis(
    projectId: string,
    runId: string,
  ): Promise<ErrorDetectionAnalysisResponseDto> {
    const cached = this.cache.get(runId);
    if (cached) return cached;

    const run = await this.prismaService.prisma.benchmarkRun.findFirst({
      where: { id: runId, projectId },
    });
    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    const metrics = (run.metrics ?? {}) as Record<string, unknown>;
    const perSampleResults = (metrics.perSampleResults ?? []) as Array<{
      sampleId: string;
      evaluationDetails?: unknown;
    }>;

    if (!perSampleResults.length) {
      const empty: ErrorDetectionAnalysisResponseDto = {
        runId: run.id,
        notReady: true,
        fields: [],
        excludedFields: [],
      };
      this.cache.set(runId, empty);
      return empty;
    }

    // Group instances by field name.
    const byField = new Map<string, FieldInstance[]>();
    for (const sample of perSampleResults) {
      const details = Array.isArray(sample.evaluationDetails)
        ? (sample.evaluationDetails as Array<{
            field: string;
            matched: boolean;
            confidence?: number | null;
          }>)
        : [];
      for (const d of details) {
        if (!d || typeof d.field !== "string") continue;
        if (!byField.has(d.field)) byField.set(d.field, []);
        byField.get(d.field)!.push({
          confidence: typeof d.confidence === "number" ? d.confidence : null,
          correct: d.matched === true,
        });
      }
    }

    const fields: ErrorDetectionFieldDto[] = [];
    const excludedFields: string[] = [];
    for (const [name, instances] of byField.entries()) {
      const { evaluable, excludedReason } = this.partitionInstances(instances);
      if (excludedReason) {
        excludedFields.push(name);
        continue;
      }
      fields.push(this.computeField(name, evaluable));
    }

    fields.sort((a, b) => b.errorRate - a.errorRate);
    excludedFields.sort();

    const result: ErrorDetectionAnalysisResponseDto = {
      runId: run.id,
      notReady: false,
      fields,
      excludedFields,
    };
    this.cache.set(runId, result);
    return result;
  }

  /** Public cache invalidation hook. */
  invalidate(runId: string): void {
    this.cache.delete(runId);
  }

  private findSmallestThresholdForRecall(
    curve: ErrorDetectionCurvePointDto[],
    target: number,
  ): number | null {
    for (const p of curve) {
      const denom = p.tp + p.fn;
      if (denom === 0) continue;
      if (p.tp / denom >= target) return p.threshold;
    }
    return null;
  }

  private findBestF1Threshold(curve: ErrorDetectionCurvePointDto[]): number {
    let best = curve[0].threshold;
    let bestF1 = -1;
    for (const p of curve) {
      const precision = p.tp + p.fp === 0 ? 0 : p.tp / (p.tp + p.fp);
      const recall = p.tp + p.fn === 0 ? 0 : p.tp / (p.tp + p.fn);
      const f1 =
        precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall);
      if (f1 > bestF1) {
        bestF1 = f1;
        best = p.threshold;
      }
    }
    return best;
  }

  private findLargestThresholdForFprCap(
    curve: ErrorDetectionCurvePointDto[],
    cap: number,
  ): number | null {
    let best: number | null = null;
    for (const p of curve) {
      const denom = p.fp + p.tn;
      const fpr = denom === 0 ? 0 : p.fp / denom;
      if (fpr <= cap) best = p.threshold;
    }
    return best;
  }
}
