export * from "./types";
export { validateGraphConfig } from "./validator/validator";
export type { ValidateGraphConfigOptions } from "./validator/validator";
export {
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
} from "./validator/context-utils";

// Activity & node catalog (parameter schemas + UI metadata)
export {
  ACTIVITY_CATALOG,
  createCatalogParameterValidator,
  getActivityCatalogEntry,
  getActivityParametersJsonSchema,
  listActivityTypes,
} from "./catalog";
export type {
  ActivityCatalogEntry,
  CatalogCategory,
  PortDescriptor,
  ValidateActivityParameters,
} from "./catalog";
