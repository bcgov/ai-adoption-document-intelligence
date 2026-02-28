import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AxiosResponse } from "axios";
import { of, throwError } from "rxjs";
import { MLflowClientService, MLflowRunStatus } from "./mlflow-client.service";

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    if (key === "MLFLOW_TRACKING_URI") return "http://localhost:5000";
    return defaultValue;
  }),
};

const mockHttpPost = jest.fn();

const createMockResponse = <T>(data: T): AxiosResponse<T> => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {} as never,
});

describe("MLflowClientService", () => {
  let service: MLflowClientService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MLflowClientService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: HttpService,
          useValue: {
            post: mockHttpPost,
          },
        },
      ],
    }).compile();

    service = module.get<MLflowClientService>(MLflowClientService);
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create MLflow experiment
  // -----------------------------------------------------------------------
  describe("createExperiment", () => {
    it("creates an experiment and returns experiment ID", async () => {
      const mockResponse = createMockResponse({
        experiment_id: "exp-123",
      });
      mockHttpPost.mockReturnValue(of(mockResponse));

      const result = await service.createExperiment("My Experiment");

      expect(result).toBe("exp-123");
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/experiments/create",
        { name: "My Experiment" },
      );
    });

    it("throws error when experiment creation fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(service.createExperiment("My Experiment")).rejects.toThrow(
        'Failed to create MLflow experiment "My Experiment"',
      );
    });

    it("throws RESOURCE_ALREADY_EXISTS error when experiment name is taken", async () => {
      const axiosError = {
        response: {
          data: {
            error_code: "RESOURCE_ALREADY_EXISTS",
            message: "Experiment(name=My Experiment) already exists.",
          },
          status: 409,
        },
        message: "Request failed with status code 409",
      };
      mockHttpPost.mockReturnValue(throwError(() => axiosError));

      await expect(service.createExperiment("My Experiment")).rejects.toThrow(
        "RESOURCE_ALREADY_EXISTS",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 1b: Delete MLflow experiment
  // -----------------------------------------------------------------------
  describe("deleteExperiment", () => {
    it("deletes an experiment by ID", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      await service.deleteExperiment("exp-123");

      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/experiments/delete",
        { experiment_id: "exp-123" },
      );
    });

    it("throws error when deletion fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(service.deleteExperiment("exp-123")).rejects.toThrow(
        'Failed to delete MLflow experiment "exp-123"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Create MLflow run
  // -----------------------------------------------------------------------
  describe("createRun", () => {
    it("creates a run with name and returns run ID", async () => {
      const mockResponse = createMockResponse({
        run: {
          info: {
            run_id: "run-456",
          },
        },
      });
      mockHttpPost.mockReturnValue(of(mockResponse));

      const result = await service.createRun("exp-123", "My Run");

      expect(result).toBe("run-456");
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/create",
        {
          experiment_id: "exp-123",
          tags: [{ key: "mlflow.runName", value: "My Run" }],
        },
      );
    });

    it("creates a run without name", async () => {
      const mockResponse = createMockResponse({
        run: {
          info: {
            run_id: "run-789",
          },
        },
      });
      mockHttpPost.mockReturnValue(of(mockResponse));

      const result = await service.createRun("exp-123");

      expect(result).toBe("run-789");
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/create",
        {
          experiment_id: "exp-123",
        },
      );
    });

    it("throws error when run creation fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(service.createRun("exp-123", "My Run")).rejects.toThrow(
        "Failed to create MLflow run",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Log parameters to a run
  // -----------------------------------------------------------------------
  describe("logParams", () => {
    it("logs all parameters to a run", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      const params = {
        dataset_version_id: "v1",
        dataset_git_revision: "abc123",
        workflow_config_hash: "hash456",
        evaluator_type: "schema-aware",
        evaluator_config_hash: "hash789",
      };

      await service.logParams("run-123", params);

      expect(mockHttpPost).toHaveBeenCalledTimes(5);
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/log-parameter",
        {
          run_id: "run-123",
          key: "dataset_version_id",
          value: "v1",
        },
      );
    });

    it("throws error when logging params fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(
        service.logParams("run-123", { key: "value" }),
      ).rejects.toThrow("Failed to log parameters");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Log metrics to a run
  // -----------------------------------------------------------------------
  describe("logMetrics", () => {
    it("logs all metrics to a run", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      const metrics = {
        accuracy: 0.95,
        precision: 0.92,
        recall: 0.88,
      };

      await service.logMetrics("run-123", metrics);

      expect(mockHttpPost).toHaveBeenCalledTimes(3);
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/log-metric",
        expect.objectContaining({
          run_id: "run-123",
          key: "accuracy",
          value: 0.95,
          step: 0,
        }),
      );
    });

    it("throws error when logging metrics fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(
        service.logMetrics("run-123", { accuracy: 0.95 }),
      ).rejects.toThrow("Failed to log metrics");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Set tags on a run
  // -----------------------------------------------------------------------
  describe("setTags", () => {
    it("sets all tags on a run", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      const tags = {
        worker_image_digest: "sha256:abc",
        worker_git_sha: "def456",
        benchmark_run_id: "run-id",
        benchmark_definition_id: "def-id",
        benchmark_project_id: "proj-id",
      };

      await service.setTags("run-123", tags);

      expect(mockHttpPost).toHaveBeenCalledTimes(5);
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/set-tag",
        {
          run_id: "run-123",
          key: "worker_image_digest",
          value: "sha256:abc",
        },
      );
    });

    it("throws error when setting tags fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(
        service.setTags("run-123", { key: "value" }),
      ).rejects.toThrow("Failed to set tags");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Log artifacts to a run
  // -----------------------------------------------------------------------
  describe("logArtifact", () => {
    it("logs warning for artifact upload (not fully implemented)", async () => {
      const loggerWarnSpy = jest.spyOn(service["logger"], "warn");

      await service.logArtifact(
        "run-123",
        "results/output.json",
        Buffer.from("{}"),
      );

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Artifact logging not fully implemented"),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Update run status
  // -----------------------------------------------------------------------
  describe("updateRunStatus", () => {
    it("updates run status to FINISHED", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      await service.updateRunStatus("run-123", MLflowRunStatus.FINISHED);

      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/update",
        expect.objectContaining({
          run_id: "run-123",
          status: MLflowRunStatus.FINISHED,
          end_time: expect.any(Number),
        }),
      );
    });

    it("updates run status to FAILED", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      await service.updateRunStatus("run-123", MLflowRunStatus.FAILED);

      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/update",
        expect.objectContaining({
          run_id: "run-123",
          status: MLflowRunStatus.FAILED,
          end_time: expect.any(Number),
        }),
      );
    });

    it("updates run status to RUNNING without end_time", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({})));

      await service.updateRunStatus("run-123", MLflowRunStatus.RUNNING);

      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/update",
        {
          run_id: "run-123",
          status: MLflowRunStatus.RUNNING,
          end_time: undefined,
        },
      );
    });

    it("throws error when status update fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(
        service.updateRunStatus("run-123", MLflowRunStatus.FINISHED),
      ).rejects.toThrow("Failed to update run status");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Query runs for an experiment
  // -----------------------------------------------------------------------
  describe("queryRuns", () => {
    it("queries runs without filter", async () => {
      const mockRuns = [
        {
          info: {
            run_id: "run-1",
            experiment_id: "exp-123",
            status: "FINISHED",
            start_time: 1234567890,
            artifact_uri: "s3://bucket/path",
            lifecycle_stage: "active",
          },
          data: {
            metrics: { accuracy: 0.95 },
            params: { dataset: "v1" },
            tags: { user: "test" },
          },
        },
      ];

      mockHttpPost.mockReturnValue(of(createMockResponse({ runs: mockRuns })));

      const result = await service.queryRuns("exp-123");

      expect(result).toEqual(mockRuns);
      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/search",
        {
          experiment_ids: ["exp-123"],
        },
      );
    });

    it("queries runs with filter", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({ runs: [] })));

      await service.queryRuns("exp-123", "metrics.accuracy > 0.9");

      expect(mockHttpPost).toHaveBeenCalledWith(
        "http://localhost:5000/api/2.0/mlflow/runs/search",
        {
          experiment_ids: ["exp-123"],
          filter: "metrics.accuracy > 0.9",
        },
      );
    });

    it("returns empty array when no runs found", async () => {
      mockHttpPost.mockReturnValue(of(createMockResponse({ runs: undefined })));

      const result = await service.queryRuns("exp-123");

      expect(result).toEqual([]);
    });

    it("throws error when query fails", async () => {
      mockHttpPost.mockReturnValue(throwError(() => new Error("API error")));

      await expect(service.queryRuns("exp-123")).rejects.toThrow(
        "Failed to query runs",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 9: Configuration via environment variables
  // -----------------------------------------------------------------------
  describe("configuration", () => {
    it("uses MLFLOW_TRACKING_URI from environment", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith(
        "MLFLOW_TRACKING_URI",
        "http://localhost:5000",
      );
    });
  });
});
