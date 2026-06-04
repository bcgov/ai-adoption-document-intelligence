import { Injectable } from "@nestjs/common";
import { AppLoggerService } from "@/logging/app-logger.service";
import { PrismaService } from "../database/prisma.service";

export interface HealthCheckResult {
  status: "healthy" | "unhealthy";
  checks: {
    database: "ok" | "error";
  };
  timestamp: string;
  errors?: string[];
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const errors: string[] = [];
    const checks = {
      database: "error" as "ok" | "error",
    };

    // Check database connectivity
    try {
      const startTime = Date.now();
      await this.prisma.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - startTime;
      checks.database = "ok";
      if (duration > 5000) {
        this.logger.warn("Health check - database slow response", {
          category: "health",
          durationMs: duration,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorCode =
        error instanceof Error && "code" in error
          ? (error as Error & { code: string }).code
          : undefined;
      errors.push(`Database: ${message}`);
      this.logger.error("Health check - database failed", {
        category: "health",
        error: message,
        errorCode,
        databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"), // Sanitize password
      });
    }

    const status = checks.database === "ok" ? "healthy" : "unhealthy";

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
      ...(errors.length > 0 && { errors }),
    };
  }
}
