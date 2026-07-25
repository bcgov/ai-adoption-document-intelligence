/**
 * Browser-safe entry point for @ai-di/graph-workflow.
 *
 * Exposes the full shared surface the visual builder + agent-chat frontend
 * consume (catalog, auto-wire, dynamic-node DSL, typed-I/O kinds, validator)
 * while EXCLUDING config-hash.ts, which depends on `node:crypto` and is only
 * reachable from the node entry (index.ts). The cache helpers here hash via
 * `@noble/hashes` (pure JS), so they are browser-safe.
 *
 * Vite aliases `@ai-di/graph-workflow` to this file (see apps/frontend/vite.config.ts).
 */
export * from "./types";
export * from "./types/index";
export { validateGraphConfig } from "./validator/validator";
export type { ValidateGraphConfigOptions } from "./validator/validator";
export {
  applyCtxNamespace,
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
  resolveCtxBinding,
} from "./validator/context-utils";
export { isValidTemporalDuration } from "./validator/duration";

// Cache constants (Phase 4 — try-in-place). Browser-safe: sha256 via @noble/hashes.
export { DEFAULT_CACHE_TTL_MS } from "./cache/constants";
export { stableJson } from "./cache/stable-json";
export { sha256Hex } from "./cache/sha256-hex";
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

// Dynamic-node signature DSL (Phase 6) — shared types for the parsed
// signature, version-row record, and structured publish-time parse errors.
export type {
  AllowlistError,
  DynamicNodePort,
  DynamicNodeSignature,
  DynamicNodeVersionRecord,
  JsDocParseError,
  ParseError,
  SignatureSemanticsError,
  TsCheckError,
} from "./dynamic-nodes/types";

// Dynamic-node signature parser (Phase 6, US-158) — JSDoc-parse stage.
// Exported alongside the internal block helper so the semantics layer in
// US-159 can build on the same per-tag record without reparsing.
export {
  parseDynamicNodeSignature,
  parseJsDocBlock,
} from "./dynamic-nodes/parse-signature";
export type {
  JsDocTagValue,
  ParsedJsDocBlock,
} from "./dynamic-nodes/parse-signature";

// Auto-wire — resolves typed input ports to nearest compatible upstream
// producers, hiding ctx key bindings from the visual editor's default UX.
// See docs-md/workflow-builder/AUTO_WIRE_DESIGN.md.
export {
  AUTO_CTX_KEY_PREFIX,
  getLockedInputPorts,
  getLockedOutputPorts,
  isAutoCtxKey,
  normaliseLocks,
  type AutoBoundVia,
  type CtxKeySource,
  type PortResolution,
  resolveBindings,
  resolveCtxKeySource,
  resolveInputPort,
  shouldAutoWirePort,
  stripRedundantLocks,
  synthesiseCtxKey,
  upstreamNodesWithDistance,
} from "./auto-wire";

// Runtime config-override application (develop). Browser-safe — no node:crypto.
export { GraphWorkflowConfig, GraphValidationError } from "./types";
export {
  applyWorkflowConfigOverrides,
  isSafeOverridePathSegment,
} from "./workflow-config-overrides";
