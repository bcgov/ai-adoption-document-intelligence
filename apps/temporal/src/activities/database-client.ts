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
    prismaClient = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
      log: ["error", "warn"],
    });
  }
  return prismaClient;
}
