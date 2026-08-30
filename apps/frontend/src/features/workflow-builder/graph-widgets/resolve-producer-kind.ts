/**
 * Frontend producer-kind resolver for the variable picker (US-097).
 *
 * Mirrors the backend validator's `resolvePortKind` precedence so the
 * picker's typed-compatibility check agrees with what save-time validation
 * will report:
 *
 *   0. Map-item unwrap — a map node's `itemCtxKey` has the ELEMENT kind of
 *      its collection (KIND_FIELD_SCHEMAS_DESIGN.md §4 step 1). The item key
 *      exists only inside the map body and shadows any same-named producer,
 *      so it goes first. The collection's kind is resolved recursively
 *      through this same precedence walk (NOT the package's
 *      `resolveMapElementKind`, which only sees catalog producers —
 *      collections declared on ctx or fed by sources must unwrap too).
 *   1. Activity catalog `PortDescriptor.kind` (when an activity / pollUntil
 *      node writes the ctx key via one of its declared outputs).
 *   1b. Source-node synthetic producers — `source.upload` (catalog
 *      `outputKind` at `parameters.ctxKey ?? "documentUrl"`) and
 *      `source.api` (per-field `kind ?? "Artifact"`), mirroring the
 *      validator's `enumerateSourceProducers`.
 *   2. `CtxDeclaration.kind` (when the ctx key is declared on
 *      `config.ctx`).
 *   3. `LibraryPortDescriptor.kind` for library workflows (`metadata.inputs[]`
 *      describes producers that feed the graph).
 *   4. `undefined` — caller treats as `Artifact` wildcard via `isAssignable`.
 *
 * Pure — no I/O, no React. Returns the resolved `KindRef` or `undefined`.
 */

import {
  type FieldDescriptor,
  getActivityCatalogEntry,
  getCtxRootKey,
  getSourceCatalogEntry,
  type KindRef,
} from "@ai-di/graph-workflow";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  MapNode,
  PollUntilNode,
  SourceNode,
} from "../../../types/workflow";
import { splitKindRef } from "../canvas/artifact-kind-colour";
import { analyzeMapBody } from "../settings/control-flow/map-body-analysis";

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
 * Mirror of the backend validator's `enumerateSourceProducers`
 * (packages/graph-workflow validator). Source nodes have no `outputs[]`
 * bindings — they write directly to ctx via their catalog entry — so the
 * picker must synthesise their producer kinds the same way save-time
 * validation does:
 *
 *   - `source.upload` writes a single ctx key (`parameters.ctxKey ??
 *     "documentUrl"`) with the catalog entry's `outputKind`.
 *   - `source.api` writes one ctx key per `parameters.fields[]` row,
 *     keyed by `field.name`, with `field.kind ?? "Artifact"`.
 *
 * Returns the matching producer's kind, or `undefined` when no source
 * node produces `ctxKey`.
 */
function resolveSourceProducerKind(
  ctxKey: string,
  config: GraphWorkflowConfig,
): KindRef | undefined {
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "source") continue;
    const sourceNode = node as SourceNode;
    const entry = getSourceCatalogEntry(sourceNode.sourceType);
    if (!entry) continue;

    if (sourceNode.sourceType === "source.upload") {
      const params = sourceNode.parameters as { ctxKey?: unknown } | undefined;
      const producedKey =
        typeof params?.ctxKey === "string" && params.ctxKey.length > 0
          ? params.ctxKey
          : "documentUrl";
      if (producedKey === ctxKey) {
        return entry.outputKind;
      }
      continue;
    }

    if (sourceNode.sourceType === "source.api") {
      const rawFields = (
        sourceNode.parameters as { fields?: unknown } | undefined
      )?.fields;
      if (!Array.isArray(rawFields)) continue;
      for (const raw of rawFields) {
        const field = raw as FieldDescriptor;
        if (!field || typeof field.name !== "string") continue;
        if (field.name === ctxKey) {
          return field.kind ?? "Artifact";
        }
      }
    }
  }
  return undefined;
}

/**
 * Map-item unwrap (KIND_FIELD_SCHEMAS_DESIGN.md §4 step 1, first in
 * precedence): a map node's `itemCtxKey` has the ELEMENT kind of its
 * collection. The collection's kind is resolved recursively through this
 * module's own precedence walk (NOT the package's `resolveMapElementKind`,
 * which only sees catalog producers — collections declared on ctx or fed by
 * sources must unwrap too). `visitedMaps` breaks self-referential cycles.
 */
function resolveMapItemKind(
  ctxKey: string,
  config: GraphWorkflowConfig,
  visitedMaps: Set<string>,
  consumerNodeId: string | undefined,
): KindRef | undefined {
  // The item key only exists INSIDE the owning map's body. Without a consumer
  // node we cannot tell whether the caller sits in that body, so we do not
  // unwrap — otherwise a same-named producer elsewhere in the graph would be
  // shadowed graph-wide, and two maps sharing an itemCtxKey would resolve by
  // node order. Scoping to the consumer's body fixes both.
  if (consumerNodeId === undefined) return undefined;
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as MapNode;
    if (mapNode.itemCtxKey !== ctxKey) continue;
    if (!mapNode.collectionCtxKey) continue;
    if (visitedMaps.has(nodeId)) continue;
    const { bodyNodeIds } = analyzeMapBody(
      config,
      mapNode.bodyEntryNodeId,
      mapNode.bodyExitNodeId,
    );
    if (!bodyNodeIds.includes(consumerNodeId)) continue;
    visitedMaps.add(nodeId);
    const collectionKind = resolveInner(
      mapNode.collectionCtxKey,
      config,
      visitedMaps,
      consumerNodeId,
    );
    if (collectionKind !== undefined) {
      const { baseKind, isArray } = splitKindRef(collectionKind);
      if (isArray) return baseKind as KindRef;
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
  consumerNodeId?: string,
): KindRef | undefined {
  return resolveInner(ctxKey, config, new Set(), consumerNodeId);
}

function resolveInner(
  ctxKey: string,
  config: GraphWorkflowConfig,
  visitedMaps: Set<string>,
  consumerNodeId: string | undefined,
): KindRef | undefined {
  // 0. Map-item unwrap — the item key exists only inside the OWNING map's body
  // and shadows any same-named producer THERE, so it goes first — but only when
  // the consumer node is actually inside that body (spec §4; scope fix).
  const mapItemKind = resolveMapItemKind(
    ctxKey,
    config,
    visitedMaps,
    consumerNodeId,
  );
  if (mapItemKind !== undefined) {
    return mapItemKind;
  }

  // 1. Catalog-declared output kind on a producing activity / pollUntil node.
  const catalogKind = resolveCatalogProducerKind(ctxKey, config);
  if (catalogKind !== undefined) {
    return catalogKind;
  }

  // 1b. Source-node synthetic producers (source.upload / source.api).
  // Mirrors the validator's `enumerateSourceProducers` so the picker's
  // compatibility grouping agrees with save-time validation.
  const sourceKind = resolveSourceProducerKind(ctxKey, config);
  if (sourceKind !== undefined) {
    return sourceKind;
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
