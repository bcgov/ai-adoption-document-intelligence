/**
 * Benchmark Temporal Service Tests
 *
 * Tests for the Temporal workflow operations specific to benchmarking.
 */

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";

// Mock the Temporal client module
const mockWorkflowStart = jest.fn();
const mockWorkflowGetHandle = jest.fn();
const mockScheduleCreate = jest.fn();
const mockScheduleGetHandle = jest.fn();

jest.mock("@temporalio/client", () => ({
  Connection: {
    connect: jest.fn().mockResolvedValue({
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
  Client: jest.fn().mockImplementation(() => ({
    workflow: {
      start: mockWorkflowStart,
      getHandle: mockWorkflowGetHandle,
    },
  })),
  ScheduleClient: jest.fn().mockImplementation(() => ({
    create: mockScheduleCreate,
    getHandle: mockScheduleGetHandle,
  })),
}));

describe("BenchmarkTemporalService", () => {
  let service: BenchmarkTemporalService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        TEMPORAL_ADDRESS: "localhost:7233",
        TEMPORAL_NAMESPACE: "test-ns",
        BENCHMARK_TASK_QUEUE: "test-queue",
      };
      return config[key];
    }),
  };

  const benchmarkDefinition = {
    definitionId: "def-1",
    projectId: "project-1",
    datasetVersionId: "dsv-1",
    workflowId: "wf-1",
    workflowConfig: {},
    workflowConfigHash: "hash-wf",
    evaluatorType: "schema-aware",
    evaluatorConfig: {},
    evaluatorConfigHash: "hash-eval",
    runtimeSettings: {},
    workerGitSha: "abc123",
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkTemporalService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<BenchmarkTemporalService>(BenchmarkTemporalService);
  });

  describe("constructor", () => {
    it("uses config values", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith("TEMPORAL_ADDRESS");
      expect(mockConfigService.get).toHaveBeenCalledWith("TEMPORAL_NAMESPACE");
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "BENCHMARK_TASK_QUEUE",
      );
    });

    it("uses defaults when config values are not provided", async () => {
      const emptyConfig = { get: jest.fn().mockReturnValue(undefined) };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BenchmarkTemporalService,
          { provide: ConfigService, useValue: emptyConfig },
        ],
      }).compile();

      const svc = module.get<BenchmarkTemporalService>(
        BenchmarkTemporalService,
      );
      // Service should be created without errors
      expect(svc).toBeDefined();
    });
  });

  describe("startBenchmarkRunWorkflow", () => {
    it("starts a workflow and returns workflow ID", async () => {
      mockWorkflowStart.mockResolvedValue({
        workflowId: "benchmark-run-run-1",
      });

      const result = await service.startBenchmarkRunWorkflow(
        "run-1",
        benchmarkDefinition,
      );

      expect(result).toBe("benchmark-run-run-1");
      expect(mockWorkflowStart).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          taskQueue: "test-queue",
          workflowId: "benchmark-run-run-1",
          workflowExecutionTimeout: "24 hours",
        }),
      );
    });

    it("includes optional fields in workflow args", async () => {
      mockWorkflowStart.mockResolvedValue({
        workflowId: "benchmark-run-run-2",
      });

      await service.startBenchmarkRunWorkflow("run-2", {
        ...benchmarkDefinition,
        splitId: "split-1",
        sampleIds: ["s1", "s2"],
        workerImageDigest: "sha256:abc",
      });

      const args = mockWorkflowStart.mock.calls[0][1].args[0];
      expect(args.splitId).toBe("split-1");
      expect(args.sampleIds).toEqual(["s1", "s2"]);
      expect(args.workerImageDigest).toBe("sha256:abc");
    });

    it("throws when workflow start fails", async () => {
      mockWorkflowStart.mockRejectedValue(new Error("Connection refused"));

      await expect(
        service.startBenchmarkRunWorkflow("run-fail", benchmarkDefinition),
      ).rejects.toThrow("Failed to start benchmark run workflow");
    });

    it("handles non-Error thrown objects", async () => {
      mockWorkflowStart.mockRejectedValue("string error");

      await expect(
        service.startBenchmarkRunWorkflow("run-fail", benchmarkDefinition),
      ).rejects.toThrow("Failed to start benchmark run workflow");
    });
  });

  describe("cancelBenchmarkRunWorkflow", () => {
    it("cancels a workflow", async () => {
      const mockCancel = jest.fn().mockResolvedValue(undefined);
      mockWorkflowGetHandle.mockReturnValue({ cancel: mockCancel });

      await service.cancelBenchmarkRunWorkflow("benchmark-run-run-1");

      expect(mockWorkflowGetHandle).toHaveBeenCalledWith("benchmark-run-run-1");
      expect(mockCancel).toHaveBeenCalled();
    });

    it("throws when cancel fails", async () => {
      mockWorkflowGetHandle.mockReturnValue({
        cancel: jest.fn().mockRejectedValue(new Error("Workflow not found")),
      });

      await expect(
        service.cancelBenchmarkRunWorkflow("bad-wf"),
      ).rejects.toThrow("Failed to cancel benchmark run workflow");
    });

    it("handles non-Error thrown objects on cancel", async () => {
      mockWorkflowGetHandle.mockReturnValue({
        cancel: jest.fn().mockRejectedValue("cancel error"),
      });

      await expect(
        service.cancelBenchmarkRunWorkflow("bad-wf"),
      ).rejects.toThrow("Failed to cancel benchmark run workflow");
    });
  });

  describe("getWorkflowStatus", () => {
    it("returns status for a running workflow", async () => {
      mockWorkflowGetHandle.mockReturnValue({
        describe: jest.fn().mockResolvedValue({
          status: { name: "RUNNING" },
        }),
      });

      const result = await service.getWorkflowStatus("benchmark-run-run-1");

      expect(result).toEqual({ status: "RUNNING", result: undefined });
    });

    it("returns status with result for completed workflow", async () => {
      const mockResult = jest.fn().mockResolvedValue({ metrics: {} });
      mockWorkflowGetHandle.mockReturnValue({
        describe: jest.fn().mockResolvedValue({
          status: { name: "COMPLETED" },
        }),
        result: mockResult,
      });

      const result = await service.getWorkflowStatus("benchmark-run-done");

      expect(result.status).toBe("COMPLETED");
      expect(result.result).toEqual({ metrics: {} });
    });

    it("throws when workflow describe fails", async () => {
      mockWorkflowGetHandle.mockReturnValue({
        describe: jest.fn().mockRejectedValue(new Error("Not found")),
      });

      await expect(service.getWorkflowStatus("bad-wf")).rejects.toThrow(
        "Failed to get workflow status",
      );
    });

    it("handles non-Error thrown objects on describe", async () => {
      mockWorkflowGetHandle.mockReturnValue({
        describe: jest.fn().mockRejectedValue("describe error"),
      });

      await expect(service.getWorkflowStatus("bad-wf")).rejects.toThrow(
        "Failed to get workflow status",
      );
    });
  });

  describe("createSchedule", () => {
    it("creates a schedule and returns schedule ID", async () => {
      mockScheduleCreate.mockResolvedValue(undefined);

      const schedDef = {
        definitionId: "def-1",
        datasetVersionId: "dsv-1",
        splitId: "split-1",
        workflowId: "wf-1",
        workflowConfigHash: "hash-wf",
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        runtimeSettings: {},
      };

      const result = await service.createSchedule(
        "def-1",
        "0 0 * * *",
        schedDef,
      );

      expect(result).toBe("benchmark-schedule-def-1");
      expect(mockScheduleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: "benchmark-schedule-def-1",
          spec: { cronExpressions: ["0 0 * * *"] },
        }),
      );
    });

    it("throws when schedule creation fails", async () => {
      mockScheduleCreate.mockRejectedValue(new Error("Schedule exists"));

      await expect(
        service.createSchedule("def-1", "0 0 * * *", {
          definitionId: "def-1",
          datasetVersionId: "dsv-1",
          splitId: "s1",
          workflowId: "wf-1",
          workflowConfigHash: "h",
          evaluatorType: "schema-aware",
          evaluatorConfig: {},
          runtimeSettings: {},
        }),
      ).rejects.toThrow("Failed to create schedule");
    });

    it("handles non-Error thrown objects on create", async () => {
      mockScheduleCreate.mockRejectedValue("create error");

      await expect(
        service.createSchedule("def-1", "0 0 * * *", {
          definitionId: "def-1",
          datasetVersionId: "dsv-1",
          splitId: "s1",
          workflowId: "wf-1",
          workflowConfigHash: "h",
          evaluatorType: "schema-aware",
          evaluatorConfig: {},
          runtimeSettings: {},
        }),
      ).rejects.toThrow("Failed to create schedule");
    });
  });

  describe("deleteSchedule", () => {
    it("deletes a schedule", async () => {
      const mockDelete = jest.fn().mockResolvedValue(undefined);
      mockScheduleGetHandle.mockReturnValue({ delete: mockDelete });

      await service.deleteSchedule("benchmark-schedule-def-1");

      expect(mockScheduleGetHandle).toHaveBeenCalledWith(
        "benchmark-schedule-def-1",
      );
      expect(mockDelete).toHaveBeenCalled();
    });

    it("throws when schedule delete fails", async () => {
      mockScheduleGetHandle.mockReturnValue({
        delete: jest.fn().mockRejectedValue(new Error("Not found")),
      });

      await expect(service.deleteSchedule("bad-schedule")).rejects.toThrow(
        "Failed to delete schedule",
      );
    });

    it("handles non-Error thrown objects on delete", async () => {
      mockScheduleGetHandle.mockReturnValue({
        delete: jest.fn().mockRejectedValue("delete error"),
      });

      await expect(service.deleteSchedule("bad-schedule")).rejects.toThrow(
        "Failed to delete schedule",
      );
    });
  });

  describe("getScheduleInfo", () => {
    it("returns schedule info", async () => {
      const nextRunTime = new Date();
      const lastRunTime = new Date();
      mockScheduleGetHandle.mockReturnValue({
        describe: jest.fn().mockResolvedValue({
          spec: {
            calendars: [{ comment: "0 0 * * *" }],
          },
          info: {
            nextActionTimes: [nextRunTime],
            recentActions: [{ scheduledAt: lastRunTime }],
          },
          state: { paused: false },
        }),
      });

      const result = await service.getScheduleInfo("benchmark-schedule-def-1");

      expect(result).toEqual({
        scheduleId: "benchmark-schedule-def-1",
        cron: "0 0 * * *",
        nextRunTime,
        lastRunTime,
        paused: false,
      });
    });

    it("handles missing calendar comment", async () => {
      mockScheduleGetHandle.mockReturnValue({
        describe: jest.fn().mockResolvedValue({
          spec: { calendars: [] },
          info: {
            nextActionTimes: [new Date()],
            recentActions: [],
          },
          state: { paused: true },
        }),
      });

      const result = await service.getScheduleInfo("schedule-1");

      expect(result.cron).toBe("");
      expect(result.paused).toBe(true);
      expect(result.lastRunTime).toBeUndefined();
    });

    it("throws when schedule describe fails", async () => {
      mockScheduleGetHandle.mockReturnValue({
        describe: jest.fn().mockRejectedValue(new Error("Not found")),
      });

      await expect(service.getScheduleInfo("bad-schedule")).rejects.toThrow(
        "Failed to get schedule info",
      );
    });

    it("handles non-Error thrown objects on describe", async () => {
      mockScheduleGetHandle.mockReturnValue({
        describe: jest.fn().mockRejectedValue("describe error"),
      });

      await expect(service.getScheduleInfo("bad-schedule")).rejects.toThrow(
        "Failed to get schedule info",
      );
    });
  });

  describe("close", () => {
    it("closes the connection when connected", async () => {
      // Trigger connection by calling a method first
      mockWorkflowStart.mockResolvedValue({
        workflowId: "benchmark-run-run-1",
      });
      await service.startBenchmarkRunWorkflow("run-1", benchmarkDefinition);

      await service.close();
      // Should not throw
    });

    it("does nothing when not connected", async () => {
      // No prior connection established
      await service.close();
      // Should not throw
    });
  });
});
