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
        activity_costs: [activityCost],
      }),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) => cb(tx)),
  };

  return { prisma, tx, rateVersion, activityCost };
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
  },
  training_costs: {
    template_model: 500,
    classifier: 300,
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
        ]),
      });
      expect(mockAppLogger.log).toHaveBeenCalledWith(
        "Seeded rate version",
        expect.objectContaining({ version: "1.0.0" }),
      );
    });

    it("is idempotent — skips insertion when version already exists", async () => {
      const { prisma, tx, rateVersion } = createMockPrisma();
      prisma.rateVersion.findUnique.mockResolvedValue(rateVersion);
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
        activity_costs: [expect.objectContaining({ id: activityCost.id })],
      });
    });
  });
});
