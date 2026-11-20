/**
 * Port constants (P-5, ruling R-3) — a literal value typed straight onto an
 * input row.
 *
 * The value does NOT live on the binding. `PortBinding` has exactly one
 * variant, `{ port, ctxKey }`, and a `{ port, value }` sibling was explicitly
 * REJECTED: more direct, but a schema change across engine, validator,
 * resolver, canvas, drawer and run-spec, and a third answer to "where does
 * this input come from". A constant is instead a HIDDEN `ctx` declaration
 * carrying `defaultValue`, with the port pinned to it — the same trick
 * auto-wiring already uses for its `__auto.{node}.{port}` keys.
 *
 * Nothing in the engine changes:
 *   - `initializeContext` (apps/temporal/src/graph-engine/context-utils.ts)
 *     seeds ctx from every declaration's `defaultValue` and THEN overlays the
 *     caller's `initialCtx`, so a constant is a default a run can override.
 *   - `deriveInputSchema` only publishes declarations flagged `isInput`, so a
 *     hidden constant never appears in the run-spec — until it is promoted.
 *
 * ## Why the key uses underscores where the auto keys use dots
 *
 * `__auto.{node}.{port}` survives its dots because the engine WRITES it at
 * runtime through `writeToCtx`, which nests each dot segment (`ctx.__auto` →
 * `{ node: { port: … } }`) and so agrees with `resolveCtxBinding`, which reads
 * by splitting on dots. A DECLARED default takes the other path:
 * `initializeContext` assigns `ctx[key] = declaration.defaultValue` FLAT, with
 * no nesting. A dotted constant key would therefore be seeded at
 * `ctx["__const.n.p"]` and read at `ctx.__const.n.p` — never the same slot,
 * and silently empty at runtime. So the constant key carries no dots at all:
 * `__const_{nodeId}_{port}`, every unsafe character folded to `_`.
 *
 * That also keeps constants distinguishable from auto keys by prefix alone —
 * `isAutoCtxKey` matches `__auto.` and `isConstCtxKey` matches `__const_`,
 * with no key able to satisfy both.
 */

import { getLockedInputPorts } from "@ai-di/graph-workflow";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { renameCtxKeyInConfig } from "./rename-ctx-key";

/**
 * Reserved prefix for the hidden ctx declarations that back port constants.
 * Deliberately underscore-terminated rather than dot-terminated — see the
 * module header. Hand-authored ctx keys MUST NOT start with this string; the
 * settings drawer folds every key that does out of the ctx list, and the
 * Inputs panel renders it as a value rather than as a source.
 */
export const CONST_CTX_KEY_PREFIX = "__const_";

/** `true` iff `ctxKey` is a hidden constant declaration minted here. */
export function isConstCtxKey(ctxKey: string): boolean {
  return ctxKey.startsWith(CONST_CTX_KEY_PREFIX);
}

/**
 * Fold everything that is not a safe identifier character to `_`. Node ids and
 * port names are author- and catalog-supplied, so they can carry dashes (and,
 * per `decodeAutoCtxKey`'s contract, dots) — neither of which may reach a ctx
 * key that has to survive a flat seed and a dotted read.
 */
function sanitiseSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * The ctx key a new constant on `nodeId.port` claims. Deterministic from the
 * pair, then uniquified: sanitising can collapse two distinct pairs onto one
 * base (`a-b`/`c` and `a`/`b_c` both fold to `a_b_c`), so an already-taken
 * base takes a numeric suffix rather than silently sharing one value between
 * two ports.
 */
export function mintConstCtxKey(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
): string {
  const base = `${CONST_CTX_KEY_PREFIX}${sanitiseSegment(nodeId)}_${sanitiseSegment(port)}`;
  if (config.ctx[base] === undefined) return base;
  let suffix = 2;
  while (config.ctx[`${base}_${suffix}`] !== undefined) suffix += 1;
  return `${base}_${suffix}`;
}

/**
 * The constant ctx key `nodeId.port` is bound to, or null when the port holds
 * no constant (unbound, or bound to a wire / a named ctx variable).
 */
export function findPortConstantKey(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
): string | null {
  const binding = config.nodes[nodeId]?.inputs?.find((b) => b.port === port);
  if (!binding?.ctxKey || !isConstCtxKey(binding.ctxKey)) return null;
  return config.ctx[binding.ctxKey] !== undefined ? binding.ctxKey : null;
}

/**
 * The constant value typed onto `nodeId.port`, or null when there is none.
 *
 * Constants are TEXT — {@link setPortConstant} only ever writes a `string`
 * `defaultValue` — so a non-string here means the config was hand-edited.
 * Those report null rather than being coerced into the row's text field,
 * which would rewrite the author's typed value as a string on the next blur.
 */
export function getPortConstant(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
): string | null {
  const ctxKey = findPortConstantKey(config, nodeId, port);
  if (ctxKey === null) return null;
  const value = config.ctx[ctxKey]?.defaultValue;
  return typeof value === "string" ? value : null;
}

