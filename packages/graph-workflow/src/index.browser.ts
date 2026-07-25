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

// Auto-wire — resolves typed input ports to nearest compatible upstream
// producers, hiding ctx key bindings from the visual editor's default UX.
// See docs-md/workflow-builder/AUTO_WIRE_DESIGN.md.
export {
  AUTO_CTX_KEY_PREFIX,
  type AutoBoundVia,
  type CtxKeyReferences,
  type CtxKeySource,
  type CtxReader,
  type CtxReadVia,
  type CtxWriter,
  collectCtxReaders,
  collectCtxWriters,
  findCtxKeyReferences,
  findOrphanedCtxKeys,
  getLockedInputPorts,
  getLockedOutputPorts,
  isAutoCtxKey,
  nodeTypeCtxWrites,
  normaliseLocks,
  type OrphanedCtxKey,
  type PortResolution,
  producerCtxKeyForPort,
  pruneCtxDeclarations,
  resolveBindings,
  resolveCtxKeySource,
  resolveInputPort,
  shouldAutoWirePort,
  stripRedundantLocks,
  synthesiseCtxKey,
  upstreamNodesWithDistance,
} from "./auto-wire";
export { computeInputHash } from "./cache/compute-input-hash";
// Cache constants (Phase 4 — try-in-place). Browser-safe: sha256 via @noble/hashes.
export {
  CACHE_TTL_ENV_VAR,
  DEFAULT_CACHE_TTL_MS,
  resolveCacheTtlMs,
} from "./cache/constants";
export { hashArtifact } from "./cache/hash-artifact";
export { sha256Hex } from "./cache/sha256-hex";
export { stableJson } from "./cache/stable-json";
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
  JsDocTagValue,
  ParsedJsDocBlock,
} from "./dynamic-nodes/parse-signature";
// Dynamic-node signature parser (Phase 6, US-158) — JSDoc-parse stage.
// Exported alongside the internal block helper so the semantics layer in
// US-159 can build on the same per-tag record without reparsing.
export {
  parseDynamicNodeSignature,
  parseJsDocBlock,
} from "./dynamic-nodes/parse-signature";
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
export * from "./types";
export * from "./types/index";
export {
  applyCtxNamespace,
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
  resolveCtxBinding,
} from "./validator/context-utils";
export { isValidTemporalDuration } from "./validator/duration";
export type { ValidateGraphConfigOptions } from "./validator/validator";
export { validateGraphConfig } from "./validator/validator";
// Runtime config-override application (develop). Browser-safe — no node:crypto.
export {
  applyWorkflowConfigOverrides,
  isSafeOverridePathSegment,
} from "./workflow-config-overrides";
