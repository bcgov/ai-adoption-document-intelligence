import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/client";

const POSTGRES_USER = "testuser";
const POSTGRES_PASSWORD = "testpass";
const POSTGRES_DB = "testdb";
const PORT = 5555;

const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${PORT}/${POSTGRES_DB}?schema=public`;

export const openDb = () => {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  });
};

export const closeDb = async (db: PrismaClient) => {
  if (db != undefined) await db.$disconnect();
};
