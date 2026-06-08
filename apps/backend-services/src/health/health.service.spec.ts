import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  let service: HealthService;
  let mockPrismaService: { prisma: { $queryRaw: jest.Mock } };

  beforeEach(() => {
    mockPrismaService = {
      prisma: {
        $queryRaw: jest.fn(),
      },
    };

    service = new HealthService(mockPrismaService as any, mockAppLogger);
  });

  describe("checkHealth", () => {
    it("should return healthy when database is accessible", async () => {
      mockPrismaService.prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

      const result = await service.checkHealth();

      expect(result.status).toBe("healthy");
      expect(result.checks.database).toBe("ok");
      expect(result.timestamp).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it("should return unhealthy when database fails", async () => {
      const dbError = new Error("Connection refused");
      mockPrismaService.prisma.$queryRaw.mockRejectedValue(dbError);

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.database).toBe("error");
      expect(result.timestamp).toBeDefined();
      expect(result.errors).toEqual(["Database: Connection refused"]);
      expect(mockAppLogger.error).toHaveBeenCalledWith(
        "Health check - database failed",
        {
          category: "health",
          error: "Connection refused",
        },
      );
    });

    it("should handle non-Error objects in database check", async () => {
      mockPrismaService.prisma.$queryRaw.mockRejectedValue("string error");

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.database).toBe("error");
      expect(result.errors).toEqual(["Database: Unknown error"]);
    });
  });
});
