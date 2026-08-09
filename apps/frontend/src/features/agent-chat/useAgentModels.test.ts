/**
 * Item 23 — which model a turn is sent with, given the backend's list and
 * the user's pick. The frontend used to answer this from a hardcoded array
 * and always chose its own first entry (`gpt-5.4`), whatever the server had
 * deployed.
 */

import { describe, expect, it } from "vitest";
import type { AgentModelOption } from "./store";
import { resolveEffectiveModel } from "./useAgentModels";

const AZURE: AgentModelOption = {
  label: "Azure OpenAI — gpt-4o",
  provider: "azure",
  model: "gpt-4o",
  isDefault: true,
};

const CLAUDE: AgentModelOption = {
  label: "Anthropic Claude — claude-haiku-4-5-20251001",
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
