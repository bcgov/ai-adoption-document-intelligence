/**
 * Frontend producer-kind resolver for the variable picker (US-097).
 *
 * Mirrors the backend validator's `resolvePortKind` precedence so the
 * picker's typed-compatibility check agrees with what save-time validation
 * will report:
 *
 *   1. Activity catalog `PortDescriptor.kind` (when an activity / pollUntil
 *      node writes the ctx key via one of its declared outputs).
 *   2. `CtxDeclaration.kind` (when the ctx key is declared on
 *      `config.ctx`).
 *   3. `LibraryPortDescriptor.kind` for library workflows (`metadata.inputs[]`
 *      describes producers that feed the graph).
 *   4. `undefined` — caller treats as `Artifact` wildcard via `isAssignable`.
 *
 * Pure — no I/O, no React. Returns the resolved `KindRef` or `undefined`.
 */

import {
  getActivityCatalogEntry,
  getCtxRootKey,
  type KindRef,
} from "@ai-di/graph-workflow";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  PollUntilNode,
} from "../../../types/workflow";

/**
 * Library port path may be `"ctx.<key>"` or bare `"<key>"`. Matches either
 * shape against the ctx key the variable resolves to. Compares on the
 * root ctx key so nested paths (`doc.X`) still match a library descriptor
 * declared as `ctx.documentMetadata`.
 */
function libraryPortPathMatchesCtxKey(path: string, ctxKey: string): boolean {
  if (path === ctxKey) return true;
  if (path === `ctx.${ctxKey}`) return true;
  const pathRoot = path.startsWith("ctx.")
    ? path.slice(4).split(".")[0]
    : path.split(".")[0];
  const ctxRoot = getCtxRootKey(ctxKey);
  return pathRoot === ctxRoot;
}

/**
 * Find the first activity or pollUntil node in `config.nodes` whose
 * declared `outputs[]` writes `ctxKey`, then read that port's `kind` from
 * the activity catalog. Returns `undefined` if no producing node exists
 * or its catalog entry has no kind on that output.
 */
function resolveCatalogProducerKind(
  ctxKey: string,
  config: GraphWorkflowConfig,
): KindRef | undefined {
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    if (!node.outputs) continue;
    const binding = node.outputs.find((b) => b.ctxKey === ctxKey);
    if (!binding) continue;
    const activityType =
      node.type === "activity"
        ? (node as ActivityNode).activityType
        : (node as PollUntilNode).activityType;
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) continue;
    const portDescriptor = entry.outputs.find((p) => p.name === binding.port);
    if (portDescriptor?.kind !== undefined) {
      return portDescriptor.kind;
    }
  }
  return undefined;
}

/**
 * Resolve the kind of the variable's producer for the given ctx key.
 * See module docstring for the precedence walk.
 */
export function resolveProducerKindFor(
  ctxKey: string,
  config: GraphWorkflowConfig,
): KindRef | undefined {
  // 1. Catalog-declared output kind on a producing activity / pollUntil node.
  const catalogKind = resolveCatalogProducerKind(ctxKey, config);
  if (catalogKind !== undefined) {
    return catalogKind;
  }

  // 2. CtxDeclaration.kind — manual ctx entries (caller-supplied inputs or
  // explicit declarations).
  const rootKey = getCtxRootKey(ctxKey);
  const ctxDecl = config.ctx?.[rootKey];
  if (ctxDecl?.kind !== undefined) {
    return ctxDecl.kind;
  }

  // 3. LibraryPortDescriptor.kind — library workflows declare their
  // input ports (the producers that feed the graph) on `metadata.inputs[]`.
  if (config.metadata?.kind === "library" && config.metadata.inputs) {
    const match = config.metadata.inputs.find((descriptor) =>
      libraryPortPathMatchesCtxKey(descriptor.path, ctxKey),
    );
    if (match?.kind !== undefined) {
      return match.kind;
    }
  }

  return undefined;
}
