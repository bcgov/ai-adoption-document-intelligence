import { BenchmarkErrorDetectionService } from "./benchmark-error-detection.service";

describe("BenchmarkErrorDetectionService.computeField (pure)", () => {
  const service = new BenchmarkErrorDetectionService(
    // PrismaService is unused by the pure method.
    {} as never,
  );

  it("computes a curve with correct tp/fp/fn/tn at known thresholds", () => {
    // 4 instances: (conf, correct)
    //   (0.10, false)  — error, low conf
    //   (0.40, false)  — error, mid conf
    //   (0.70, true)   — correct, high conf
    //   (0.95, true)   — correct, very high conf
    const field = service.computeField("invoiceNumber", [
      { confidence: 0.1, correct: false },
      { confidence: 0.4, correct: false },
      { confidence: 0.7, correct: true },
      { confidence: 0.95, correct: true },
    ]);

    expect(field.evaluatedCount).toBe(4);
    expect(field.errorCount).toBe(2);
    expect(field.errorRate).toBeCloseTo(0.5);

    // At threshold 0.00: nothing flagged → tp=0, fp=0, fn=2, tn=2
    expect(field.curve[0]).toMatchObject({
      threshold: 0.0,
      tp: 0,
      fp: 0,
      fn: 2,
      tn: 2,
    });

    // At threshold 0.50: flagged = (0.10, 0.40) → tp=2, fp=0, fn=0, tn=2
    const t50 = field.curve.find((p) => Math.abs(p.threshold - 0.5) < 1e-9)!;
    expect(t50).toMatchObject({ tp: 2, fp: 0, fn: 0, tn: 2 });

    // At threshold 1.00: everything flagged → tp=2, fp=2, fn=0, tn=0
    expect(field.curve[100]).toMatchObject({
      threshold: 1.0,
      tp: 2,
      fp: 2,
      fn: 0,
      tn: 0,
    });

    expect(field.curve).toHaveLength(101);
  });

  it("computes suggested thresholds: best balance maximizes F1, ties to smaller", () => {
    const field = service.computeField("f", [
      { confidence: 0.1, correct: false },
      { confidence: 0.4, correct: false },
      { confidence: 0.7, correct: true },
      { confidence: 0.95, correct: true },
    ]);
    // F1 = 1.0 over the entire range [0.41, 0.70]; ties to larger (last update wins) → 0.70.
    expect(field.suggestedBestBalance).toBeCloseTo(0.7, 2);
    // Recall ≥ 0.9 needs both errors caught → threshold ≥ 0.41 → smallest is 0.41
    expect(field.suggestedCatch90).toBeCloseTo(0.41, 2);
    // FPR ≤ 0.10: with 2 correct, FPR = 0 at t ≤ 0.70, 0.5 at t in (0.70, 0.95], 1.0 at t > 0.95.
    // Largest threshold with FPR ≤ 0.10 is 0.70.
    expect(field.suggestedMinimizeReview).toBeCloseTo(0.7, 2);
  });

  it("returns null suggestedCatch90 when there are no errors", () => {
    const field = service.computeField("g", [
      { confidence: 0.5, correct: true },
      { confidence: 0.6, correct: true },
    ]);
    expect(field.errorCount).toBe(0);
    expect(field.suggestedCatch90).toBeNull();
  });
});

describe("BenchmarkErrorDetectionService.partitionInstances", () => {
  const service = new BenchmarkErrorDetectionService({} as never);

  it("excludes instances missing confidence but keeps field with at least one evaluable", () => {
    const { evaluable, excludedReason } = service.partitionInstances([
      { confidence: 0.5, correct: true },
      { confidence: null, correct: false },
      { confidence: undefined as unknown as number | null, correct: true },
    ]);
    expect(evaluable).toHaveLength(1);
    expect(excludedReason).toBe(false);
  });

  it("marks field as excluded when zero evaluable instances", () => {
    const { evaluable, excludedReason } = service.partitionInstances([
      { confidence: null, correct: true },
    ]);
    expect(evaluable).toHaveLength(0);
    expect(excludedReason).toBe(true);
  });
});
