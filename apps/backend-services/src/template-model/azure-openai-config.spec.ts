import { DEFAULT_AZURE_OPENAI_API_VERSION } from "./azure-openai-config";

describe("DEFAULT_AZURE_OPENAI_API_VERSION", () => {
  it("is the version label suggestions were built and tested against", () => {
    // suggestion-llm.ts and format-suggestion.service.ts both read this one
    // constant so they cannot drift back into defaulting to two different
    // Azure OpenAI API versions.
    expect(DEFAULT_AZURE_OPENAI_API_VERSION).toBe("2024-10-21");
  });
});
