import { describeModel } from "./model-descriptors";

/**
 * I3, 2026-08-14 — Inderdeep's composer mock-up puts a short model name and a
 * one-line tier ("Sonnet 4.5 · Balanced") in the composer footer. The names in
 * the mock-up are illustrative, so the real ones have to come from whatever
 * model this backend is actually configured for. The rule under test is that
 * a tier is only ever produced for a model FAMILY the vendor itself
 * positions — never guessed from an arbitrary deployment name.
 */
describe("describeModel — Anthropic", () => {
  it.each([
    ["claude-haiku-4-5-20251001", "Haiku 4.5", "Fast"],
    ["claude-sonnet-4-5-20250929", "Sonnet 4.5", "Balanced"],
    ["claude-opus-4-6", "Opus 4.6", "Deep reasoning"],
    ["claude-3-5-sonnet-20241022", "Sonnet 3.5", "Balanced"],
  ])("describes %s as %s / %s", (model, name, tier) => {
    expect(describeModel("anthropic", model)).toEqual({ name, tier });
  });

  it("keeps the raw id when it names no recognisable family", () => {
    expect(describeModel("anthropic", "some-private-alias")).toEqual({
      name: "some-private-alias",
      tier: null,
    });
  });
});

describe("describeModel — Azure", () => {
  it("shows the deployment name verbatim, because that is what the portal shows", () => {
    expect(describeModel("azure", "bcgov-shared-gpt").name).toBe(
      "bcgov-shared-gpt",
    );
  });

  it.each([
    ["gpt-4o", "Balanced"],
    ["gpt-4.1", "Balanced"],
    ["gpt-5.4", "Balanced"],
    ["gpt-4o-mini", "Fast"],
    ["gpt-5.4-mini", "Fast"],
    ["o3-pro", "Deep reasoning"],
  ])("reads the tier of %s as %s", (model, tier) => {
    expect(describeModel("azure", model).tier).toBe(tier);
  });

  it("prefers the mini reading over the flagship one", () => {
    // `gpt-4o-mini` is a mini before it is a 4o; order in the table matters.
    expect(describeModel("azure", "gpt-4o-mini").tier).toBe("Fast");
  });

  it("leaves an unrecognised deployment name undescribed", () => {
    // The honest outcome for a deployment someone named after their team:
    // the picker shows the name alone rather than inventing a tier.
    expect(describeModel("azure", "bcgov-shared-gpt").tier).toBeNull();
    expect(describeModel("azure", "invoice-model").tier).toBeNull();
  });
});
