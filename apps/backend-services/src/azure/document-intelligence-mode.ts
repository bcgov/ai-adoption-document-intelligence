export type DocumentIntelligenceMode = "live" | "mock";

/**
 * Resolves backend DI behavior for load/integration environments.
 * Only explicit `"mock"` enables stubbed Azure DI behavior; anything else is treated as live.
 */
export function resolveDocumentIntelligenceMode(
  raw: string | undefined,
): DocumentIntelligenceMode {
  if (raw === "mock") {
    return "mock";
  }
  return "live";
}
