// packages/graph-workflow/src/auto-wire/resolve-input-port.ts
import { getActivityCatalogEntry } from "../catalog";
import type { GraphWorkflowConfig } from "../types";
import type { KindRef } from "../types/artifacts";
import { isAssignable } from "../types/subtype-check";
import { nodeTypeCtxWrites, resolveCtxKeySource } from "./ctx-source";
import { getLockedInputPorts } from "./lock-list";
import { upstreamNodesWithDistance } from "./upstream-walk";

export type AutoBoundVia = "nearest-kind" | "name-match" | "map-item";

export type PortResolution =
  | {
      status: "auto-bound";
      producerNodeId: string;
      producerPort: string;
      via: AutoBoundVia;
    }
  | {
      status: "ambiguous";
      candidates: { producerNodeId: string; producerPort: string }[];
    }
  | { status: "unsatisfied" }
  | { status: "locked"; ctxKey: string }
  /**
   * Locked with NO binding — the user disconnected this port on the canvas
   * (PORT_WIRING_DESIGN.md §6.3 "pinned unbound"). The resolver must leave
   * it alone; the UI renders it as "Disconnected by you" (§12).
   */
  | { status: "locked-unbound" }
  /**
   * Locked and bound, but the ctx key has NO source: nothing writes it and it
   * is not declared in `config.ctx` — typically its producer node was deleted
   * after the pin was made (G-005). The pin is preserved (the resolver still
   * must not rewrite a locked port), but every surface reports a problem.
   */
  | { status: "locked-dangling"; ctxKey: string }
  /**
   * Locked and bound to a real source whose kind cannot satisfy this port
   * (G-005). Only reported when BOTH sides declare a kind.
   */
  | {
      status: "locked-kind-mismatch";
      ctxKey: string;
      expected: KindRef;
      actual: KindRef;
    };

interface PortSpec {
  name: string;
  kind?: KindRef;
}

/**
 * Resolve a single input port on `consumerNodeId`. Lock check first; then
 * upstream BFS; then a kind-filtered candidate pass; then the
 * nearest-vs-tied decision. See AUTO_WIRE_DESIGN.md §2.1.
 */
