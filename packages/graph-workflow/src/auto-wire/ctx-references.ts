// packages/graph-workflow/src/auto-wire/ctx-references.ts
//
// G-009, reader half. `ctx-source.ts` answers "where does this value come
// FROM" (`resolveCtxKeySource`) and enumerates every write the graph performs
// (`collectCtxWriters` / `nodeTypeCtxWrites`). This module answers the mirror
// question — "what else READS this value?" — from the same graph data, and
// pairs the two into the single blast-radius lookup an author needs before
// renaming or deleting a ctx key.
//
// The reference sites enumerated here are exactly those `rename-ctx-key.ts`
// rewrites (batches 2/6 made that sweep exhaustive); the two must agree, or a
// rename would move a reference this lookup never showed the author.
import type {
  ConditionExpression,
  GraphNode,
  GraphWorkflowConfig,
  ValueRef,
} from "../types";
import {
  type CtxWriter,
  collectCtxWriters,
  normaliseCtxKey,
  writerSourcesKey,
} from "./ctx-source";

/** Where in a node a ctx reference lives. */
export type CtxReadVia =
  /** A `PortBinding` in `node.inputs[]`. */
  | "input"
  /** `map.collectionCtxKey` — the collection the fan-out iterates. */
  | "map-collection"
  /** A `ValueRef.ref` inside a `switch` case or a `pollUntil` condition. */
  | "condition"
  /** A `childWorkflow.inputMappings[]` entry. */
  | "child-input";

/** One place the graph reads a ctx value. */
export interface CtxReader {
  nodeId: string;
  via: CtxReadVia;
  /**
   * The port name for port-shaped references (`input` / `child-input`), the
   * literal `"collection"` for a map, and the path of the condition that
   * carries the ref (`condition`, `cases[<i>].condition`) otherwise.
   */
  port: string;
  /** The reference exactly as authored — may be `ctx.`-namespaced or drilled. */
  ref: string;
}

/** Everything the graph does with one ctx key. */
export interface CtxKeyReferences {
  /** The key as asked for, with any `ctx.` namespace stripped. */
  key: string;
  /** Every node that reads the key (including through a drilled path). */
  readers: CtxReader[];
  /** Every node that writes it. */
  writers: CtxWriter[];
  /** True when `config.ctx` declares the key. */
  declared: boolean;
  /** `readers.length + writers.length` — 0 means nothing references it. */
  total: number;
}

/**
 * Every ctx READ the graph performs, in node-record order. The mirror of
 * `collectCtxWriters`.
 *
 * `outputs[]` and `childWorkflow.outputMappings[]` are deliberately absent —
 * those are writes. `join.sourceMapNodeId` is a node reference, not a ctx
 * reference. `humanGate` reads no ctx (its payload key is a write).
 *
 * The `switch (node.type)` below is EXHAUSTIVE by design, same as
 * `rename-ctx-key.ts`: the `never` check in the default branch makes adding a
 * node type to the union a compile error here, so a new reader cannot go
 * unnoticed.
 */
export function collectCtxReaders(config: GraphWorkflowConfig): CtxReader[] {
  const readers: CtxReader[] = [];
  for (const [nodeId, node] of Object.entries(config.nodes ?? {})) {
    if (!node) continue;
    for (const binding of node.inputs ?? []) {
      readers.push({
        nodeId,
        via: "input",
        port: binding.port,
        ref: binding.ctxKey,
      });
    }
    collectTypeReaders(nodeId, node, readers);
  }
  return readers;
}

function collectTypeReaders(
  nodeId: string,
  node: GraphNode,
  readers: CtxReader[],
): void {
  switch (node.type) {
    case "map":
      readers.push({
        nodeId,
        via: "map-collection",
        port: "collection",
        ref: node.collectionCtxKey,
      });
      return;
    case "childWorkflow":
      for (const mapping of node.inputMappings ?? []) {
        readers.push({
          nodeId,
          via: "child-input",
          port: mapping.port,
          ref: mapping.ctxKey,
        });
      }
      return;
    case "switch":
      node.cases.forEach((cse, index) => {
        for (const ref of conditionRefs(cse.condition)) {
          readers.push({
            nodeId,
            via: "condition",
            port: `cases[${index}].condition`,
            ref,
          });
        }
      });
      return;
    case "pollUntil":
      for (const ref of conditionRefs(node.condition)) {
        readers.push({ nodeId, via: "condition", port: "condition", ref });
      }
      return;
    case "activity":
    case "join":
    case "humanGate":
    case "source":
      // No ctx reads beyond `inputs[]` (already collected).
      return;
    default: {
      const exhaustive: never = node;
      void exhaustive;
      return;
    }
  }
}

/** Every non-empty `ValueRef.ref` inside a condition tree. */
function conditionRefs(condition: ConditionExpression): string[] {
  const refs: string[] = [];
  walkCondition(condition, refs);
  return refs;
}

function walkCondition(c: ConditionExpression, out: string[]): void {
  if ("operands" in c) {
    for (const operand of c.operands) walkCondition(operand, out);
    return;
  }
  if ("operand" in c) {
    walkCondition(c.operand, out);
    return;
  }
  if ("list" in c) {
    pushRef(c.value, out);
    pushRef(c.list, out);
    return;
  }
  if ("left" in c) {
    pushRef(c.left, out);
    pushRef(c.right, out);
    return;
  }
  pushRef(c.value, out);
}

function pushRef(value: ValueRef, out: string[]): void {
  if ("ref" in value && typeof value.ref === "string" && value.ref !== "") {
    out.push(value.ref);
  }
}

/**
 * The blast radius of one ctx key: who reads it, who writes it, and whether
 * it is declared. Answers "what else is this shared with before I change it"
 * — the fear J6 step 6 names — without opening every node in turn.
 *
 * Matching uses the same relation `resolveCtxKeySource` uses, so a drilled
 * read (`ocrResult.status`) counts as a read of `ocrResult` and a prefix
 * cousin (`ocrResultBackup`) does not.
 */
export function findCtxKeyReferences(
  config: GraphWorkflowConfig,
  ctxKey: string,
): CtxKeyReferences {
  const key = normaliseCtxKey(ctxKey);
  if (key === "") {
    return { key, readers: [], writers: [], declared: false, total: 0 };
  }

  const readers = collectCtxReaders(config).filter((reader) =>
    writerSourcesKey(key, normaliseCtxKey(reader.ref)),
  );
  const writers = collectCtxWriters(config).filter((writer) =>
    writerSourcesKey(normaliseCtxKey(writer.ctxKey), key),
  );
  const declared = config.ctx?.[key] !== undefined;

  return {
    key,
    readers,
    writers,
    declared,
    total: readers.length + writers.length,
  };
}
