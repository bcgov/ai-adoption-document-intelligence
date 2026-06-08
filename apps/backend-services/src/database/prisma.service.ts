import { Prisma, PrismaClient } from "@generated/client";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getPrismaPgOptions } from "@/utils/database-url";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly prisma: PrismaClient;
  private readonly shouldLogQueries: boolean;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.shouldLogQueries = process.env.PRISMA_LOG_QUERIES === "true";
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );

    // Configure connection pool for horizontal scaling:
    // - max: 5 connections per pod (vs default 10) to prevent exhausting DB max_connections
    // - With 3 pods: 15 backend + 3 temporal = 18 connections (Postgres default is 100)
    // - idleTimeoutMillis: Close idle connections after 60s (reduces connection churn)
    // - connectionTimeoutMillis: Fail fast if pool is exhausted
    const adapter = new PrismaPg({
      ...dbOptions,
      max: parseInt(process.env.DB_POOL_MAX ?? "5", 10),
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
    });
    if (this.shouldLogQueries) {
      this.prisma = new PrismaClient({
        log: [
          { emit: "event", level: "warn" },
          { emit: "event", level: "error" },
          { emit: "event", level: "query" },
        ] as const,
        adapter,
      });
    } else {
      this.prisma = new PrismaClient({
        log: [
          { emit: "event", level: "warn" },
          { emit: "event", level: "error" },
        ] as const,
        adapter,
      });
    }

    if (this.shouldLogQueries) {
      this.logger.log("Prisma query logging enabled", { category: "prisma" });
    }
  }

  onModuleInit(): void {
    const prismaForBaseLogs = this.prisma as PrismaClient<{
      log: [
        { emit: "event"; level: "warn" },
        { emit: "event"; level: "error" },
      ];
    }>;

    prismaForBaseLogs.$on("warn", (e) => {
      this.logger.warn(e.message, { category: "external", target: e.target });
    });
    prismaForBaseLogs.$on("error", (e) => {
      this.logger.error(e.message, { category: "external", target: e.target });
    });
    const url = this.configService.get<string>("DATABASE_URL");
    const dbInfo = this.getDatabaseInfo(url);
    this.logger.log(`Prisma client initialized; database: ${dbInfo}`, {
      category: "database",
    });

    if (this.shouldLogQueries) {
      const prismaForQueryLogs = this.prisma as PrismaClient<{
        log: [
          { emit: "event"; level: "warn" },
          { emit: "event"; level: "error" },
          { emit: "event"; level: "query" },
        ];
      }>;

      prismaForQueryLogs.$on("query", (e: Prisma.QueryEvent) => {
        this.logger.debug(
          `Prisma query (${e.duration}ms): ${e.query} | params: ${e.params}`,
          { category: "prisma" },
        );
      });
    }
  }

  /**
   * Returns a short, safe description of the database (host/database name) for logging.
   * Avoids logging passwords or full connection strings.
   */
  private getDatabaseInfo(url: string | undefined): string {
    if (!url || url === "") return "<not set>";
    try {
      const parsed = new URL(url);
      const dbName = parsed.pathname?.replace(/^\//, "") || "<default>";
      const host = parsed.hostname || parsed.host || "<unknown>";
      return `${host}/${dbName}`;
    } catch {
      return "<invalid URL>";
    }
  }

  /**
   * Executes a function within a Prisma transaction.
   * Use this in service methods to define atomic operation boundaries
   * without accessing Prisma directly.
   *
   * @param fn - An async function that receives a TransactionClient and performs database operations.
   * @returns The result of the provided function.
   */
  async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  /**
   * Gracefully close database connections on shutdown.
   * Called automatically by NestJS during application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log("Closing database connections...", {
      category: "database",
    });
    await this.prisma.$disconnect();
    this.logger.log("Database connections closed", { category: "database" });
  }
}
