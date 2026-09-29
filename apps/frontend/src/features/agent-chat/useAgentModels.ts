import { useQuery } from "@tanstack/react-query";
import { builderFetch } from "../../data/services/builder-fetch";
import type { AgentModelOption, AgentProvider } from "./store";

/**
 * One provider the backend is NOT configured for, and the environment
 * variable NAMES that would configure it. Names only — the backend never puts
 * a value in this response and nothing here would know what to do with one.
 */
export interface AgentProviderRequirement {
  provider: AgentProvider;
  variables: string[];
}

/** The `GET /api/agent/models` body. */
export interface AgentModelsResult {
  items: AgentModelOption[];
  missingConfig: AgentProviderRequirement[];
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
    queryFn: async (): Promise<AgentModelsResult> => {
      const res = await builderFetch("/api/agent/models");
      if (!res.ok) {
        throw new Error(`Failed to load agent models: ${res.status}`);
      }
      const body = (await res.json()) as AgentModelsResult;
      return {
        items: body.items ?? [],
        missingConfig: body.missingConfig ?? [],
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
}

/**
 * What this server can do for the assistant, as four distinct answers.
 *
 * The fourth used to be missing. `options.length === 0` and "the list request
 * failed" were collapsed into one branch that showed the label "Server default
 * model" with a tooltip promising an answer and a fully live composer — so a
 * server with **no model provider configured at all** never said so, and the
 * user typed into a wall (Inderdeep 2026-08-14 — I1; Dylan — D4). They are
 * opposite situations: a failed request means we do not know what the server
 * has, and an empty list means we know exactly what it has, which is nothing.
 */
export type AgentAvailability =
  | { kind: "loading" }
  /** The list request failed — the server's configuration is unknown, so the
   *  composer stays live and the turn goes out with no model override. */
  | { kind: "unknown" }
  /** The server answered, and it has no provider. The assistant cannot run. */
  | { kind: "unconfigured"; missingConfig: AgentProviderRequirement[] }
  | { kind: "ready"; items: AgentModelOption[] };

export function resolveAgentAvailability(query: {
  data: AgentModelsResult | undefined;
  isPending: boolean;
  isError: boolean;
}): AgentAvailability {
  if (query.isPending) return { kind: "loading" };
  if (query.isError || query.data === undefined) return { kind: "unknown" };
  if (query.data.items.length === 0) {
    return { kind: "unconfigured", missingConfig: query.data.missingConfig };
  }
  return { kind: "ready", items: query.data.items };
}

/**
 * The variable names an unconfigured server is missing, as one sentence.
 * Grouped by provider, because "set A" and "set B and C" are alternatives
 * while B and C are required together.
 */
export function describeMissingConfig(
  missingConfig: AgentProviderRequirement[],
): string | null {
  if (missingConfig.length === 0) return null;
  return missingConfig.map((r) => r.variables.join(" and ")).join(", or ");
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
