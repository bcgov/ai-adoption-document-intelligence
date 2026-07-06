/**
 * Pure ctx-key rename (§4.8).
 *
 * Renaming a ctx declaration must rewrite EVERY reference to that key across
 * the graph, matching the drawer's promise that "renaming a key rewrites
 * every binding that references it". The original implementation only
 * rewrote `node.inputs` / `node.outputs` PortBindings and silently left the
 * following dangling on a rename:
 *   - `map.collectionCtxKey` / `map.itemCtxKey` / `map.indexCtxKey`
 *   - `join.resultsCtxKey`
 *   - `childWorkflow.inputMappings` / `childWorkflow.outputMappings`
 *   - `ValueRef.ref`s inside `switch.cases[].condition` and
 *     `pollUntil.condition`
 *
 * A reference matches when it equals the old key exactly OR is a dotted path
 * rooted at it (e.g. renaming `doc` → `document` rewrites `doc.category` to
 * `document.category`).
 */

import type {
  ConditionExpression,
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
  ValueRef,
} from "../../../types/workflow";

/** Rename an exact key or a dotted path rooted at `oldKey`. */
function renameRef(ref: string, oldKey: string, newKey: string): string {
  if (ref === oldKey) return newKey;
  if (ref.startsWith(`${oldKey}.`)) {
    return `${newKey}${ref.slice(oldKey.length)}`;
  }
  return ref;
}

function renameBindings(
  bindings: PortBinding[] | undefined,
  oldKey: string,
  newKey: string,
): PortBinding[] | undefined {
  return bindings?.map((b) => ({
    ...b,
    ctxKey: renameRef(b.ctxKey, oldKey, newKey),
  }));
}

function renameValueRef(v: ValueRef, oldKey: string, newKey: string): ValueRef {
  if ("ref" in v && typeof v.ref === "string") {
    return { ref: renameRef(v.ref, oldKey, newKey) };
  }
  return v;
}

function renameCondition(
  c: ConditionExpression,
  oldKey: string,
  newKey: string,
): ConditionExpression {
  // Narrow by distinguishing property so TS keeps the exact member type.
  if ("operands" in c) {
    // LogicalExpression (and / or)
    return {
      ...c,
      operands: c.operands.map((o) => renameCondition(o, oldKey, newKey)),
    };
  }
  if ("operand" in c) {
    // NotExpression
    return { ...c, operand: renameCondition(c.operand, oldKey, newKey) };
  }
  if ("list" in c) {
    // ListMembershipExpression (in / not-in)
    return {
      ...c,
      value: renameValueRef(c.value, oldKey, newKey),
      list: renameValueRef(c.list, oldKey, newKey),
    };
  }
  if ("left" in c) {
    // ComparisonExpression
    return {
      ...c,
      left: renameValueRef(c.left, oldKey, newKey),
      right: renameValueRef(c.right, oldKey, newKey),
    };
  }
  // NullCheckExpression (is-null / is-not-null)
  return { ...c, value: renameValueRef(c.value, oldKey, newKey) };
}

function renameNode(
  node: GraphNode,
  oldKey: string,
  newKey: string,
): GraphNode {
  // Shared: every node may carry inputs/outputs PortBindings.
  const inputs = renameBindings(node.inputs, oldKey, newKey);
  const outputs = renameBindings(node.outputs, oldKey, newKey);

  switch (node.type) {
    case "map":
      return {
        ...node,
        inputs,
        outputs,
        collectionCtxKey: renameRef(node.collectionCtxKey, oldKey, newKey),
        itemCtxKey: renameRef(node.itemCtxKey, oldKey, newKey),
        indexCtxKey:
          node.indexCtxKey !== undefined
            ? renameRef(node.indexCtxKey, oldKey, newKey)
            : node.indexCtxKey,
      };
    case "join":
      return {
        ...node,
        inputs,
        outputs,
        resultsCtxKey: renameRef(node.resultsCtxKey, oldKey, newKey),
      };
    case "childWorkflow":
      return {
        ...node,
        inputs,
        outputs,
        inputMappings: renameBindings(node.inputMappings, oldKey, newKey),
        outputMappings: renameBindings(node.outputMappings, oldKey, newKey),
      };
    case "switch":
      return {
        ...node,
        inputs,
        outputs,
        cases: node.cases.map((cse) => ({
          ...cse,
          condition: renameCondition(cse.condition, oldKey, newKey),
        })),
      };
    case "pollUntil":
      return {
        ...node,
        inputs,
        outputs,
        condition: renameCondition(node.condition, oldKey, newKey),
      };
    default:
      return { ...node, inputs, outputs };
  }
}

/**
 * Return a new config with `oldKey` renamed to `newKey` in the `ctx`
 * declarations and in every reference across the graph. Preserves ctx
 * insertion order. Callers should guard against no-op / collision renames
 * (same key, empty new key, or `newKey` already declared) before calling.
 */
export function renameCtxKeyInConfig(
  config: GraphWorkflowConfig,
  oldKey: string,
  newKey: string,
): GraphWorkflowConfig {
  const nextCtx: GraphWorkflowConfig["ctx"] = {};
  for (const [k, v] of Object.entries(config.ctx)) {
    nextCtx[k === oldKey ? newKey : k] = v;
  }

  const nextNodes: GraphWorkflowConfig["nodes"] = {};
  for (const [id, node] of Object.entries(config.nodes)) {
    nextNodes[id] = renameNode(node, oldKey, newKey);
  }

  return { ...config, ctx: nextCtx, nodes: nextNodes };
}
