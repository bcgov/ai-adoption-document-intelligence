import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request, Response } from "express";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

describe("MetricsController", () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [MetricsService],
    }).compile();

    controller = module.get(MetricsController);
    metricsService = module.get(MetricsService);
    metricsService.onModuleInit();
  });

  function createMockRequest(
    headers: Record<string, string | undefined> = {},
  ): Request {
    return { headers } as unknown as Request;
  }

  function createMockResponse(): Response {
    const res = {
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response;
  }

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should return metrics for in-cluster requests (no X-Forwarded-Host)", async () => {
    const req = createMockRequest({});
    const res = createMockResponse();

    await controller.getMetrics(req, res);

    expect(res.set).toHaveBeenCalledWith(
      "Content-Type",
      expect.stringContaining("text/plain"),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining("http_requests_total"),
    );
  });

  it("should throw ForbiddenException when X-Forwarded-Host is present", async () => {
    const req = createMockRequest({
      "x-forwarded-host": "example.apps.openshift.com",
    });
    const res = createMockResponse();

    await expect(controller.getMetrics(req, res)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("should include Node.js runtime metrics", async () => {
    const req = createMockRequest({});
    const res = createMockResponse();

    await controller.getMetrics(req, res);

    const metricsOutput = (res.send as jest.Mock).mock.calls[0][0] as string;
    expect(metricsOutput).toContain("nodejs_");
  });

  it("should include RED metric definitions in output", async () => {
    const req = createMockRequest({});
    const res = createMockResponse();

    await controller.getMetrics(req, res);

    const metricsOutput = (res.send as jest.Mock).mock.calls[0][0] as string;
    expect(metricsOutput).toContain("http_requests_total");
    expect(metricsOutput).toContain("http_request_duration_seconds");
    expect(metricsOutput).toContain("http_request_errors_total");
  });
});
