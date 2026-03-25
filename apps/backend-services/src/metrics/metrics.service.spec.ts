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
});
