import type { ActivityCost, RateVersion } from "@generated/client";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import type { RateVersionEntry } from "./rate-version.types";
import { RateVersionSeederService } from "./rate-version-seeder.service";

function createMockPrisma() {
  const rateVersion: RateVersion = {
    id: "rv-1",
    version: "1.0.0",
    effective_from: new Date("2026-07-01T00:00:00Z"),
    unit_cost_dollars: 0.001 as unknown as RateVersion["unit_cost_dollars"],
    units_per_gb_per_month:
      10 as unknown as RateVersion["units_per_gb_per_month"],
    max_pages_assumption: 50,
    max_array_items_assumption: 10,
    created_at: new Date(),
  };

  const activityCost: ActivityCost = {
    id: "ac-1",
    rate_version_id: "rv-1",
    activity_name: "azureOcr.submit",
    cost_type: "flat",
    units: 10 as unknown as ActivityCost["units"],
    created_at: new Date(),
  };

  const trainingTemplateCost: ActivityCost = {
    id: "ac-training-1",
    rate_version_id: "rv-1",
    activity_name: "training.template_model",
    cost_type: "flat",
    units: 500 as unknown as ActivityCost["units"],
    created_at: new Date(),
  };

  const trainingClassifierCost: ActivityCost = {
    id: "ac-training-2",
    rate_version_id: "rv-1",
    activity_name: "training.classifier",
    cost_type: "flat",
    units: 300 as unknown as ActivityCost["units"],
    created_at: new Date(),
  };

  const tx = {
    rateVersion: {
      create: jest.fn().mockResolvedValue(rateVersion),
    },
    activityCost: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = {
    rateVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({
        ...rateVersion,
        activity_costs: [
          activityCost,
          trainingTemplateCost,
          trainingClassifierCost,
        ],
      }),
    },
    activityCost: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => cb(tx)),
  };

  return {
    prisma,
    tx,
    rateVersion,
    activityCost,
    trainingTemplateCost,
    trainingClassifierCost,
  };
}

const sampleEntry: RateVersionEntry = {
  version: "1.0.0",
  effective_from: "2026-07-01T00:00:00Z",
  unit_cost_dollars: 0.001,
  units_per_gb_per_month: 10,
  max_pages_assumption: 50,
  max_array_items_assumption: 10,
  activity_costs: {
    "azureOcr.submit": { cost_type: "flat", units: 10 },
    "azureOcr.extract": { cost_type: "per_page", units: 40 },
    "training.template_model": { cost_type: "flat", units: 500 },
    "training.classifier": { cost_type: "flat", units: 300 },
  },
};

