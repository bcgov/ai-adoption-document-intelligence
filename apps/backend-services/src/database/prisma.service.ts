import { Prisma, PrismaClient } from "@generated/client";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppLoggerService } from "@/logging/app-logger.service";
import { getPrismaPgOptions } from "@/utils/database-url";

@Injectable()
export class PrismaService implements OnModuleInit {
  public readonly prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const shouldLogQueries =
      process.env.PRISMA_LOG_QUERIES === "true" ||
      process.env.NODE_ENV !== "production";
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );

    const prismaLog: Array<{
      emit: "event";
      level: "warn" | "error" | "query";
    }> = [
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ];
    if (shouldLogQueries) {
      prismaLog.push({ emit: "event", level: "query" });
    }

    this.prisma = new PrismaClient({
      log: prismaLog,
      adapter: new PrismaPg(dbOptions),
    });

    if (shouldLogQueries) {
      this.logger.log("Prisma query logging enabled", { category: "prisma" });
    }
  }

  onModuleInit(): void {
    this.prisma.$on("warn", (e: { message: string; target?: string }) => {
      this.logger.warn(e.message, { category: "external", target: e.target });
    });
    this.prisma.$on("error", (e: { message: string; target?: string }) => {
      this.logger.error(e.message, { category: "external", target: e.target });
    });
    const url = this.configService.get<string>("DATABASE_URL");
    const dbInfo = this.getDatabaseInfo(url);
    this.logger.log(`Prisma client initialized; database: ${dbInfo}`, {
      category: "database",
    });

    if (
      process.env.PRISMA_LOG_QUERIES === "true" ||
      process.env.NODE_ENV !== "production"
    ) {
      this.prisma.$on(
        "query",
        (e: { query: string; params: string; duration: number }) => {
          this.logger.debug(
            `Prisma query (${e.duration}ms): ${e.query} | params: ${e.params}`,
            { category: "prisma" },
          );
        },
      );
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
}
