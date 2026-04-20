import { NotFoundException } from "@nestjs/common";
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
    // F1 = 1.0 over the entire range [0.41, 0.70]; ties to smaller → 0.41.
    expect(field.suggestedBestBalance).toBeCloseTo(0.41, 2);
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

describe("BenchmarkErrorDetectionService.getAnalysis", () => {
  function makeService(run: unknown) {
    const prismaService = {
      prisma: {
        benchmarkRun: {
          findFirst: jest.fn().mockResolvedValue(run),
        },
      },
    };
    const svc = new BenchmarkErrorDetectionService(prismaService as never);
    return { svc, findFirst: prismaService.prisma.benchmarkRun.findFirst };
  }

  it("returns notReady when run has no perSampleResults", async () => {
    const { svc } = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: {},
    });
    const out = await svc.getAnalysis("p1", "r1");
    expect(out.notReady).toBe(true);
    expect(out.fields).toEqual([]);
    expect(out.excludedFields).toEqual([]);
    expect(out.runId).toBe("r1");
  });

  it("groups evaluationDetails by field and excludes fields with no confidence", async () => {
    const { svc } = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: {
        perSampleResults: [
          {
            sampleId: "s1",
            evaluationDetails: [
              { field: "name", matched: true, confidence: 0.9 },
              { field: "total", matched: false, confidence: 0.3 },
              { field: "notes", matched: true, confidence: null },
            ],
          },
          {
            sampleId: "s2",
            evaluationDetails: [
              { field: "name", matched: false, confidence: 0.4 },
              { field: "total", matched: true, confidence: 0.8 },
              { field: "notes", matched: false, confidence: null },
            ],
          },
        ],
      },
    });
    const out = await svc.getAnalysis("p1", "r1");
    expect(out.notReady).toBe(false);
    expect(out.fields.map((f) => f.name).sort()).toEqual(["name", "total"]);
    expect(out.excludedFields).toContain("notes");
    const name = out.fields.find((f) => f.name === "name")!;
    expect(name.evaluatedCount).toBe(2);
    expect(name.errorCount).toBe(1);
  });

  it("sorts fields by errorRate descending", async () => {
    const { svc } = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: {
        perSampleResults: [
          {
            sampleId: "s1",
            evaluationDetails: [
              { field: "low", matched: true, confidence: 0.9 },
              { field: "high", matched: false, confidence: 0.9 },
              { field: "high", matched: false, confidence: 0.9 },
              { field: "low", matched: true, confidence: 0.9 },
            ],
          },
        ],
      },
    });
    const out = await svc.getAnalysis("p1", "r1");
    expect(out.fields.map((f) => f.name)).toEqual(["high", "low"]);
  });

  it("throws NotFoundException when run does not exist", async () => {
    const { svc } = makeService(null);
    await expect(svc.getAnalysis("p1", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("caches results by runId across calls", async () => {
    const { svc, findFirst } = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: { perSampleResults: [] },
    });
    await svc.getAnalysis("p1", "r1");
    await svc.getAnalysis("p1", "r1");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("invalidate(runId) drops the cache entry", async () => {
    const { svc, findFirst } = makeService({
      id: "r1",
      projectId: "p1",
      status: "completed",
      metrics: { perSampleResults: [] },
    });
    await svc.getAnalysis("p1", "r1");
    svc.invalidate("r1");
    await svc.getAnalysis("p1", "r1");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
