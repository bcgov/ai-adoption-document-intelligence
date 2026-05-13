import "dotenv/config";

/** Validated configuration read from environment variables at startup. */
export interface Config {
  port: number;
  adapterSecret: string;
  chesClientId: string;
  chesClientSecret: string;
  chesAuthHost: string;
  chesHost: string;
  chesFromEmail: string;
  chesToEmails: string[];
}

/**
 * Reads and validates required environment variables.
 * Throws if any required variable is missing.
 * @returns Validated {@link Config} object.
 */
export function getConfig(): Config {
  const required = [
    "CHES_ADAPTER_SECRET",
    "CHES_CLIENT_ID",
    "CHES_CLIENT_SECRET",
    "CHES_AUTH_HOST",
    "CHES_HOST",
    "CHES_FROM_EMAIL",
    "CHES_TO_EMAILS",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    port: parseInt(process.env["PORT"] ?? "3003", 10),
    adapterSecret: process.env["CHES_ADAPTER_SECRET"]!,
    chesClientId: process.env["CHES_CLIENT_ID"]!,
    chesClientSecret: process.env["CHES_CLIENT_SECRET"]!,
    chesAuthHost: process.env["CHES_AUTH_HOST"]!,
    chesHost: process.env["CHES_HOST"]!,
    chesFromEmail: process.env["CHES_FROM_EMAIL"]!,
    chesToEmails: process.env["CHES_TO_EMAILS"]!.split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  };
}
