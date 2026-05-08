import { Test } from "@nestjs/testing";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get(MetricsService);
    service.onModuleInit();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getMetrics", () => {
    it("should return metrics string including default Node.js metrics", async () => {
      const metrics = await service.getMetrics();
      expect(typeof metrics).toBe("string");
      // Default metrics include process and nodejs prefixed metrics
      expect(metrics).toContain("nodejs_");
    });

    it("should include http_requests_total metric definition", async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain("http_requests_total");
    });

    it("should include http_request_duration_seconds metric definition", async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain("http_request_duration_seconds");
    });

    it("should include http_request_errors_total metric definition", async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain("http_request_errors_total");
    });
  });

  describe("getContentType", () => {
    it("should return a valid content type", () => {
      const contentType = service.getContentType();
      expect(contentType).toContain("text/plain");
    });
  });

  describe("httpRequestsTotal", () => {
    it("should increment counter with labels", async () => {
      service.httpRequestsTotal.inc({
        method: "GET",
        path: "/test",
        status_code: "200",
      });

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'http_requests_total{method="GET",path="/test",status_code="200"} 1',
      );
    });
  });

  describe("httpRequestErrorsTotal", () => {
    it("should increment error counter with labels", async () => {
      service.httpRequestErrorsTotal.inc({
        method: "POST",
        path: "/fail",
        status_code: "500",
      });

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'http_request_errors_total{method="POST",path="/fail",status_code="500"} 1',
      );
    });
  });

  describe("httpRequestDurationSeconds", () => {
    it("should observe duration with labels", async () => {
      service.httpRequestDurationSeconds.observe(
        { method: "GET", path: "/test" },
        0.5,
      );

      const metrics = await service.getMetrics();
      expect(metrics).toContain("http_request_duration_seconds_bucket");
      expect(metrics).toContain("http_request_duration_seconds_count");
      expect(metrics).toContain("http_request_duration_seconds_sum");
    });
  });

  describe("handleLogAlert", () => {
    it("should increment app_error_total with severity=warning for warn level", async () => {
      service.handleLogAlert("warn", "classifier_training_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_error_total{type="classifier_training_failed",severity="warning"} 1',
      );
    });

    it("should increment app_error_total with severity=critical for error level", async () => {
      service.handleLogAlert("error", "workflow_activity_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_error_total{type="workflow_activity_failed",severity="critical"} 1',
      );
    });

    it("should track multiple alert types independently", async () => {
      service.handleLogAlert("warn", "classifier_training_failed");
      service.handleLogAlert("error", "ai_service_unavailable");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_error_total{type="classifier_training_failed",severity="warning"} 1',
      );
      expect(metrics).toContain(
        'app_error_total{type="ai_service_unavailable",severity="critical"} 1',
      );
    });

    it("should increment app_recovery_total and clear error state on info after warn", async () => {
      service.handleLogAlert("warn", "classifier_training_failed");
      service.handleLogAlert("info", "classifier_training_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_recovery_total{type="classifier_training_failed"} 1',
      );
    });

    it("should increment app_success_total on info level with alertType", async () => {
      service.handleLogAlert("info", "enrich_results_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_success_total{type="enrich_results_failed"} 1',
      );
    });

    it("should increment app_success_total on debug level with alertType", async () => {
      service.handleLogAlert("debug", "enrich_results_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_success_total{type="enrich_results_failed"} 1',
      );
    });

    it("should increment both app_recovery_total and app_success_total on info after error", async () => {
      service.handleLogAlert("error", "enrich_results_failed");
      service.handleLogAlert("info", "enrich_results_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_recovery_total{type="enrich_results_failed"} 1',
      );
      expect(metrics).toContain(
        'app_success_total{type="enrich_results_failed"} 1',
      );
    });

    it("should increment app_success_total on info even without prior error", async () => {
      service.handleLogAlert("info", "enrich_results_failed");
      service.handleLogAlert("info", "enrich_results_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_success_total{type="enrich_results_failed"} 2',
      );
      // No recovery since there was no prior error
      expect(metrics).not.toContain(
        'app_recovery_total{type="enrich_results_failed"}',
      );
    });

    it("should NOT increment app_recovery_total on info when type was never in error state", async () => {
      service.handleLogAlert("info", "classifier_training_failed");

      const metrics = await service.getMetrics();
      // The metric definition will be present but no labeled data points should appear
      expect(metrics).not.toContain(
        'app_recovery_total{type="classifier_training_failed"}',
      );
    });

    it("should not increment recovery counter twice for repeated info/debug calls", async () => {
      service.handleLogAlert("error", "workflow_failed");
      service.handleLogAlert("info", "workflow_failed");
      service.handleLogAlert("info", "workflow_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain('app_recovery_total{type="workflow_failed"} 1');
    });

    it("should not affect other alert types when recovering one type", async () => {
      service.handleLogAlert("warn", "classifier_training_failed");
      service.handleLogAlert("error", "ai_service_unavailable");
      service.handleLogAlert("info", "classifier_training_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_recovery_total{type="classifier_training_failed"} 1',
      );
      // ai_service_unavailable not yet recovered
      expect(metrics).not.toContain(
        'app_recovery_total{type="ai_service_unavailable"}',
      );
    });
  });

  describe("getMetricsHook", () => {
    it("should return a function", () => {
      expect(typeof service.getMetricsHook()).toBe("function");
    });

    it("should invoke handleLogAlert when the hook is called", async () => {
      const hook = service.getMetricsHook();
      hook("error", "enrich_results_failed");

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'app_error_total{type="enrich_results_failed",severity="critical"} 1',
      );
    });
  });
});
