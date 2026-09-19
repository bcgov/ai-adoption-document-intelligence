import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

export const BENCH_DIR = resolve(__dirname, "..");
export const CACHE_DIR = resolve(BENCH_DIR, ".cache");
export const FORMS_FILE = resolve(BENCH_DIR, "forms.json");

// Repo-root .env, then the backend's own .env; neither overrides variables already set.
for (const envFile of [
  resolve(BENCH_DIR, "../../../../.env"),
  resolve(BENCH_DIR, "../../.env"),
]) {
  if (existsSync(envFile)) loadEnv({ path: envFile, quiet: true });
}

export interface BenchForm {
  id: string;
  title: string;
  url: string;
  pages: number;
}

export function readForms(): BenchForm[] {
  return JSON.parse(readFileSync(FORMS_FILE, "utf-8")) as BenchForm[];
}

export interface BenchSettings {
  backendUrl: string;
  apiKey: string;
  groupId: string;
}

export function readSettings(
  env: NodeJS.ProcessEnv = process.env,
): BenchSettings {
  const apiKey = env.BENCH_API_KEY ?? env.TEST_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Set BENCH_API_KEY (or TEST_API_KEY) to an API key for the bench group.",
    );
  }
  return {
    backendUrl: (env.BENCH_BACKEND_URL ?? "http://localhost:3002").replace(
      /\/+$/,
      "",
    ),
    apiKey,
    groupId: env.BENCH_GROUP_ID ?? "seeddefaultgroup",
  };
}
