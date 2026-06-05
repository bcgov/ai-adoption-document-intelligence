import { PrismaClient } from "@generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions, getPrismaPoolMax, DEFAULT_TEMPORAL_DB_POOL_MAX } from "../utils/database-url";

// Initialize Prisma client (singleton pattern)
let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const dbOptions = getPrismaPgOptions(databaseUrl);

    const poolMax = getPrismaPoolMax(
      process.env.DB_POOL_MAX,
      DEFAULT_TEMPORAL_DB_POOL_MAX,
    );

    // Configure connection pool for horizontal scaling:
    // - max: DB_POOL_MAX (default 3) — lighter load than backend-services
    // - idleTimeoutMillis: Close idle connections after 60s (reduces connection churn)
    // - connectionTimeoutMillis: Fail fast if pool is exhausted
    prismaClient = new PrismaClient({
      adapter: new PrismaPg({
        ...dbOptions,
        max: poolMax,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 5000,
      }),
      log: ["error", "warn"],
    });
  }
  return prismaClient;
}

/**
 * Disconnect Prisma client and close connection pool.
 * Should be called during worker shutdown or test teardown.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
  }
}
