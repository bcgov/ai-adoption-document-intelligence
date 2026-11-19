// packages/graph-workflow/src/auto-wire/ctx-source.ts
import { getActivityCatalogEntry, getSourceCatalogEntry } from "../catalog";
import type { GraphNode, GraphWorkflowConfig } from "../types";
import type { KindRef } from "../types/artifacts";
import { getCtxRootKey } from "../validator/context-utils";
import { decodeAutoCtxKey } from "./synthesise-ctx-key";

/**
 * Where a ctx key's value comes from.
 *
 * - `node-output` — some node writes the key (an activity/pollUntil/humanGate
 *   `outputs[]` binding, a `map`'s item/index key, a `join`'s results key, a
 *   `childWorkflow` output mapping, or a `source` node's produced keys).
 * - `declared-ctx` — the key is declared in `config.ctx`. A declaration is a
 *   legitimate source: workflow inputs have no producing node.
 *
 * `kind` is the artifact kind of the source when it can be determined
 * (catalog port kind / `CtxDeclaration.kind`); `undefined` means "no opinion"
 * and `isAssignable` treats it as the wildcard.
 */
export type CtxKeySource =
  | { origin: "node-output"; nodeId: string; port: string; kind?: KindRef }
  | { origin: "declared-ctx"; kind?: KindRef };

/** A single (nodeId, port) → ctxKey write recorded on the graph. */
export interface CtxWriter {
  nodeId: string;
  port: string;
  ctxKey: string;
  kind?: KindRef;
}

/**
 * Answers the one question every binding surface needs: does this ctx key
 * have a real source? A key is sourced when some node writes it as an output,
 * or when it is declared in `config.ctx` (a workflow input, which legitimately
 * has no producing node).
 *
 * Returns null when neither holds — the key is dangling, and every surface
 * that renders a binding to it must report a problem.
 *
 * `consumerNodeId`, when given, is excluded from the writer scan so a node
 * never counts as its own source.
 *
 * Matching mirrors the reverse lookup the condition picker performs
 * (`resolveCtxKeyToProducer`): a leading `ctx.` namespace prefix is stripped,
 * a drilled reference (`ocrResult.status`) resolves through its producing key
 * on a dot boundary only, and the `doc.` / `segment.` short-forms resolve via
 * `getCtxRootKey` to the ctx field they actually address.
 */
export function resolveCtxKeySource(
  config: GraphWorkflowConfig,
  ctxKey: string,
  consumerNodeId?: string,
): CtxKeySource | null {
  const key = normaliseCtxKey(ctxKey);
  if (key === "") return null;

  // An auto key names its own producer. The resolver stamps the matching
  // `outputs[]` row whenever it runs, but a config can be inspected before
  // that happens, so decode the key rather than relying on the row: the node
  // still existing (and still declaring the port) IS the source. Once it is
  // deleted the decode finds nothing and the key is correctly dangling.
  const auto = decodeAutoCtxKey(key);
  if (auto && auto.nodeId !== consumerNodeId) {
    const producer = config.nodes?.[auto.nodeId];
    if (producer) {
      const kind = outputPortKind(producer, auto.port);
      const declaresPort =
        kind !== undefined ||
        (producer.outputs ?? []).some((b) => b.port === auto.port);
      if (declaresPort) {
        return {
          origin: "node-output",
          nodeId: auto.nodeId,
          port: auto.port,
          ...(kind !== undefined ? { kind } : {}),
        };
      }
    }
  }

  for (const writer of collectCtxWriters(config)) {
    if (writer.nodeId === consumerNodeId) continue;
    if (!writerSourcesKey(writer.ctxKey, key)) continue;
    return {
      origin: "node-output",
      nodeId: writer.nodeId,
      port: writer.port,
      ...(writer.kind !== undefined ? { kind: writer.kind } : {}),
    };
  }

  const declaration =
    config.ctx?.[key] ?? config.ctx?.[getCtxRootKey(key)] ?? undefined;
  if (declaration) {
    return {
      origin: "declared-ctx",
      ...(declaration.kind !== undefined ? { kind: declaration.kind } : {}),
    };
  }

  return null;
}

/**
 * Refs are stored in the canonical `ctx.<key>` namespace by some surfaces and
 * bare by others; producer bindings are always bare. Strip the prefix before
 * matching (mirrors `resolveCtxKeyToProducer` / `splitKnownBase`).
 */
export function normaliseCtxKey(ctxKey: string): string {
  if (typeof ctxKey !== "string") return "";
  return ctxKey.startsWith("ctx.") ? ctxKey.slice(4) : ctxKey;
}

/** Does a write to `written` supply the value a binding to `consumed` reads? */
export function writerSourcesKey(written: string, consumed: string): boolean {
  if (written === "") return false;
  if (written === consumed) return true;
  // Drilled ref — dot boundary only, so `ocrResultX` never matches `ocrResult`.
  if (consumed.startsWith(`${written}.`)) return true;
  // `doc.X` / `segment.X` address `documentMetadata` / `currentSegment`.
  return getCtxRootKey(consumed) === written;
}

/**
 * Every ctx write the graph performs, in node-record order. Deliberately
 * broader than the validator's `walkCtxKeyBindings` producer enumeration,
 * which only covers `outputs[]` bindings and source nodes: control-flow nodes
 * write ctx too (`map.itemCtxKey`, `join.resultsCtxKey`, childWorkflow output
 * mappings, the humanGate payload key), and a key those write is NOT dangling.
 * Mirrors the writes `apps/temporal/src/graph-engine/node-executors.ts` makes.
 */
