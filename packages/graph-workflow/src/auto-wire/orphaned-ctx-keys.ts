// packages/graph-workflow/src/auto-wire/orphaned-ctx-keys.ts
import type {
  ConditionExpression,
  GraphWorkflowConfig,
  ValueRef,
} from "../types";
import { getCtxRootKey } from "../validator/context-utils";
import {
  collectCtxWriters,
  normaliseCtxKey,
  writerSourcesKey,
} from "./ctx-source";

/**
 * A ctx key that a pending node deletion will leave with no writer, while at
 * least one surviving node still reads it.
 */
export interface OrphanedCtxKey {
  ctxKey: string;
  /** Surviving node ids that still read this key, in node-record order. */
  consumerNodeIds: string[];
  /** Whether `config.ctx` carries a declaration that the prune can drop. */
  declared: boolean;
}

/**
 * "Does this key have a source?" is only answerable *before* the delete.
 *
 * After a node is gone, a `config.ctx` declaration with no producer is
 * indistinguishable from a workflow input — both are "declared, nothing writes
 * it", and no shipped template sets `isInput`, so the two cases cannot be told
 * apart by static inspection. The one moment they ARE distinguishable is the
 * deletion itself, because we know a writer just went away. That is why the
 * signal has to be captured here and turned into a persistent change (pruning
 * the declaration) rather than inferred later.
 *
 * Returns the keys `removedNodeIds` is the sole writer of that some surviving
 * node still consumes. A key nothing reads is NOT reported — deleting a leaf
 * whose output nobody uses is an ordinary edit and must stay silent.
 *
 * Producer detection reuses `collectCtxWriters` (the same enumeration
 * `resolveCtxKeySource` answers from), so the two can never disagree about
 * what counts as a writer.
 */
export function findOrphanedCtxKeys(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): OrphanedCtxKey[] {
  if (removedNodeIds.size === 0) return [];

  const writers = collectCtxWriters(config);
  const doomedKeys: string[] = [];
  const survivingWrites: string[] = [];
  for (const writer of writers) {
    if (writer.ctxKey === "") continue;
    if (removedNodeIds.has(writer.nodeId)) {
      if (!doomedKeys.includes(writer.ctxKey)) doomedKeys.push(writer.ctxKey);
    } else {
      survivingWrites.push(writer.ctxKey);
    }
  }
  if (doomedKeys.length === 0) return [];

  const consumers = collectCtxConsumers(config, removedNodeIds);

  const orphaned: OrphanedCtxKey[] = [];
  for (const ctxKey of doomedKeys) {
    // Still written by a node that survives → not orphaned.
    if (survivingWrites.some((written) => writerSourcesKey(written, ctxKey))) {
      continue;
    }
    const consumerNodeIds: string[] = [];
    for (const consumer of consumers) {
      if (!writerSourcesKey(ctxKey, consumer.ctxKey)) continue;
      if (consumerNodeIds.includes(consumer.nodeId)) continue;
      consumerNodeIds.push(consumer.nodeId);
    }
    if (consumerNodeIds.length === 0) continue;
    orphaned.push({
      ctxKey,
      consumerNodeIds,
      declared: ctxDeclarationKeyFor(config, ctxKey) !== null,
    });
  }
  return orphaned;
}

/**
 * Drops the `config.ctx` declarations for `ctxKeys`, so a key whose writer is
 * gone is left with no source at all and every surface reports it (the
 * consequence chain `resolveCtxKeySource` → badge / drawer / port row).
 *
 * Two keys are never dropped:
 *  - one marked `isInput` — that is a declared caller-supplied input and
 *    legitimately has no producing node;
 *  - one that is not declared at all (an `__auto.*` key), which has nothing to
 *    prune and is already reported on its own.
 *
 * Returns the SAME config reference when nothing changes, so callers can
 * `===`-skip a re-render. Pure.
 */
