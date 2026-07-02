import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { PreflightCostEstimatorService } from "./preflight-cost-estimator.service";
import type { RateVersionSeederService } from "./rate-version-seeder.service";

function makeConfig(partial: object): GraphWorkflowConfig {
  return partial as unknown as GraphWorkflowConfig;
}

function makeRateVersion(
  overrides: Partial<{
    id: string;
    unit_cost_dollars: number;
    max_pages_assumption: number;
    activity_costs: {
      activity_name: string;
      cost_type: "flat" | "per_page";
      units: number;
    }[];
  }> = {},
) {
  return {
    id: overrides.id ?? "rv-1",
    unit_cost_dollars: overrides.unit_cost_dollars ?? 0.001,
    max_pages_assumption: overrides.max_pages_assumption ?? 50,
    activity_costs: overrides.activity_costs ?? [],
  };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  type: "normal" | "conditional" | "error" = "normal",
) {
  return { id, source, target, type };
}

function makeActivityNode(activityType: string) {
  return {
    id: activityType,
    label: activityType,
    type: "activity" as const,
    activityType,
  };
}

describe("PreflightCostEstimatorService", () => {
  let service: PreflightCostEstimatorService;
  let rateVersionSeederService: jest.Mocked<RateVersionSeederService>;

  beforeEach(() => {
    rateVersionSeederService = {
      getActiveRateVersion: jest.fn(),
    } as unknown as jest.Mocked<RateVersionSeederService>;
    service = new PreflightCostEstimatorService(rateVersionSeederService);
  });

  describe("estimateWorkflowCost", () => {
    it("returns zeros when no active rate version exists", async () => {
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(null);

      const config = {
        nodes: { a: makeActivityNode("azureOcr.submit") },
        edges: [],
        entryNodeId: "a",
      };

      const result = await service.estimateWorkflowCost(makeConfig(config));

      expect(result).toEqual({
        estimatedUnits: 0,
        rateVersionId: "",
        unitCostDollars: 0,
      });
    });

    it("Scenario 1: linear workflow returns sum of all activity node costs", async () => {
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(
        makeRateVersion({
          activity_costs: [
            { activity_name: "azureOcr.submit", cost_type: "flat", units: 10 },
            { activity_name: "azureOcr.extract", cost_type: "flat", units: 40 },
          ],
        }) as never,
      );

      const config = {
        nodes: {
          submit: makeActivityNode("azureOcr.submit"),
          extract: makeActivityNode("azureOcr.extract"),
        },
        edges: [makeEdge("e1", "submit", "extract")],
        entryNodeId: "submit",
      };

      const result = await service.estimateWorkflowCost(makeConfig(config));

      expect(result.estimatedUnits).toBe(50);
      expect(result.rateVersionId).toBe("rv-1");
    });

    it("Scenario 2: branching workflow returns cost of the most expensive branch", async () => {
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(
        makeRateVersion({
          activity_costs: [
            { activity_name: "cheapActivity", cost_type: "flat", units: 100 },
            {
              activity_name: "expensiveActivity",
              cost_type: "flat",
              units: 300,
            },
          ],
        }) as never,
      );

      const config = {
        nodes: {
          switch: {
            id: "switch",
            label: "switch",
            type: "switch",
            cases: [],
            defaultEdge: "cheap",
          },
          cheap: makeActivityNode("cheapActivity"),
          expensive: makeActivityNode("expensiveActivity"),
        },
        edges: [
          makeEdge("e1", "switch", "cheap", "conditional"),
          makeEdge("e2", "switch", "expensive", "conditional"),
        ],
        entryNodeId: "switch",
      };

      const result = await service.estimateWorkflowCost(makeConfig(config));

      expect(result.estimatedUnits).toBe(300);
    });

    it("Scenario 3: per-page activities use max_pages_assumption for estimation", async () => {
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(
        makeRateVersion({
          max_pages_assumption: 50,
          activity_costs: [
            {
              activity_name: "azureOcr.extract",
              cost_type: "per_page",
              units: 40,
            },
          ],
        }) as never,
      );

      const config = {
        nodes: { extract: makeActivityNode("azureOcr.extract") },
        edges: [],
        entryNodeId: "extract",
      };

      const result = await service.estimateWorkflowCost(makeConfig(config));

      expect(result.estimatedUnits).toBe(2000); // 50 × 40
    });

    it("Scenario 4: activities absent from the rate version contribute zero cost", async () => {
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(
        makeRateVersion({ activity_costs: [] }) as never,
      );

      const config = {
        nodes: { unknownActivity: makeActivityNode("unknownActivity") },
        edges: [],
        entryNodeId: "unknownActivity",
      };

      await expect(
        service.estimateWorkflowCost(makeConfig(config)),
      ).resolves.toEqual(expect.objectContaining({ estimatedUnits: 0 }));
    });

    it("Scenario 5: uses the active rate version (highest effective_from ≤ now)", async () => {
      const mockRv = makeRateVersion({
        id: "rv-latest",
        activity_costs: [
          { activity_name: "azureOcr.submit", cost_type: "flat", units: 20 },
        ],
      });
      rateVersionSeederService.getActiveRateVersion.mockResolvedValue(
        mockRv as never,
      );

      const config = {
        nodes: { submit: makeActivityNode("azureOcr.submit") },
        edges: [],
        entryNodeId: "submit",
      };

      await service.estimateWorkflowCost(makeConfig(config));

      expect(
        rateVersionSeederService.getActiveRateVersion,
      ).toHaveBeenCalledWith(expect.any(Date));
    });
  });
});
