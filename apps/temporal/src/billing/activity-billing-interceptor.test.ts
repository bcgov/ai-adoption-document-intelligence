import type { ActivityExecuteInput } from "@temporalio/worker";
import { ActivityBillingInterceptor } from "./activity-billing-interceptor";
import type { UsageEventWriter } from "./usage-event-writer";

function makeRateVersionContext(
  activityCosts: [string, { cost_type: "flat" | "per_page"; units: number }][],
) {
  return {
    id: "rv-1",
    unit_cost_dollars: 0.001,
    activity_costs: activityCosts.map((c) => ({
      activity_name: c[0],
      cost_type: c[1].cost_type,
      units: c[1].units,
    })),
  };
}

jest.mock("../activities/database-client", () => ({
  getPrismaClient: () => {
    return {
      rateVersion: {
        findFirst: jest.fn().mockResolvedValue(
          makeRateVersionContext([
            ["azureOcr.submit", { cost_type: "flat", units: 10 }],
            ["azureOcr.extract", { cost_type: "per_page", units: 40 }],
          ]),
        ),
      },
    };
  },
}));

function makeInput(args: unknown[]): ActivityExecuteInput {
  return { args, headers: {} } as ActivityExecuteInput;
}

function makeActivityInfoMock(activityType: string, runId = "run-abc-123") {
  return {
    activityType,
    workflowExecution: { workflowId: "graph-doc-1", runId },
  };
}

// Mock activityInfo
jest.mock("@temporalio/activity", () => ({
  activityInfo: jest.fn(),
}));

import { activityInfo } from "@temporalio/activity";

const mockActivityInfo = activityInfo as jest.Mock;

describe("ActivityBillingInterceptor", () => {
  let writer: jest.Mocked<UsageEventWriter>;
  const next = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    writer = {
      recordUsageEvent: jest.fn().mockResolvedValue({ id: "evt-1" }),
    } as unknown as jest.Mocked<UsageEventWriter>;
    next.mockResolvedValue({ someResult: true });
  });

  describe("execute", () => {
    it("Scenario 1/2: records flat-cost activity_completed event on success", async () => {
      mockActivityInfo.mockReturnValue(makeActivityInfoMock("azureOcr.submit"));
      const interceptor = new ActivityBillingInterceptor(writer);

      await interceptor.execute(
        makeInput([{ groupId: "group-1", documentId: "doc-1" }]),
        next,
      );

      expect(writer.recordUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "activity_completed",
          activity_name: "azureOcr.submit",
          units_consumed: 10,
          group_id: "group-1",
          workflow_execution_id: "run-abc-123",
          metered_quantity: undefined,
        }),
      );
    });

    it("Scenario 3: failed activity does not record a UsageEvent", async () => {
      mockActivityInfo.mockReturnValue(makeActivityInfoMock("azureOcr.submit"));
      const interceptor = new ActivityBillingInterceptor(writer);
      next.mockRejectedValue(new Error("activity failed"));

      await expect(
        interceptor.execute(makeInput([{ groupId: "group-1" }]), next),
      ).rejects.toThrow("activity failed");

      expect(writer.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("Scenario 4: activity not in rate version — no event recorded", async () => {
      mockActivityInfo.mockReturnValue(
        makeActivityInfoMock("document.updateStatus"),
      );
      const interceptor = new ActivityBillingInterceptor(writer);

      await interceptor.execute(makeInput([{ groupId: "group-1" }]), next);

      expect(writer.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("Scenario 5: per-page activity with _metered_quantity records correct units", async () => {
      mockActivityInfo.mockReturnValue(
        makeActivityInfoMock("azureOcr.extract"),
      );
      const interceptor = new ActivityBillingInterceptor(writer);
      next.mockResolvedValue({ ocrResult: {}, _metered_quantity: 7 });

      await interceptor.execute(makeInput([{ groupId: "group-1" }]), next);

      expect(writer.recordUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "activity_completed",
          activity_name: "azureOcr.extract",
          units_consumed: 280, // 7 × 40
          metered_quantity: 7,
        }),
      );
    });

    it("Scenario 6: per-page with missing _metered_quantity — no event recorded", async () => {
      mockActivityInfo.mockReturnValue(
        makeActivityInfoMock("azureOcr.extract"),
      );
      const interceptor = new ActivityBillingInterceptor(writer);
      next.mockResolvedValue({ ocrResult: {} }); // no _metered_quantity

      await interceptor.execute(makeInput([{ groupId: "group-1" }]), next);

      expect(writer.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("Scenario 7: per-page with zero _metered_quantity — no event recorded", async () => {
      mockActivityInfo.mockReturnValue(
        makeActivityInfoMock("azureOcr.extract"),
      );
      const interceptor = new ActivityBillingInterceptor(writer);
      next.mockResolvedValue({ _metered_quantity: 0 });

      await interceptor.execute(makeInput([{ groupId: "group-1" }]), next);

      expect(writer.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("Scenario 8: no groupId in activity args — no event recorded", async () => {
      mockActivityInfo.mockReturnValue(makeActivityInfoMock("azureOcr.submit"));
      const interceptor = new ActivityBillingInterceptor(writer);

      await interceptor.execute(makeInput([{ documentId: "doc-1" }]), next);

      expect(writer.recordUsageEvent).not.toHaveBeenCalled();
    });

    it("Scenario 9: billing write failure does not propagate (non-blocking)", async () => {
      mockActivityInfo.mockReturnValue(makeActivityInfoMock("azureOcr.submit"));
      writer.recordUsageEvent.mockRejectedValue(new Error("DB error"));
      const interceptor = new ActivityBillingInterceptor(writer);

      await expect(
        interceptor.execute(makeInput([{ groupId: "group-1" }]), next),
      ).resolves.toBeDefined();
    });
  });
});
