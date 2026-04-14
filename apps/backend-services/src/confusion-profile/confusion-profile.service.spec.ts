/**
 * Unit tests for ConfusionProfileService.
 *
 * Tests CRUD operations (with mocked PrismaService) and
 * deriveAndSave (with mocked PrismaService).
 */

import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { ConfusionProfileService } from "./confusion-profile.service";

// ── Helpers ──────────────────────────────────────────────────────────

function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    name: "Test Profile",
    description: null,
    matrix: { "0": { O: 3 } },
    metadata: null,
    group_id: "group-1",
    created_at: new Date("2025-01-01"),
    updated_at: new Date("2025-01-01"),
    ...overrides,
  };
}

function makePrismaMock() {
  return {
    prisma: {
      confusionProfile: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      fieldCorrection: {
        findMany: jest.fn(),
      },
      benchmarkRun: {
        findMany: jest.fn(),
      },
      templateModel: {
        findMany: jest.fn(),
      },
    },
  } as unknown as PrismaService;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("ConfusionProfileService", () => {
  let service: ConfusionProfileService;
  let prismaMock: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    service = new ConfusionProfileService(prismaMock);
  });

  // ── create ──────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a profile and returns DTO", async () => {
      const profile = buildProfile();
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(profile);

      const result = await service.create({
        name: "Test Profile",
        matrix: { "0": { O: 3 } },
        groupId: "group-1",
      });

      expect(prismaMock.prisma.confusionProfile.create).toHaveBeenCalledTimes(
        1,
      );
      expect(result).toEqual({
        id: "profile-1",
        name: "Test Profile",
        description: null,
        matrix: { "0": { O: 3 } },
        metadata: null,
        groupId: "group-1",
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      });
    });
  });

  // ── findByGroup ─────────────────────────────────────────────────────

  describe("findByGroup", () => {
    it("returns profiles ordered by updated_at desc", async () => {
      const profiles = [buildProfile({ id: "p1" }), buildProfile({ id: "p2" })];
      (
        prismaMock.prisma.confusionProfile.findMany as jest.Mock
      ).mockResolvedValue(profiles);

      const result = await service.findByGroup("group-1");

      expect(prismaMock.prisma.confusionProfile.findMany).toHaveBeenCalledWith({
        where: { group_id: "group-1" },
        orderBy: { updated_at: "desc" },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("p1");
    });
  });

  // ── findById ────────────────────────────────────────────────────────

  describe("findById", () => {
    it("returns a profile DTO when found", async () => {
      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(buildProfile());

      const result = await service.findById("profile-1");
      expect(result.id).toBe("profile-1");
    });

    it("throws NotFoundException when not found", async () => {
      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.findById("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── update ──────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates and returns the updated profile", async () => {
      const existing = buildProfile();
      const updated = buildProfile({ name: "Renamed" });

      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(existing);
      (
        prismaMock.prisma.confusionProfile.update as jest.Mock
      ).mockResolvedValue(updated);

      const result = await service.update("profile-1", { name: "Renamed" });
      expect(result.name).toBe("Renamed");
      expect(prismaMock.prisma.confusionProfile.update).toHaveBeenCalledWith({
        where: { id: "profile-1" },
        data: { name: "Renamed" },
      });
    });

    it("throws NotFoundException when profile does not exist", async () => {
      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.update("missing", { name: "X" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── delete ──────────────────────────────────────────────────────────

  describe("delete", () => {
    it("deletes a profile", async () => {
      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(buildProfile());
      (
        prismaMock.prisma.confusionProfile.delete as jest.Mock
      ).mockResolvedValue(buildProfile());

      await service.delete("profile-1");
      expect(prismaMock.prisma.confusionProfile.delete).toHaveBeenCalledWith({
        where: { id: "profile-1" },
      });
    });

    it("throws NotFoundException when profile does not exist", async () => {
      (
        prismaMock.prisma.confusionProfile.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(service.delete("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── deriveAndSave ───────────────────────────────────────────────────

  describe("deriveAndSave", () => {
    it("derives from HITL corrections and saves a profile", async () => {
      // Mock HITL corrections
      (
        prismaMock.prisma.fieldCorrection.findMany as jest.Mock
      ).mockResolvedValue([
        {
          field_key: "amount",
          original_value: "1O0",
          corrected_value: "100",
        },
      ]);

      // Mock alignAndDiff to return substitution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(service as any, "alignAndDiff")
        .mockReturnValue([{ trueChar: "0", recognizedChar: "O" }]);

      // Mock create
      const createdProfile = buildProfile({
        matrix: { "0": { O: 1 } },
        metadata: { derivedAt: "2025-01-01T00:00:00.000Z" },
      });
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(createdProfile);

      const result = await service.deriveAndSave({
        name: "Derived Profile",
        groupId: "group-1",
      });

      expect(result.id).toBe("profile-1");
      expect(prismaMock.prisma.fieldCorrection.findMany).toHaveBeenCalledTimes(
        1,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledWith(
        "1O0",
        "100",
      );
      expect(prismaMock.prisma.confusionProfile.create).toHaveBeenCalledTimes(
        1,
      );

      // Verify the create call includes examples and fieldCounts in metadata
      const createCall = (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mock.calls[0][0];
      const metadata = createCall.data.metadata as Record<string, unknown>;
      expect(metadata).toHaveProperty("examples");
      expect(metadata).toHaveProperty("fieldCounts");
      expect(metadata).toHaveProperty("pairCount", 1);
    });

    it("includes benchmark run mismatch pairs when benchmarkRunIds provided", async () => {
      // Mock HITL corrections (empty)
      (
        prismaMock.prisma.fieldCorrection.findMany as jest.Mock
      ).mockResolvedValue([]);

      // Mock benchmark runs with mismatches
      (prismaMock.prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([
        {
          id: "run-1",
          metrics: {
            perSampleResults: [
              {
                sampleId: "s1",
                evaluationDetails: [
                  {
                    field: "date",
                    matched: false,
                    predicted: "2O24-O1-15",
                    expected: "2024-01-15",
                  },
                  {
                    field: "name",
                    matched: true,
                    predicted: "John",
                    expected: "John",
                  },
                ],
              },
            ],
          },
        },
      ]);

      // Mock alignAndDiff for the mismatch pair
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, "alignAndDiff").mockReturnValue([
        { trueChar: "0", recognizedChar: "O" },
        { trueChar: "0", recognizedChar: "O" },
      ]);

      const createdProfile = buildProfile({
        matrix: { "0": { O: 2 } },
      });
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(createdProfile);

      const result = await service.deriveAndSave({
        name: "Benchmark Derived",
        groupId: "group-1",
        sources: { benchmarkRunIds: ["run-1"] },
      });

      expect(result.id).toBe("profile-1");
      expect(prismaMock.prisma.benchmarkRun.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["run-1"] }, status: "completed" },
        select: { id: true, metrics: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledWith(
        "2O24-O1-15",
        "2024-01-15",
      );
    });

    it("respects fieldKeys filter for benchmark mismatches", async () => {
      (
        prismaMock.prisma.fieldCorrection.findMany as jest.Mock
      ).mockResolvedValue([]);

      (prismaMock.prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([
        {
          id: "run-1",
          metrics: {
            perSampleResults: [
              {
                sampleId: "s1",
                evaluationDetails: [
                  {
                    field: "date",
                    matched: false,
                    predicted: "2O24",
                    expected: "2024",
                  },
                  {
                    field: "amount",
                    matched: false,
                    predicted: "1O0",
                    expected: "100",
                  },
                ],
              },
            ],
          },
        },
      ]);

      // Only "amount" field should be processed because of fieldKeys filter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(service as any, "alignAndDiff")
        .mockReturnValue([{ trueChar: "0", recognizedChar: "O" }]);

      const createdProfile = buildProfile();
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(createdProfile);

      await service.deriveAndSave({
        name: "Filtered",
        groupId: "group-1",
        sources: {
          benchmarkRunIds: ["run-1"],
          fieldKeys: ["amount"],
        },
      });

      // alignAndDiff should only be called once (for "amount", not "date")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledTimes(
        1,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledWith(
        "1O0",
        "100",
      );
    });

    it("resolves templateModelIds to field keys and filters HITL + benchmark", async () => {
      // Mock template models with field_schema
      (prismaMock.prisma.templateModel.findMany as jest.Mock).mockResolvedValue(
        [
          {
            id: "tm-1",
            field_schema: [{ field_key: "amount" }, { field_key: "date" }],
          },
        ],
      );

      // Mock HITL corrections (includes "amount" and "name" fields)
      (
        prismaMock.prisma.fieldCorrection.findMany as jest.Mock
      ).mockResolvedValue([
        {
          field_key: "amount",
          original_value: "1O0",
          corrected_value: "100",
        },
      ]);

      // Mock benchmark runs with mismatches on "date" and "name"
      (prismaMock.prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([
        {
          id: "run-1",
          metrics: {
            perSampleResults: [
              {
                sampleId: "s1",
                evaluationDetails: [
                  {
                    field: "date",
                    matched: false,
                    predicted: "2O24",
                    expected: "2024",
                  },
                  {
                    field: "name",
                    matched: false,
                    predicted: "Jahn",
                    expected: "John",
                  },
                ],
              },
            ],
          },
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(service as any, "alignAndDiff")
        .mockReturnValue([{ trueChar: "0", recognizedChar: "O" }]);

      const createdProfile = buildProfile();
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(createdProfile);

      await service.deriveAndSave({
        name: "TM Scoped",
        groupId: "group-1",
        sources: {
          templateModelIds: ["tm-1"],
          benchmarkRunIds: ["run-1"],
        },
      });

      // Template models should be queried
      expect(prismaMock.prisma.templateModel.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["tm-1"] } },
        include: { field_schema: { select: { field_key: true } } },
      });

      // HITL query should filter by resolved field keys (amount, date)
      const hitlCall = (prismaMock.prisma.fieldCorrection.findMany as jest.Mock)
        .mock.calls[0][0];
      expect(hitlCall.where.field_key).toEqual({
        in: ["amount", "date"],
      });

      // Benchmark mismatches: "date" included (in template model), "name" excluded
      // alignAndDiff called for HITL "amount" pair + benchmark "date" pair = 2 calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledTimes(
        2,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledWith(
        "1O0",
        "100",
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(jest.spyOn(service as any, "alignAndDiff")).toHaveBeenCalledWith(
        "2O24",
        "2024",
      );
    });

    it("collects up to 5 examples per character pair", async () => {
      // Create 7 correction pairs all with same confusion
      const corrections = Array.from({ length: 7 }, (_, i) => ({
        field_key: `field_${i}`,
        original_value: `O${i}`,
        corrected_value: `0${i}`,
      }));

      (
        prismaMock.prisma.fieldCorrection.findMany as jest.Mock
      ).mockResolvedValue(corrections);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest
        .spyOn(service as any, "alignAndDiff")
        .mockReturnValue([{ trueChar: "0", recognizedChar: "O" }]);

      const createdProfile = buildProfile();
      (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mockResolvedValue(createdProfile);

      await service.deriveAndSave({
        name: "Many Examples",
        groupId: "group-1",
      });

      const createCall = (
        prismaMock.prisma.confusionProfile.create as jest.Mock
      ).mock.calls[0][0];
      const metadata = createCall.data.metadata as Record<string, unknown>;
      const examples = metadata.examples as Record<
        string,
        Record<string, Array<{ fieldKey: string }>>
      >;

      // Should have at most 5 examples
      expect(examples["0"]["O"]).toHaveLength(5);

      // Field counts should reflect all 7 distinct fields
      const fieldCounts = metadata.fieldCounts as Record<
        string,
        Record<string, number>
      >;
      expect(fieldCounts["0"]["O"]).toBe(7);
    });
  });
});
