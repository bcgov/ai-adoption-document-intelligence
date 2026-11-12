/**
 * Shared AI Hub configuration for live provider activities.
 */
export interface AiHubConfig {
  endpoint: string;
  apiKey: string;
}

/**
 * Reads the shared AI Hub tenant base URL and subscription key.
 *
 * @param env - Environment source, defaulting to the current process environment.
 * @returns A normalized tenant base URL and its API key.
 * @throws If either required setting is missing.
 */
export function readAiHubConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiHubConfig {
  const endpoint = env.AI_HUB_ENDPOINT?.trim().replace(/\/+$/, "");
  const apiKey = env.AI_HUB_API_KEY?.trim();
  if (!endpoint || !apiKey) {
    throw new Error(
      "AI Hub configuration missing. Set AI_HUB_ENDPOINT and AI_HUB_API_KEY.",
    );
  }
  return { endpoint, apiKey };
}
