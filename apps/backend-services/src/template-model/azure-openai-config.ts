/**
 * Default `AZURE_OPENAI_API_VERSION` shared by every template-model feature
 * that calls Azure OpenAI directly (label suggestions, field suggestions,
 * format suggestions) when the setting is not configured, so they agree on
 * one version rather than each guessing its own. This is the version the
 * label-suggestion features were built and tested against; see
 * docs-md/architecture/TEMPLATE_MODELS.md.
 */
export const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";