export function resolveInputPort(
  config: GraphWorkflowConfig,
  consumerNodeId: string,
  port: PortSpec,
): PortResolution {
  const consumer = config.nodes[consumerNodeId];
  if (!consumer) return { status: "unsatisfied" };

  const lockList = getLockedInputPorts(consumer);

  if (lockList.includes(port.name)) {
    const existing = consumer.inputs?.find((b) => b.port === port.name);
    // Any falsy ctxKey (missing/undefined or "") means the port has no real
    // source — it's "pinned unbound" ("Disconnected by you"), NOT a bound
    // "Pinned" row. A ctxKey-less input stub can slip into the in-memory
    // config on a canvas edge-delete, and the two states render differently
    // (locked-unbound offers "Pick a source"; locked shows a source), so the
    // classifier must reject every falsy ctxKey, not just the empty string.
    if (!existing || !existing.ctxKey) {
      return { status: "locked-unbound" };
    }
    // G-005: a pin is NOT proof of health. Check that the key still has a
    // source (a node writes it, or it is declared in `config.ctx`) and that
    // the source's kind can satisfy this port. The pin itself is preserved —
    // the resolver never rewrites a locked port — but a broken one is
    // reported instead of silently reading as satisfied.
    const source = resolveCtxKeySource(config, existing.ctxKey, consumerNodeId);
    if (!source) {
      return { status: "locked-dangling", ctxKey: existing.ctxKey };
    }
    if (
      port.kind !== undefined &&
      source.kind !== undefined &&
      !isAssignable(source.kind, port.kind)
    ) {
      return {
        status: "locked-kind-mismatch",
        ctxKey: existing.ctxKey,
        expected: port.kind,
        actual: source.kind,
      };
    }
    return { status: "locked", ctxKey: existing.ctxKey };
  }

  if (port.kind === undefined) {
    return { status: "unsatisfied" };
  }

  const distances = upstreamNodesWithDistance(config, consumerNodeId);
  type Candidate = {
    producerNodeId: string;
    producerPort: string;
    distance: number;
    via: AutoBoundVia;
  };

  // Base-`Artifact` ports are wildcard identifier ports (apimRequestId,
  // ocrResponse, modelId, documentId). Kind-matching is meaningless — every
  // artifact is assignable to the base type — so bind ONLY to a UNIQUE upstream
  // output whose port name exactly matches; otherwise leave the port for the
  // user rather than guessing. This is what lets Artifact-heavy chains (Azure
  // OCR submit→poll→extract) wire without hand-binding, while genuine config
  // ports with no upstream producer (modelId) stay unsatisfied.
  if (port.kind === "Artifact") {
    // No per-candidate `via` here: every bind on this path is by definition
    // a name match, so the single return below hardcodes it.
    const named: Omit<Candidate, "via">[] = [];
    for (const [producerNodeId, distance] of distances) {
      const producer = config.nodes[producerNodeId];
      if (!producer) continue;
      for (const output of outputPortsFor(producer)) {
        if (output.name === port.name) {
          named.push({ producerNodeId, producerPort: output.name, distance });
        }
      }
    }
    const pick = uniqueNearest(named);
    return pick
      ? {
          status: "auto-bound",
          producerNodeId: pick.producerNodeId,
          producerPort: pick.producerPort,
          via: "name-match",
        }
      : { status: "unsatisfied" };
  }

  const candidates: Candidate[] = [];

  for (const [producerNodeId, distance] of distances) {
    const producer = config.nodes[producerNodeId];
    if (!producer) continue;
    const producerOutputs = outputPortsFor(producer);
    for (const output of producerOutputs) {
      if (output.kind === undefined) continue;
      if (isAssignable(output.kind, port.kind)) {
        candidates.push({
          producerNodeId,
          producerPort: output.name,
          distance,
          via: "nearest-kind",
        });
      }
    }
  }

  // Map synthetic-producer pass: any reachable `map` node contributes one
  // synthetic producer of element type T, where T is derived by stripping
  // `[]` from the kind of the producer feeding the map's collection.
  //
  // The producer PORT is the fixed identifier `"item"` — the same name
  // `nodeTypeCtxWrites` records the write under, and the same shape every
  // other control-flow producer uses (join `"results"`, humanGate
  // `"payload"`, childWorkflow `mapping.port`). The author-chosen
  // `itemCtxKey` is the ctx KEY that port writes, not the port's name;
  // `producerCtxKeyForPort(map, "item")` is what maps the one to the other.
  // Reporting the ctx key here instead made the resolver disagree with the
  // shared write enumeration, so a derived wire carried a `sourcePort` its
  // own provenance lookup could never match and map-item wires could not be
  // drawn at all (G-104).
  for (const [producerNodeId, distance] of distances) {
    const producer = config.nodes[producerNodeId];
    if (!producer || producer.type !== "map") continue;
    const elementKind = resolveMapElementKind(config, producerNodeId);
    if (!elementKind) continue;
    if (isAssignable(elementKind, port.kind)) {
      candidates.push({
        producerNodeId,
        producerPort: "item",
        distance,
        via: "map-item",
      });
    }
  }

  if (candidates.length === 0) {
    // Identifier-family fallback (2026-08-02 retag). Identifier ports used
    // to be base-`Artifact` and wire through the unique-name-match branch
    // above; typing them must not orphan a port whose producer is still
    // UNTYPED (dynamic `dyn.*` nodes, custom outputs). When the kind pass
    // finds nothing, fall back to the same rule that wired them before:
    // bind ONLY to a unique upstream output with the exact same name.
    if (isAssignable(port.kind, "Identifier")) {
      const named: Omit<Candidate, "via">[] = [];
      for (const [producerNodeId, distance] of distances) {
        const producer = config.nodes[producerNodeId];
        if (!producer) continue;
        for (const output of outputPortsFor(producer)) {
          if (output.name === port.name) {
            named.push({ producerNodeId, producerPort: output.name, distance });
          }
        }
      }
      const pick = uniqueNearest(named);
      if (pick) {
        return {
          status: "auto-bound",
          producerNodeId: pick.producerNodeId,
          producerPort: pick.producerPort,
          via: "name-match",
        };
      }
    }
    return { status: "unsatisfied" };
  }

  const minDistance = Math.min(...candidates.map((c) => c.distance));
  const closest = candidates.filter((c) => c.distance === minDistance);
  if (closest.length === 1) {
    return {
      status: "auto-bound",
      producerNodeId: closest[0].producerNodeId,
      producerPort: closest[0].producerPort,
      via: closest[0].via,
    };
  }

  // Name-match disambiguation. A kind-based tie is resolved when exactly one
  // candidate's OUTPUT PORT shares the consumer port's exact name — a strong
  // signal it's the intended source (e.g. `apimRequestId` → `apimRequestId`).
  // Prefer a unique same-named producer among the nearest tie; otherwise across
  // all distances. This only fires when kind-matching is ALREADY ambiguous, so
  // it never changes a port that auto-binds today — it just lets Artifact-heavy
  // chains (Azure OCR: apimRequestId, ocrResponse, …) wire without hand-binding.
  const uniqueByName = (pool: Candidate[]): Candidate | null => {
    const named = pool.filter((c) => c.producerPort === port.name);
    return named.length === 1 ? named[0] : null;
  };
  const nameMatch = uniqueByName(closest) ?? uniqueByName(candidates);
  if (nameMatch) {
    return {
      status: "auto-bound",
      producerNodeId: nameMatch.producerNodeId,
      producerPort: nameMatch.producerPort,
      via: "name-match",
    };
  }

  return {
    status: "ambiguous",
    candidates: closest.map((c) => ({
      producerNodeId: c.producerNodeId,
      producerPort: c.producerPort,
    })),
  };
}

