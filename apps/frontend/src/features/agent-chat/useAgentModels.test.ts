/**
 * Item 23 — which model a turn is sent with, given the backend's list and
 * the user's pick. The frontend used to answer this from a hardcoded array
 * and always chose its own first entry (`gpt-5.4`), whatever the server had
 * deployed.
 */

import { describe, expect, it } from "vitest";
import type { AgentModelOption } from "./store";
import {
  describeMissingConfig,
  resolveAgentAvailability,
  resolveEffectiveModel,
} from "./useAgentModels";

const AZURE: AgentModelOption = {
  label: "Azure OpenAI — gpt-4o",
  name: "gpt-4o",
  tier: "Balanced",
  provider: "azure",
  model: "gpt-4o",
  isDefault: true,
};

const CLAUDE: AgentModelOption = {
  label: "Anthropic Claude — claude-haiku-4-5-20251001",
  name: "Haiku 4.5",
  tier: "Fast",
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  isDefault: false,
};

describe("resolveEffectiveModel", () => {
  it("is null while the list is unknown, so the turn carries no override", () => {
    expect(resolveEffectiveModel(undefined, null)).toBeNull();
    expect(resolveEffectiveModel(undefined, CLAUDE)).toBeNull();
  });

  it("is null for an empty list", () => {
    expect(resolveEffectiveModel([], CLAUDE)).toBeNull();
  });

  it("takes the backend's default when the user has not picked", () => {
    expect(resolveEffectiveModel([CLAUDE, AZURE], null)).toEqual(AZURE);
  });

  it("falls back to the first entry when none is flagged default", () => {
    const noDefault = [
      { ...CLAUDE, isDefault: false },
      { ...AZURE, isDefault: false },
    ];
    expect(resolveEffectiveModel(noDefault, null)).toEqual(noDefault[0]);
  });

  it("keeps a pick the backend still offers", () => {
    expect(resolveEffectiveModel([AZURE, CLAUDE], CLAUDE)).toEqual(CLAUDE);
  });

  it("drops a pick the backend no longer offers", () => {
    // e.g. the deployment was re-pointed at a BC Gov gateway.
    expect(resolveEffectiveModel([AZURE], CLAUDE)).toEqual(AZURE);
  });

  it("matches on provider AND model, not on model alone", () => {
    const sameNameOtherProvider: AgentModelOption = {
      ...CLAUDE,
      provider: "azure",
    };
    expect(resolveEffectiveModel([AZURE], sameNameOtherProvider)).toEqual(
      AZURE,
    );
  });
});

/**
 * I1 / D4, 2026-08-14. "The list request failed" and "the server has no model
 * at all" used to be one branch, and it was written for the first: it showed
 * "Server default model" and a tooltip promising an answer. On an
 * unconfigured server that promise was false and the composer stayed live.
 */
describe("resolveAgentAvailability", () => {
  const MISSING = [
    { provider: "anthropic" as const, variables: ["ANTHROPIC_API_KEY"] },
    {
      provider: "azure" as const,
      variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
    },
  ];

  it("is loading while the request is in flight", () => {
    expect(
      resolveAgentAvailability({
        data: undefined,
        isPending: true,
        isError: false,
      }),
    ).toEqual({ kind: "loading" });
  });

  it("is UNKNOWN when the request failed — the server's config is unseen", () => {
    expect(
      resolveAgentAvailability({
        data: undefined,
        isPending: false,
        isError: true,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("is UNCONFIGURED when the server successfully reports no models", () => {
    expect(
      resolveAgentAvailability({
        data: { items: [], missingConfig: MISSING },
        isPending: false,
        isError: false,
      }),
    ).toEqual({ kind: "unconfigured", missingConfig: MISSING });
  });

  it("is ready when the server offers at least one model", () => {
    expect(
      resolveAgentAvailability({
        data: { items: [AZURE], missingConfig: [] },
        isPending: false,
        isError: false,
      }),
    ).toEqual({ kind: "ready", items: [AZURE] });
  });

  it("keeps the two empty-ish cases apart", () => {
    const failed = resolveAgentAvailability({
      data: undefined,
      isPending: false,
      isError: true,
    });
    const empty = resolveAgentAvailability({
      data: { items: [], missingConfig: MISSING },
      isPending: false,
      isError: false,
    });
    expect(failed.kind).not.toBe(empty.kind);
  });
});

describe("describeMissingConfig", () => {
  it("groups a provider's variables with AND and alternatives with OR", () => {
    expect(
      describeMissingConfig([
        { provider: "anthropic", variables: ["ANTHROPIC_API_KEY"] },
        {
          provider: "azure",
          variables: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
        },
      ]),
    ).toBe(
      "ANTHROPIC_API_KEY, or AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT",
    );
  });

  it("is null when nothing is missing", () => {
    expect(describeMissingConfig([])).toBeNull();
  });
});
