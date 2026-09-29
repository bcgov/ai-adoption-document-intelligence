import type { AgentProvider } from "./agent.env";

/**
 * How one model is presented in the chat composer's inline picker: a short
 * name, and a one-line descriptor of what picking it buys you.
 */
export interface AgentModelDescriptor {
  /**
   * The short name shown in bold — "Haiku 4.5" rather than
   * `claude-haiku-4-5-20251001`. Falls back to the model id verbatim.
   */
  name: string;
  /**
   * The one-line descriptor shown under (or beside) the name — "Fast",
   * "Balanced", "Deep reasoning" — or `null` when this backend has nothing
   * real to say about the model.
   *
   * Tiers are **not** invented per deployment. They are read off the model
   * FAMILY the id names, using each vendor's own published positioning of
   * that family: Anthropic's haiku / sonnet / opus line-up, and OpenAI's
   * mini-and-nano / flagship / o-series-reasoning line-up. An id that names
   * no family we recognise — the normal case for a privately-named Azure
   * deployment such as `bcgov-shared-gpt` — gets `null`, and the picker then
   * shows the name on its own rather than guessing.
   */
  tier: string | null;
}

const FAST = "Fast";
const BALANCED = "Balanced";
const DEEP = "Deep reasoning";

/** Anthropic's own positioning of its three model families. */
const ANTHROPIC_FAMILY_TIER: Record<string, string> = {
  haiku: FAST,
  sonnet: BALANCED,
  opus: DEEP,
};

/**
 * Azure deployment names are chosen by whoever created the deployment, so
 * the only signal available is the OpenAI model family token the name
 * happens to carry. Matched in order — `gpt-4o-mini` is a mini before it is
 * a 4o — and anything that matches nothing is left undescribed.
 */
const AZURE_FAMILY_TIERS: Array<{ match: RegExp; tier: string }> = [
  { match: /(^|[-_.])(mini|nano)([-_.]|$)/i, tier: FAST },
  { match: /(^|[-_.])o[1-9]([-_.]|$)/i, tier: DEEP },
  { match: /gpt-?(4o|4\.1|5(\.\d+)?)/i, tier: BALANCED },
];

/**
 * `claude-haiku-4-5-20251001` → `Haiku 4.5`, `claude-3-5-sonnet-20241022` →
 * `Sonnet 3.5`. Both orderings exist in Anthropic's id history, so both are
 * matched; anything else keeps the raw id.
 */
const ANTHROPIC_NAME_PATTERNS: RegExp[] = [
  /^claude-(?<family>haiku|sonnet|opus)-(?<major>\d+)-(?<minor>\d+)/i,
  /^claude-(?<major>\d+)-(?<minor>\d+)-(?<family>haiku|sonnet|opus)/i,
  /^claude-(?<major>\d+)-(?<family>haiku|sonnet|opus)/i,
];

/** Read the family token out of an Anthropic model id, if it names one. */
function anthropicFamily(model: string): string | null {
  const match = /(haiku|sonnet|opus)/i.exec(model);
  return match === null ? null : match[1].toLowerCase();
}

function anthropicName(model: string): string {
  for (const pattern of ANTHROPIC_NAME_PATTERNS) {
    const groups = pattern.exec(model)?.groups;
    if (groups === undefined) continue;
    const family = groups.family.toLowerCase();
    const capitalised = family.charAt(0).toUpperCase() + family.slice(1);
    const version =
      groups.minor === undefined
        ? groups.major
        : `${groups.major}.${groups.minor}`;
    return `${capitalised} ${version}`;
  }
  return model;
}

/**
 * Describe one (provider, model) pair for the picker.
 *
 * For Azure the `model` is the **deployment name**, which is also what the
 * API call needs, so it is shown verbatim: renaming somebody's deployment in
 * the UI would hide the one string they have to match against their portal.
 */
export function describeModel(
  provider: AgentProvider,
  model: string,
): AgentModelDescriptor {
  if (provider === "anthropic") {
    const family = anthropicFamily(model);
    return {
      name: anthropicName(model),
      tier: family === null ? null : (ANTHROPIC_FAMILY_TIER[family] ?? null),
    };
  }
  const azureTier = AZURE_FAMILY_TIERS.find((entry) => entry.match.test(model));
  return { name: model, tier: azureTier?.tier ?? null };
}
