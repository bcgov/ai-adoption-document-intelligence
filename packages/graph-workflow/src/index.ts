export * from "./types";
export * from "./types/index";
export { validateGraphConfig } from "./validator/validator";
export type { ValidateGraphConfigOptions } from "./validator/validator";
export {
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
} from "./validator/context-utils";
export { isValidTemporalDuration } from "./validator/duration";

// Cache constants (Phase 4 — try-in-place)
export { DEFAULT_CACHE_TTL_MS } from "./cache/constants";
export { stableJson } from "./cache/stable-json";
export { hashArtifact } from "./cache/hash-artifact";
export { computeInputHash } from "./cache/compute-input-hash";

// Activity & node catalog (parameter schemas + UI metadata)
export {
  ACTIVITY_CATALOG,
  CLASSIFICATION_PATTERN_OPERATORS,
  CLASSIFICATION_PATTERN_SCOPES,
  classificationPatternSchema,
  classificationRuleSchema,
  createCatalogParameterValidator,
  createSourceParameterValidator,
  deriveSourceOutputSchema,
  documentClassifyParametersSchema,
  documentValidateFieldsParametersSchema,
  getActivityCatalogEntry,
  getActivityParametersJsonSchema,
  getProviderDescriptor,
  getSourceCatalogEntry,
  getSourceParametersJsonSchema,
  listActivityTypes,
  listProvidersForKind,
  listSourceTypes,
  PROVIDER_CATALOG,
  SOURCE_CATALOG,
  validationRuleSchema,
} from "./catalog";
export type {
  ActivityCatalogEntry,
  CatalogCategory,
  ClassificationPattern,
  ClassificationRule,
  FieldDescriptor,
  JsonSchema7,
  PortDescriptor,
  ProviderDescriptor,
  SourceCatalogEntry,
  SourceRuntimePattern,
  ValidateActivityParameters,
  ValidateSourceParameters,
  ValidationRule,
} from "./catalog";
