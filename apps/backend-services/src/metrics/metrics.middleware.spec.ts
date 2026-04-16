import type { Request, Response } from "express";
import { MetricsMiddleware } from "./metrics.middleware";
import { MetricsService } from "./metrics.service";

describe("MetricsMiddleware", () => {
  let middleware: MetricsMiddleware;
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
    middleware = new MetricsMiddleware(metricsService);
  });

  function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      method: "GET",
      path: "/test",
      route: undefined,
      ...overrides,
    } as unknown as Request;
  }

  function createMockResponse(): Response & {
    triggerFinish: () => void;
  } {
    const listeners: Record<string, Array<() => void>> = {};
    return {
      statusCode: 200,
      on(event: string, callback: () => void) {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(callback);
        return this;
      },
      triggerFinish() {
        for (const cb of listeners["finish"] ?? []) {
          cb();
        }
      },
    } as unknown as Response & { triggerFinish: () => void };
  }

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  it("should call next for non-metrics paths", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should skip metrics collection for /metrics path", () => {
    const req = createMockRequest({ path: "/metrics" });
    const res = createMockResponse();
    const next = jest.fn();

    const incSpy = jest.spyOn(metricsService.httpRequestsTotal, "inc");

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(next).toHaveBeenCalled();
    expect(incSpy).not.toHaveBeenCalled();
  });

  it("should increment httpRequestsTotal on response finish", () => {
    const req = createMockRequest({ method: "POST", path: "/api/data" });
    const res = createMockResponse();
    res.statusCode = 201;
    const next = jest.fn();

    const incSpy = jest.spyOn(metricsService.httpRequestsTotal, "inc");

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(incSpy).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/data",
      status_code: "201",
    });
  });

  it("should observe duration in httpRequestDurationSeconds on response finish", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    const observeSpy = jest.spyOn(
      metricsService.httpRequestDurationSeconds,
      "observe",
    );

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(observeSpy).toHaveBeenCalledWith(
      { method: "GET", path: "/test" },
      expect.any(Number),
    );
  });

  it("should increment httpRequestErrorsTotal for 4xx status codes", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    res.statusCode = 404;
    const next = jest.fn();

    const errorIncSpy = jest.spyOn(
      metricsService.httpRequestErrorsTotal,
      "inc",
    );

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(errorIncSpy).toHaveBeenCalledWith({
      method: "GET",
      path: "/test",
      status_code: "404",
    });
  });

  it("should increment httpRequestErrorsTotal for 5xx status codes", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    res.statusCode = 500;
    const next = jest.fn();

    const errorIncSpy = jest.spyOn(
      metricsService.httpRequestErrorsTotal,
      "inc",
    );

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(errorIncSpy).toHaveBeenCalledWith({
      method: "GET",
      path: "/test",
      status_code: "500",
    });
  });

  it("should NOT increment httpRequestErrorsTotal for 2xx status codes", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    res.statusCode = 200;
    const next = jest.fn();

    const errorIncSpy = jest.spyOn(
      metricsService.httpRequestErrorsTotal,
      "inc",
    );

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(errorIncSpy).not.toHaveBeenCalled();
  });

  it("should NOT increment httpRequestErrorsTotal for 3xx status codes", () => {
    const req = createMockRequest();
    const res = createMockResponse();
    res.statusCode = 302;
    const next = jest.fn();

    const errorIncSpy = jest.spyOn(
      metricsService.httpRequestErrorsTotal,
      "inc",
    );

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(errorIncSpy).not.toHaveBeenCalled();
  });

  it("should use route path when available instead of raw path", () => {
    const req = createMockRequest({
      method: "GET",
      path: "/api/documents/123",
      route: { path: "/api/documents/:id" } as unknown as Request["route"],
    });
    const res = createMockResponse();
    const next = jest.fn();

    const incSpy = jest.spyOn(metricsService.httpRequestsTotal, "inc");

    middleware.use(req, res, next);
    res.triggerFinish();

    expect(incSpy).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/documents/:id",
      status_code: "200",
    });
  });
});
