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

    it("should return unhealthy when database fails, logging the sanitized DATABASE_URL", async () => {
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL =
        "postgresql://postgres:secret@localhost:5432/ai_doc_intelligence?schema=public";
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
          errorCode: undefined,
          databaseUrl:
            "postgresql://postgres:***@localhost:5432/ai_doc_intelligence?schema=public",
        },
      );

      process.env.DATABASE_URL = originalDatabaseUrl;
    });

    it("includes the error code from Postgres errors", async () => {
      const dbError = Object.assign(new Error("terminating connection"), {
        code: "57P01",
      });
      mockPrismaService.prisma.$queryRaw.mockRejectedValue(dbError);

      await service.checkHealth();

      expect(mockAppLogger.error).toHaveBeenCalledWith(
        "Health check - database failed",
        expect.objectContaining({ errorCode: "57P01" }),
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
