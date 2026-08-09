import { useQuery } from "@tanstack/react-query";
import { builderFetch } from "../../data/services/builder-fetch";
import type { AgentModelOption } from "./store";

interface AgentModelsResponse {
  items: AgentModelOption[];
}

/**
 * The models this backend is configured to serve (`GET /api/agent/models`).
 *
 * The picker renders exactly this, so it can never offer a model the server
 * cannot call — the failure Inderdeep hit on 2026-08-06 (item 23), where the
 * frontend's hardcoded first entry (`gpt-5.4`) was sent on every turn no
 * matter what deployment the backend actually had.
 *
 * The list is a property of the deployment, not of the session, so it is
 * cached for the tab's lifetime and never retried into a spinner loop: a
 * failure leaves the drawer usable, sending with no model override.
 */
export function useAgentModels() {
  return useQuery({
    queryKey: ["agent", "models"],
    queryFn: async (): Promise<AgentModelOption[]> => {
      const res = await builderFetch("/api/agent/models");
      if (!res.ok) {
        throw new Error(`Failed to load agent models: ${res.status}`);
      }
      const body = (await res.json()) as AgentModelsResponse;
      return body.items;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

/**
 * The model a turn will actually be sent with, given what the backend offers
 * and what the user picked.
 *
 * A pure derivation rather than a stored default: the user's choice is the
 * only thing worth remembering, and everything else follows from the list.
 *
 *  - No list yet (loading, or the request failed) → `null`, and the turn goes
 *    out with no `provider`/`model` at all so the backend uses its own
 *    configured default.
 *  - A choice the backend still offers → that choice.
 *  - A choice the backend has stopped offering (a re-pointed deployment) →
 *    the backend's default, so a stale selection cannot outlive the config.
 */
export function resolveEffectiveModel(
  models: AgentModelOption[] | undefined,
  chosen: AgentModelOption | null,
): AgentModelOption | null {
  if (models === undefined || models.length === 0) return null;
  if (chosen !== null) {
    const match = models.find(
      (m) => m.provider === chosen.provider && m.model === chosen.model,
    );
    if (match !== undefined) return match;
  }
  return models.find((m) => m.isDefault) ?? models[0];
}
