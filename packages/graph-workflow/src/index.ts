export * from "./types";
export { validateGraphConfig } from "./validator/validator";
export type { ValidateGraphConfigOptions } from "./validator/validator";
export {
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
} from "./validator/context-utils";
export { isValidTemporalDuration } from "./validator/duration";

// Activity & node catalog (parameter schemas + UI metadata)
export {
  ACTIVITY_CATALOG,
  CLASSIFICATION_PATTERN_OPERATORS,
  CLASSIFICATION_PATTERN_SCOPES,
  classificationPatternSchema,
  classificationRuleSchema,
  createCatalogParameterValidator,
  documentClassifyParametersSchema,
  documentValidateFieldsParametersSchema,
  getActivityCatalogEntry,
  getActivityParametersJsonSchema,
  listActivityTypes,
  validationRuleSchema,
} from "./catalog";
export type {
  ActivityCatalogEntry,
  CatalogCategory,
  ClassificationPattern,
  ClassificationRule,
  PortDescriptor,
  ValidateActivityParameters,
  ValidationRule,
} from "./catalog";