export function pruneCtxDeclarations(
  config: GraphWorkflowConfig,
  ctxKeys: readonly string[],
): GraphWorkflowConfig {
  if (ctxKeys.length === 0 || !config.ctx) return config;
  const doomed = new Set<string>();
  for (const ctxKey of ctxKeys) {
    const declKey = ctxDeclarationKeyFor(config, ctxKey);
    if (declKey === null) continue;
    if (config.ctx[declKey]?.isInput === true) continue;
    doomed.add(declKey);
  }
  if (doomed.size === 0) return config;
  const nextCtx: GraphWorkflowConfig["ctx"] = {};
  for (const [key, decl] of Object.entries(config.ctx)) {
    if (doomed.has(key)) continue;
    nextCtx[key] = decl;
  }
  return { ...config, ctx: nextCtx };
}

/**
 * The `config.ctx` key a binding key resolves its declaration through — the
 * key itself, or its ctx root (`prepared.blob` → `prepared`, `segment.type` →
 * `currentSegment`). Mirrors `resolveCtxKeySource`'s declaration lookup.
 */
function ctxDeclarationKeyFor(
  config: GraphWorkflowConfig,
  ctxKey: string,
): string | null {
  const key = normaliseCtxKey(ctxKey);
  if (!config.ctx) return null;
  if (config.ctx[key]) return key;
  const root = getCtxRootKey(key);
  return config.ctx[root] ? root : null;
}

interface CtxConsumer {
  nodeId: string;
  ctxKey: string;
}

/**
 * Every ctx READ performed by a node that survives the delete: `inputs[]`
 * bindings, a map's `collectionCtxKey`, a childWorkflow's `inputMappings`, and
 * the refs inside `switch` / `pollUntil` conditions (a condition that reads a
 * pruned key breaks just as loudly as a port binding does).
 */
function collectCtxConsumers(
  config: GraphWorkflowConfig,
  removedNodeIds: ReadonlySet<string>,
): CtxConsumer[] {
  const consumers: CtxConsumer[] = [];
  const add = (nodeId: string, ctxKey: string | undefined): void => {
    if (!ctxKey) return;
    consumers.push({ nodeId, ctxKey: normaliseCtxKey(ctxKey) });
  };
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node || removedNodeIds.has(nodeId)) continue;
    for (const binding of node.inputs ?? []) add(nodeId, binding.ctxKey);
    switch (node.type) {
      case "map":
        add(nodeId, node.collectionCtxKey);
        break;
      case "childWorkflow":
        for (const mapping of node.inputMappings ?? []) {
          add(nodeId, mapping.ctxKey);
        }
        break;
      case "switch":
        for (const branch of node.cases ?? []) {
          for (const ref of collectConditionRefs(branch.condition)) {
            add(nodeId, ref);
          }
        }
        break;
      case "pollUntil":
        for (const ref of collectConditionRefs(node.condition)) {
          add(nodeId, ref);
        }
        break;
      default:
        break;
    }
  }
  return consumers;
}

/** Collect every non-empty `ValueRef.ref` in a condition expression tree. */
function collectConditionRefs(
  expr: ConditionExpression | undefined,
  out: string[] = [],
): string[] {
  if (!expr) return out;
  const value = (v: ValueRef | undefined): void => {
    if (v && "ref" in v && typeof v.ref === "string" && v.ref !== "") {
      out.push(v.ref);
    }
  };
  switch (expr.operator) {
    case "and":
    case "or":
      for (const operand of expr.operands ?? []) {
        collectConditionRefs(operand, out);
      }
      break;
    case "not":
      collectConditionRefs(expr.operand, out);
      break;
    case "is-null":
    case "is-not-null":
      value(expr.value);
      break;
    case "in":
    case "not-in":
      value(expr.value);
      value(expr.list);
      break;
    default:
      value(expr.left);
      value(expr.right);
      break;
  }
  return out;
}