export function collectCtxWriters(config: GraphWorkflowConfig): CtxWriter[] {
  const writers: CtxWriter[] = [];
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node) continue;
    for (const binding of node.outputs ?? []) {
      writers.push({
        nodeId,
        port: binding.port,
        ctxKey: binding.ctxKey,
        kind: outputPortKind(node, binding.port),
      });
    }
    writers.push(...nodeTypeCtxWrites(nodeId, node));
  }
  return writers;
}

/**
 * The ctx a node writes by virtue of its TYPE, independent of any
 * `outputs[]` binding rows it carries. `map`/`join`/`childWorkflow`/
 * `humanGate`/`source` all write ctx through dedicated fields rather than
 * through `outputs[]`, so this is the only enumeration of what they produce.
 * `switch` deliberately returns nothing — it selects an edge, it does not
 * write ctx. Mirrors the writes `apps/temporal/src/graph-engine/
 * node-executors.ts` makes.
 *
 * Shared by `collectCtxWriters` (does this key have a source?) and by the
 * auto-wire resolver's `outputPortsFor` (what can downstream ports bind
 * to?), so the two can never disagree about what a control-flow node
 * produces (G-007).
 *
 * `kind` is populated only where it is statically knowable: source-node
 * kinds come from the source catalog / per-field annotations. A map item's
 * element kind is NOT set here — the resolver derives it precisely from the
 * collection producer (`map-item` pass) — and a join's results, a child
 * workflow's outputs and a human gate's payload have no statically knowable
 * kind, so they are left `undefined` ("no opinion") rather than guessed.
 */
export function nodeTypeCtxWrites(
  nodeId: string,
  node: GraphNode,
): CtxWriter[] {
  const writers: CtxWriter[] = [];
  switch (node.type) {
    case "map":
      writers.push({ nodeId, port: "item", ctxKey: node.itemCtxKey });
      if (node.indexCtxKey) {
        writers.push({ nodeId, port: "index", ctxKey: node.indexCtxKey });
      }
      break;
    case "join":
      writers.push({ nodeId, port: "results", ctxKey: node.resultsCtxKey });
      break;
    case "childWorkflow":
      for (const mapping of node.outputMappings ?? []) {
        writers.push({
          nodeId,
          port: mapping.port,
          ctxKey: mapping.ctxKey,
        });
      }
      break;
    case "humanGate":
      // The executor always writes `<nodeId>Payload` with the signal body.
      writers.push({ nodeId, port: "payload", ctxKey: `${nodeId}Payload` });
      break;
    case "source":
      collectSourceWriters(nodeId, node, writers);
      break;
    default:
      break;
  }
  return writers;
}

/**
 * Source nodes write ctx directly (no `outputs[]` bindings): `source.api`
 * writes one key per declared field, `source.upload` writes its configured
 * key (defaulting to `documentUrl`). Mirrors the validator's
 * `enumerateSourceProducers`, kinds included: a per-field `kind?` for
 * `source.api` (absent = no opinion) and the catalog entry's `outputKind`
 * for `source.upload`. The validator remains the surface that REPORTS a
 * source/consumer kind mismatch; carrying the kind here is what lets a
 * downstream port auto-bind to a source in the first place (G-007).
 */
function collectSourceWriters(
  nodeId: string,
  node: Extract<GraphNode, { type: "source" }>,
  writers: CtxWriter[],
): void {
  if (node.sourceType === "source.api") {
    const fields = (node.parameters as { fields?: unknown } | undefined)
      ?.fields;
    if (!Array.isArray(fields)) return;
    for (const raw of fields) {
      const field = raw as { name?: unknown; kind?: KindRef };
      if (typeof field?.name !== "string" || field.name === "") continue;
      writers.push({
        nodeId,
        port: field.name,
        ctxKey: field.name,
        kind: field.kind,
      });
    }
    return;
  }
  if (node.sourceType === "source.upload") {
    const raw = (node.parameters as { ctxKey?: unknown } | undefined)?.ctxKey;
    const ctxKey =
      typeof raw === "string" && raw.length > 0 ? raw : "documentUrl";
    writers.push({
      nodeId,
      port: ctxKey,
      ctxKey,
      kind: getSourceCatalogEntry(node.sourceType)?.outputKind,
    });
  }
}

/**
 * The ctx key a producer node's output port actually writes, for the
 * control-flow/source node types whose writes live in dedicated fields
 * rather than in `outputs[]`. Returns `undefined` for activity/pollUntil
 * (whose keys come from — or are synthesised into — their `outputs[]`
 * rows) and for a port the node does not write.
 *
 * Callers that turn a resolver `auto-bound` result into a persisted input
 * binding MUST consult this first: synthesising an `__auto.*` key and
 * stamping an `outputs[]` row on a join would bind the consumer to a key
 * no executor ever writes.
 */
export function producerCtxKeyForPort(
  node: GraphNode,
  port: string,
): string | undefined {
  return nodeTypeCtxWrites(node.id, node).find((w) => w.port === port)?.ctxKey;
}

/** The catalog-declared kind of a node's output port, when there is one. */
function outputPortKind(
  node: GraphNode,
  portName: string,
): KindRef | undefined {
  if (node.type !== "activity" && node.type !== "pollUntil") return undefined;
  const entry = getActivityCatalogEntry(node.activityType);
  return entry?.outputs.find((p) => p.name === portName)?.kind;
}
