import { PrismaClient } from "@generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "../utils/database-url";

// Initialize Prisma client (singleton pattern)
let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const dbOptions = getPrismaPgOptions(databaseUrl);

    // Configure connection pool for horizontal scaling:
    // - max: 3 connections per worker pod (lighter load than backend-services)
    // - idleTimeoutMillis: Close idle connections after 30s
    // - connectionTimeoutMillis: Fail fast if pool is exhausted
    prismaClient = new PrismaClient({
      adapter: new PrismaPg({
        ...dbOptions,
        pool: {
          max: parseInt(process.env.DB_POOL_MAX ?? "3", 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
      log: ["error", "warn"],
    });
  }
  return prismaClient;
}
