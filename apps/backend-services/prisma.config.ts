import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "../shared/prisma/schema.prisma",
  migrations: {
    path: "../shared/prisma/migrations",
    seed: "tsx ../shared/prisma/seed.ts",
  },
  // Generate client locally in this app
  generator: {
    client: {
      output: "./src/generated",
    },
  },
  // This is used for migrations, generations, etc. Not in-app.
  datasource: {
    url: env("DATABASE_URL"),
  },
});
