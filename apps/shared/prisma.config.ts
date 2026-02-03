import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // This is used for migrations, generations, etc. Not in-app.
  datasource: {
    url: env("DATABASE_URL"),
  },
});