/**
 * Write `value` as the constant for `nodeId.port`: mint (or reuse) the hidden
 * declaration, bind the port to it, and LOCK the port.
 *
 * The lock is not incidental. `resolveBindings` rewrites unlocked ports on
 * every config change, so an unlocked constant would be overwritten by the
 * first upstream producer that could satisfy the port — and `normaliseLocks`
 * infers the lock from the non-`__auto.` binding on the next load anyway, so
 * omitting it would only make the live session disagree with the reloaded one.
 *
 * An empty (or whitespace-only) value is a clear, not a constant: it routes to
 * {@link clearPortConstant} so emptying the field is the way back out.
 */
export function setPortConstant(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
  value: string,
): GraphWorkflowConfig {
  const node = config.nodes[nodeId];
  if (!node) return config;
  if (value.trim() === "") return clearPortConstant(config, nodeId, port);

  const ctxKey =
    findPortConstantKey(config, nodeId, port) ??
    mintConstCtxKey(config, nodeId, port);
  const declaration: CtxDeclaration = { type: "string", defaultValue: value };

  const nextInputs = [
    ...(node.inputs ?? []).filter((b) => b.port !== port),
    { port, ctxKey },
  ];
  const nextLocks = Array.from(new Set([...getLockedInputPorts(node), port]));

  return {
    ...config,
    ctx: { ...config.ctx, [ctxKey]: declaration },
    nodes: {
      ...config.nodes,
      [nodeId]: {
        ...node,
        inputs: nextInputs,
        metadata: { ...(node.metadata ?? {}), lockedInputPorts: nextLocks },
      },
    },
  };
}

/**
 * Drop the constant on `nodeId.port`: remove the binding, drop the lock (the
 * port goes back to auto-detection, which is what having no constant means)
 * and delete the hidden declaration.
 *
 * The declaration is kept when another port still reads the same key — the
 * mint is per (node, port) so that cannot happen by accident, but a copied
 * node or a hand-edited config can produce it, and deleting a key something
 * still binds to would manufacture a dangling binding.
 */
export function clearPortConstant(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
): GraphWorkflowConfig {
  const node = config.nodes[nodeId];
  if (!node) return config;
  const ctxKey = findPortConstantKey(config, nodeId, port);
  if (ctxKey === null) return config;

  const nextLocks = getLockedInputPorts(node).filter((p) => p !== port);
  const nextMetadata: Record<string, unknown> = { ...(node.metadata ?? {}) };
  if (nextLocks.length > 0) {
    nextMetadata.lockedInputPorts = nextLocks;
  } else {
    delete nextMetadata.lockedInputPorts;
  }

  const nextNodes = {
    ...config.nodes,
    [nodeId]: {
      ...node,
      inputs: (node.inputs ?? []).filter((b) => b.port !== port),
      metadata: nextMetadata,
    },
  };
  const stillRead = Object.values(nextNodes).some((n) =>
    (n.inputs ?? []).some((b) => b.ctxKey === ctxKey),
  );
  const nextCtx = { ...config.ctx };
  if (!stillRead) delete nextCtx[ctxKey];

  return { ...config, ctx: nextCtx, nodes: nextNodes };
}

/**
 * Names a promoted constant may take. The shape matches what the run-spec
 * publishes as a JSON Schema property and what `initializeContext` will accept
 * as a plain object property, and both reserved prefixes are refused so a
 * promotion can never mint a key that reads as auto-wired or as still hidden.
 */
export function isPromotableCtxKeyName(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  return !isConstCtxKey(name) && !name.startsWith("__auto");
}

/**
 * Promotion (P-5 step 3) — turn the hidden constant on `nodeId.port` into a
 * named, caller-supplied workflow input.
 *
 * This is a ctx RENAME plus `isInput: true`, so it reuses the drawer's rename
 * sweep: the binding follows the key, the value survives as the declaration's
 * `defaultValue` (which is what makes the promoted input optional rather than
 * required in `deriveInputSchema`), and the port stays pinned to it. From here
 * on the key is an ordinary ctx variable — visible in the drawer, in the Run
 * drawer and in `GET /run-spec`.
 *
 * Returns the same config when there is no constant to promote or the name is
 * unusable; callers validate first so the author sees why (see
 * {@link isPromotableCtxKeyName}).
 */
export function promotePortConstant(
  config: GraphWorkflowConfig,
  nodeId: string,
  port: string,
  newKey: string,
): GraphWorkflowConfig {
  const ctxKey = findPortConstantKey(config, nodeId, port);
  if (ctxKey === null) return config;
  if (!isPromotableCtxKeyName(newKey)) return config;
  if (config.ctx[newKey] !== undefined) return config;

  const renamed = renameCtxKeyInConfig(config, ctxKey, newKey);
  const declaration = renamed.ctx[newKey];
  if (!declaration) return config;
  return {
    ...renamed,
    ctx: { ...renamed.ctx, [newKey]: { ...declaration, isInput: true } },
  };
}
