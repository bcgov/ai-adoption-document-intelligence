import { HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  let mockHealthService: { checkHealth: jest.Mock };
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockHealthService = {
      checkHealth: jest.fn(),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    controller = new HealthController(mockHealthService as any);
  });

  describe("getHealth", () => {
    it("should return 200 when health check passes", async () => {
      const mockResult = {
        status: "healthy" as const,
        checks: { database: "ok" as const },
        timestamp: "2026-05-28T17:00:00.000Z",
      };
      mockHealthService.checkHealth.mockResolvedValue(mockResult);

      await controller.getHealth(mockResponse as Response);

      expect(mockHealthService.checkHealth).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it("should return 503 when health check fails", async () => {
      const mockResult = {
        status: "unhealthy" as const,
        checks: { database: "error" as const },
        timestamp: "2026-05-28T17:00:00.000Z",
        errors: ["Database: Connection refused"],
      };
      mockHealthService.checkHealth.mockResolvedValue(mockResult);

      await controller.getHealth(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe("getLiveness", () => {
    it("should always return 200 with ok status", async () => {
      await controller.getLiveness(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith({ status: "ok" });
    });
  });

  describe("getReadiness", () => {
    it("should return 200 when dependencies are ready", async () => {
      const mockResult = {
        status: "healthy" as const,
        checks: { database: "ok" as const },
        timestamp: "2026-05-28T17:00:00.000Z",
      };
      mockHealthService.checkHealth.mockResolvedValue(mockResult);

      await controller.getReadiness(mockResponse as Response);

      expect(mockHealthService.checkHealth).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });

    it("should return 503 when dependencies are not ready", async () => {
      const mockResult = {
        status: "unhealthy" as const,
        checks: { database: "error" as const },
        timestamp: "2026-05-28T17:00:00.000Z",
        errors: ["Database: Connection timeout"],
      };
      mockHealthService.checkHealth.mockResolvedValue(mockResult);

      await controller.getReadiness(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(mockResult);
    });
  });
});
