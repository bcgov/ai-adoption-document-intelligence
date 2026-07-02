import { Prisma } from "@generated/client";
import { HttpException } from "@nestjs/common";
import {
  type CapExceededResponse,
  PreflightCapCheckService,
} from "./preflight-cap-check.service";

function makeMockPrisma(overrides: {
  billingConfig?: { monthly_cap_dollars: number | null } | null;
  summaryRows?: { total_dollars_spent: number }[];
}) {
  const tx = {
    groupBillingConfig: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.billingConfig !== undefined
            ? overrides.billingConfig
            : null,
        ),
    },
    $queryRaw: jest.fn().mockResolvedValue(overrides.summaryRows ?? []),
  };

  return {
    prisma: {
      $transaction: jest.fn(
        async (cb: (t: typeof tx) => Promise<void>, _opts: unknown) => cb(tx),
      ),
    },
    tx,
  };
}

describe("PreflightCapCheckService", () => {
  describe("checkCap", () => {
    it("Scenario 1: groups with no cap configured always pass", async () => {
      const { prisma } = makeMockPrisma({ billingConfig: null });
      const service = new PreflightCapCheckService({ prisma } as never);

      await expect(
        service.checkCap("group-1", 1000, 0.001),
      ).resolves.toBeUndefined();
    });

    it("Scenario 1b: groups with null monthly_cap_dollars always pass", async () => {
      const { prisma } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: null },
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      await expect(
        service.checkCap("group-1", 1000, 0.001),
      ).resolves.toBeUndefined();
    });

    it("Scenario 2: group under cap passes", async () => {
      const { prisma } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: 100 },
        summaryRows: [{ total_dollars_spent: 60 }],
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      // estimated_cost = 30000 units × 0.001 = $30; $60 + $30 = $90 ≤ $100
      await expect(
        service.checkCap("group-1", 30000, 0.001),
      ).resolves.toBeUndefined();
    });

    it("Scenario 3: group over cap rejected with HTTP 402", async () => {
      const { prisma } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: 100 },
        summaryRows: [{ total_dollars_spent: 80 }],
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      // estimated_cost = 30000 units × 0.001 = $30; $80 + $30 = $110 > $100
      await expect(service.checkCap("group-1", 30000, 0.001)).rejects.toThrow(
        HttpException,
      );
    });

    it("Scenario 3: HTTP 402 response body contains shortfall details", async () => {
      const { prisma } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: 100 },
        summaryRows: [{ total_dollars_spent: 80 }],
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      let caughtError: HttpException | undefined;
      try {
        await service.checkCap("group-1", 30000, 0.001);
      } catch (e) {
        caughtError = e as HttpException;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError?.getStatus()).toBe(402);
      const body = caughtError?.getResponse() as CapExceededResponse;
      expect(body.shortfall_dollars).toBeCloseTo(10);
      expect(body.current_spend_dollars).toBe(80);
      expect(body.monthly_cap_dollars).toBe(100);
      expect(body.estimated_cost_dollars).toBeCloseTo(30);
    });

    it("Scenario 4: transaction uses FOR UPDATE lock via $queryRaw", async () => {
      const { prisma, tx } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: 100 },
        summaryRows: [{ total_dollars_spent: 50 }],
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      await service.checkCap("group-1", 10000, 0.001);

      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it("Scenario 5: reads total_dollars_spent from UsagePeriodSummary (no existing row = $0)", async () => {
      const { prisma, tx } = makeMockPrisma({
        billingConfig: { monthly_cap_dollars: 100 },
        summaryRows: [], // no row = $0 spend
      });
      const service = new PreflightCapCheckService({ prisma } as never);

      // $0 + $50 = $50 ≤ $100
      await expect(
        service.checkCap("group-1", 50000, 0.001),
      ).resolves.toBeUndefined();

      expect(tx.$queryRaw).toHaveBeenCalled();
    });

    it("uses Serializable isolation level for the transaction", async () => {
      const { prisma } = makeMockPrisma({ billingConfig: null });
      const service = new PreflightCapCheckService({ prisma } as never);

      await service.checkCap("group-1", 100, 0.001);

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
    });
  });
});