/**
 * From a list of same-named producer candidates, pick the single unambiguous
 * one: the sole candidate overall, or the sole candidate at the minimum
 * distance. Returns null when the choice is still ambiguous (don't guess).
 */
function uniqueNearest<
  T extends { producerNodeId: string; producerPort: string; distance: number },
>(list: T[]): T | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const min = Math.min(...list.map((c) => c.distance));
  const nearest = list.filter((c) => c.distance === min);
  return nearest.length === 1 ? nearest[0] : null;
}

interface OutputPortInfo {
  name: string;
  kind?: KindRef;
}

/**
 * What a producer node offers downstream ports.
 *
 * `activity`/`pollUntil` declare their outputs in the activity catalog.
 * Every other node type writes ctx through dedicated fields (`map.itemCtxKey`,
 * `join.resultsCtxKey`, `childWorkflow.outputMappings`, the humanGate payload
 * key, a source node's produced keys), enumerated once by `nodeTypeCtxWrites`
 * so this resolver and the ctx-source arbiter can never disagree (G-007).
 * `switch` writes nothing — it selects an edge — so it contributes no
 * candidates, which is why nothing here special-cases it.
 *
 * Kinds are only reported where they are statically knowable (source nodes).
 * A kindless output never satisfies a kinded port — the kind pass skips it —
 * so it can only be reached through the base-`Artifact` name-match path,
 * where the port NAME is the evidence. That is deliberate: a `join`'s results
 * or a gate's approval payload has no knowable kind, and guessing one would
 * bind ports that should have stayed unsatisfied.
 */
function outputPortsFor(
  node: GraphWorkflowConfig["nodes"][string],
): OutputPortInfo[] {
  if (node.type === "activity" || node.type === "pollUntil") {
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) return [];
    return entry.outputs.map((p) => ({ name: p.name, kind: p.kind }));
  }
  return nodeTypeCtxWrites(node.id, node).map((w) => ({
    name: w.port,
    kind: w.kind,
  }));
}

/**
 * Resolves the element kind T for a map node whose collection has kind T[].
 * Walks every activity/pollUntil node to find the one whose output ctxKey
 * matches the map's collectionCtxKey, then strips the `[]` suffix from its
 * kind. Returns `undefined` when the element kind cannot be determined.
 */
function resolveMapElementKind(
  config: GraphWorkflowConfig,
  mapNodeId: string,
): string | undefined {
  const map = config.nodes[mapNodeId];
  if (!map || map.type !== "map") return undefined;
  const collectionKey = map.collectionCtxKey;
  if (!collectionKey) return undefined;
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "activity" && node.type !== "pollUntil") continue;
    const output = node.outputs?.find((b) => b.ctxKey === collectionKey);
    if (!output) continue;
    const activityType = node.activityType;
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) continue;
    const portDescriptor = entry.outputs.find((p) => p.name === output.port);
    const kind = portDescriptor?.kind;
    if (!kind) continue;
    if (kind.endsWith("[]")) return kind.slice(0, -2);
  }
  return undefined;
}