describe("RateVersionSeederService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("seedRateVersion", () => {
    it("inserts a new rate version with activity costs when version does not exist", async () => {
      const { prisma, tx } = createMockPrisma();
      prisma.rateVersion.findUnique.mockResolvedValue(null);
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      await service.seedRateVersion(sampleEntry);

      expect(prisma.rateVersion.findUnique).toHaveBeenCalledWith({
        where: { version: "1.0.0" },
        include: { activity_costs: true },
      });
      expect(tx.rateVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: "1.0.0" }),
        }),
      );
      expect(tx.activityCost.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            activity_name: "azureOcr.submit",
            cost_type: "flat",
          }),
          expect.objectContaining({
            activity_name: "azureOcr.extract",
            cost_type: "per_page",
          }),
          expect.objectContaining({
            activity_name: "training.template_model",
            cost_type: "flat",
          }),
          expect.objectContaining({
            activity_name: "training.classifier",
            cost_type: "flat",
          }),
        ]),
      });
      expect(mockAppLogger.log).toHaveBeenCalledWith(
        "Seeded rate version",
        expect.objectContaining({ version: "1.0.0" }),
      );
    });

    it("is idempotent — skips insertion when version already exists and has all activity costs", async () => {
      const { prisma, tx, rateVersion } = createMockPrisma();
      prisma.rateVersion.findUnique.mockResolvedValue({
        ...rateVersion,
        activity_costs: [
          { activity_name: "azureOcr.submit" },
          { activity_name: "azureOcr.extract" },
          { activity_name: "training.template_model" },
          { activity_name: "training.classifier" },
        ],
      });
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      await service.seedRateVersion(sampleEntry);

      expect(tx.rateVersion.create).not.toHaveBeenCalled();
      expect(tx.activityCost.createMany).not.toHaveBeenCalled();
      expect(mockAppLogger.debug).toHaveBeenCalledWith(
        "Rate version already exists, skipping",
        expect.objectContaining({ version: "1.0.0" }),
      );
    });

    it("backfills missing activity costs when version exists but is missing entries", async () => {
      const { prisma, tx, rateVersion } = createMockPrisma();
      prisma.rateVersion.findUnique.mockResolvedValue({
        ...rateVersion,
        activity_costs: [
          { activity_name: "azureOcr.submit" },
          { activity_name: "azureOcr.extract" },
          // training costs missing
        ],
      });
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      await service.seedRateVersion(sampleEntry);

      expect(tx.rateVersion.create).not.toHaveBeenCalled();
      expect(prisma.activityCost.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ activity_name: "training.template_model" }),
          expect.objectContaining({ activity_name: "training.classifier" }),
        ]),
        skipDuplicates: true,
      });
      expect(mockAppLogger.log).toHaveBeenCalledWith(
        "Backfilled missing activity costs",
        expect.objectContaining({ version: "1.0.0" }),
      );
    });
  });

  describe("onApplicationBootstrap", () => {
    it("seeds all versions from the JSON file on startup", async () => {
      const { prisma } = createMockPrisma();
      prisma.rateVersion.findUnique.mockResolvedValue(null);
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      jest
        .spyOn(service, "loadRateVersionsFile")
        .mockReturnValue([sampleEntry]);
      const seedSpy = jest
        .spyOn(service, "seedRateVersion")
        .mockResolvedValue();

      await service.onApplicationBootstrap();

      expect(seedSpy).toHaveBeenCalledTimes(1);
      expect(seedSpy).toHaveBeenCalledWith(sampleEntry);
    });
  });

  describe("getActiveRateVersion", () => {
    it("returns the rate version with highest effective_from ≤ the given timestamp", async () => {
      const { prisma, rateVersion, activityCost } = createMockPrisma();
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );
      const at = new Date("2026-08-01T00:00:00Z");

      const result = await service.getActiveRateVersion(at);

      expect(prisma.rateVersion.findFirst).toHaveBeenCalledWith({
        where: { effective_from: { lte: at } },
        orderBy: { effective_from: "desc" },
        include: { activity_costs: true },
      });
      expect(result).toMatchObject({
        version: rateVersion.version,
        activity_costs: expect.arrayContaining([
          expect.objectContaining({ id: activityCost.id }),
        ]),
      });
    });
  });

  describe("getActiveTrainingCosts", () => {
    it("returns training costs from activity_costs in the active rate version", async () => {
      const { prisma } = createMockPrisma();
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      const result = await service.getActiveTrainingCosts(
        new Date("2026-08-01T00:00:00Z"),
      );

      expect(result).toEqual({
        rateVersionId: "rv-1",
        unitCostDollars: 0.001,
        templateModelCost: 500,
        classifierCost: 300,
      });
    });

    it("returns null when no active rate version exists", async () => {
      const { prisma } = createMockPrisma();
      prisma.rateVersion.findFirst.mockResolvedValue(null);
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      const result = await service.getActiveTrainingCosts(new Date());

      expect(result).toBeNull();
    });

    it("returns null when the active rate version is missing training activity cost rows", async () => {
      const { prisma, rateVersion, activityCost } = createMockPrisma();
      prisma.rateVersion.findFirst.mockResolvedValue({
        ...rateVersion,
        activity_costs: [activityCost], // no training costs
      });
      const service = new RateVersionSeederService(
        { prisma } as never,
        mockAppLogger,
      );

      const result = await service.getActiveTrainingCosts(new Date());

      expect(result).toBeNull();
    });
  });
});
