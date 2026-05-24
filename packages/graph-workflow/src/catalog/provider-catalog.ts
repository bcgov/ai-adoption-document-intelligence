/**
 * Provider catalog — a sibling concept layered on top of the activity catalog.
 *
 * Activity entries declare *what step runs*; provider descriptors declare
 * *which third-party service backs a step*. An activity with a `provider`
 * parameter (e.g. the future segmentation node pack) sources its dropdown
 * options from `PROVIDER_CATALOG`. The activity itself stays a single
 * catalog entry — providers are not multiplied across activity entries.
 *
 * Phase 3 seeds two entries (Azure OCR + Mistral OCR) per REQUIREMENTS.md
 * §3.2 D11. The dropdown UX that consumes the catalog ships in Phase 5
 * alongside the segmentation activities — Phase 3 is code-only.
 */

import { type KindRef } from "../types/artifacts";
import { isAssignable } from "../types/subtype-check";

/**
 * Describes a third-party provider that can back an activity parameter.
 *
 * `acceptsKind` is the upstream artifact kind the provider consumes; the
 * Phase 5 dropdown filters this catalog by `listProvidersForKind` so users
 * only see providers compatible with their wired-in producer.
 *
 * `returns` is the artifact kind the provider emits — captured up-front
 * so future port-typing on provider-driven activities can derive their
 * output kind without consulting the provider at runtime.
 *
 * `category` is pre-enumerated to keep the dropdown grouping deterministic.
 * Phase 6's dynamic-node bridge may need a runtime registration API; that
 * is explicitly out of scope for Phase 3.
 */
export interface ProviderDescriptor {
  id: string;
  displayName: string;
  category: "ocr" | "vlm" | "classifier" | "validator";
  acceptsKind: KindRef;
  returns: KindRef;
}

/**
 * Seed entries for Phase 3 per REQUIREMENTS.md §3.2 D11. Full fan-out
 * lands in Phase 5 (segmentation pack).
 */
export const PROVIDER_CATALOG: readonly ProviderDescriptor[] = Object.freeze([
  {
    id: "azure-ocr",
    displayName: "Azure OCR",
    category: "ocr",
    acceptsKind: "Document",
    returns: "OcrResult",
  },
  {
    id: "mistral-ocr",
    displayName: "Mistral OCR",
    category: "ocr",
    acceptsKind: "Document",
    returns: "OcrResult",
  },
]);

/**
 * Lookup a provider by id. Returns `undefined` for unknown ids — callers
 * should treat that as a validation error at workflow-save time.
 */
export function getProviderDescriptor(
  id: string,
): ProviderDescriptor | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

/**
 * Return every provider whose `acceptsKind` is assignable from the
 * parameter. Used by Phase 5+ dropdown UX to filter providers by the
 * upstream producer's kind.
 *
 * `undefined` collapses to the `Artifact` wildcard per `isAssignable`
 * (US-091), which matches every provider.
 */
export function listProvidersForKind(
  acceptsKind: KindRef | undefined,
): ProviderDescriptor[] {
  return PROVIDER_CATALOG.filter((p) => isAssignable(acceptsKind, p.acceptsKind));
}
