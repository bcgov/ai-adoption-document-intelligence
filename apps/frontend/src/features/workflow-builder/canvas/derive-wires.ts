/**
 * `deriveWires` — pure selector mapping a workflow config to renderable
 * port-to-port wires. See PORT_WIRING_DESIGN.md §5.
 *
 * The persisted model stays untouched: `config.edges[]` remains the source
 * of truth for execution order, `node.inputs/outputs` (PortBinding[])
 * remains the source of truth for data flow. This module derives a single
 * `Wire[]` view over both for the canvas to render.
 *
 * Producer resolution mirrors `graph-widgets/resolve-producer-kind.ts`
 * (catalog-declared outputs first, then source-node synthetic producers) —
 * see that module's docstring for the precedence rationale. Read it before
 * changing this file's producer-index logic so the two stay in sync.
 *
 * Performance note for the future integration: `deriveWires` is pure but
 * not free — it calls `resolveInputPort`, which walks the upstream graph
 * per auto-bound input port. Callers wiring this into the canvas should
 * memoize per config fingerprint (e.g. `configHash`) rather than
 * re-deriving on every render.
 */
import {
  type AutoBoundVia,
  type FieldDescriptor,
  getActivityCatalogEntry,
  getLockedInputPorts,
  getSourceCatalogEntry,
  isAutoCtxKey,
  type KindRef,
  nodeTypeCtxWrites,
  producerCtxKeyForPort,
  resolveInputPort,
} from "@ai-di/graph-workflow";
import type { GraphEdge, GraphWorkflowConfig } from "../../../types/workflow";

export interface DataWire {
  variant: "data";
  /**
   * `wire:${target}:${targetPort}` — stable, distinct from edge ids.
   * Uniqueness assumes one `inputs[]` row per (node, port) — duplicate
   * rows for the same port would collide.
   */
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  /** Producer port kind, falling back to the consumer's expected kind. */
  kind?: KindRef;
  /** Consumer port is in `metadata.lockedInputPorts`. */
  pinned: boolean;
  /** ctxKey starts with `__auto.`. */
  auto: boolean;
  /**
   * Only set for auto + unpinned wires where the resolver auto-binds to
   * this wire's exact producer (node + port) — never claims a mechanism
   * for a stale binding the resolver would no longer produce.
   */
  via?: AutoBoundVia;
  /** Normal edge between the pair, if any. */
  edgeId?: string;
  ctxKey: string;
}

export interface StructuralWire {
  variant: "sequence" | "conditional" | "error";
  /** Underlying edge id. */
  id: string;
  edge: GraphEdge;
}

export type DerivedWire = DataWire | StructuralWire;

interface Producer {
  nodeId: string;
  port: string;
  kind?: KindRef;
}

/**
 * Index of every ctx key some node writes, keyed by ctx key. Built from
 * declared `outputs[]` bindings (kind resolved via the activity catalog
 * when the producing node has an `activityType`), then source-node
 * synthetic emissions (`source.upload`'s single ctx key, `source.api`'s
 * per-field ctx keys), then the remaining control-flow writes (G-007). The
 * source-node branch mirrors `graph-widgets/resolve-producer-kind.ts`'s
 * source handling — read that module before changing it so the two stay in
 * sync.
 *
 * Two deliberate divergences from that module: (1) ANY node's `outputs[]`
 * bindings index as producers here, not just activity/pollUntil — design
 * §5.1 says "some node N has an output binding", and a wire to a
 * non-catalog producer is still a real binding worth drawing (its kind is
 * simply unknown); (2) duplicate writers of the same ctx key resolve
 * first-writer-wins in node-iteration order — no validator currently
 * flags duplicate writers, so the index just needs a deterministic pick.
 */
function buildProducerIndex(
  config: GraphWorkflowConfig,
): Map<string, Producer> {
  const index = new Map<string, Producer>();

  for (const producerNode of Object.values(config.nodes)) {
    if (!producerNode.outputs) continue;
    const catalogEntry =
      producerNode.type === "activity" || producerNode.type === "pollUntil"
        ? getActivityCatalogEntry(producerNode.activityType)
        : undefined;
    for (const binding of producerNode.outputs) {
      if (index.has(binding.ctxKey)) continue;
      const portDescriptor = catalogEntry?.outputs.find(
        (p) => p.name === binding.port,
      );
      index.set(binding.ctxKey, {
        nodeId: producerNode.id,
        port: binding.port,
        kind: portDescriptor?.kind,
      });
    }
  }

  for (const sourceNode of Object.values(config.nodes)) {
    if (sourceNode.type !== "source") continue;
    const entry = getSourceCatalogEntry(sourceNode.sourceType);
    if (!entry) continue;

    // Source nodes have no `outputs[]` bindings — they write directly to
    // ctx — so the wire's `sourcePort` is the emitted field's name (the
    // ctx key for source.upload, the field name for source.api). Mapping
    // that onto the renderer's actual handle id is the render-layer
    // projection's concern, not this data model's.
    if (sourceNode.sourceType === "source.upload") {
      const params = sourceNode.parameters as { ctxKey?: unknown } | undefined;
      const producedKey =
        typeof params?.ctxKey === "string" && params.ctxKey.length > 0
          ? params.ctxKey
          : "documentUrl";
      if (!index.has(producedKey)) {
        index.set(producedKey, {
          nodeId: sourceNode.id,
          port: producedKey,
          kind: entry.outputKind,
        });
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
        if (index.has(field.name)) continue;
        index.set(field.name, {
          nodeId: sourceNode.id,
          port: field.name,
          kind: field.kind ?? "Artifact",
        });
      }
    }
  }

  // G-007 follow-up: control-flow producers. `map`, `join`, `childWorkflow`
  // and `humanGate` write ctx through their own fields (`itemCtxKey`,
  // `resultsCtxKey`, `outputMappings`, the `<nodeId>Payload` key) rather than
  // through `outputs[]`, so before this pass a consumer the resolver
  // auto-bound to one of them rendered NO wire — a correct binding the author
  // could neither see nor delete. `nodeTypeCtxWrites` is the same enumeration
  // the resolver's `outputPortsFor` uses, so the two can never disagree about
  // what a node produces. `switch` writes nothing and contributes nothing.
  //
  // `map` joined this pass in G-104. It was held back because the resolver
  // reported `producerPort = itemCtxKey` while this enumeration reports the
  // stable port name `"item"`, so a map wire's provenance lookup below could
  // never match; the resolver now reports `"item"` too.
  //
  // `source` is still deliberately NOT indexed here — the branch above owns
  // its per-subtype kinds (`outputKind` / per-field `kind`), which
  // `nodeTypeCtxWrites` does not carry for an untyped `source.api` field.
  for (const producerNode of Object.values(config.nodes)) {
    if (producerNode.type === "source") continue;
    for (const write of nodeTypeCtxWrites(producerNode.id, producerNode)) {
      // An empty ctx key is not a write — the same rule `writerSourcesKey`
      // applies. A half-configured control-flow node (a freshly dropped map
      // has `itemCtxKey: ""`) must not become the producer every equally
      // blank binding matches.
      if (write.ctxKey === "") continue;
      if (index.has(write.ctxKey)) continue;
      index.set(write.ctxKey, {
        nodeId: producerNode.id,
        port: write.port,
        kind: write.kind,
      });
    }
  }

  return index;
}

/**
 * §5.1: for each consumer input binding whose ctx key has a producer (and
 * isn't self-produced), derive a data wire. Bindings with no producer are
 * skipped whether they're unbound or bound to a `config.ctx` declaration —
 * either way there is no wire to draw.
 */
function deriveDataWires(
  config: GraphWorkflowConfig,
  producers: Map<string, Producer>,
): DataWire[] {
  const wires: DataWire[] = [];

  for (const consumerNode of Object.values(config.nodes)) {
    if (!consumerNode.inputs) continue;
    const lockedPorts = getLockedInputPorts(consumerNode);
    const catalogEntry =
      consumerNode.type === "activity" || consumerNode.type === "pollUntil"
        ? getActivityCatalogEntry(consumerNode.activityType)
        : undefined;

    for (const binding of consumerNode.inputs) {
      const producer = producers.get(binding.ctxKey);
      if (!producer || producer.nodeId === consumerNode.id) continue;

      const pinned = lockedPorts.includes(binding.port);
      const auto = isAutoCtxKey(binding.ctxKey);
      const inputDescriptor = catalogEntry?.inputs.find(
        (p) => p.name === binding.port,
      );

      // Provenance (`via`) comes from re-running the resolver, so it only
      // describes THIS wire when the resolver still lands on the persisted
      // binding's producer. On a stale config (topology changed after the
      // binding was written) the resolver may pick a different producer —
      // the wire still renders where the binding points, but claiming the
      // resolver's mechanism for it would be a lie, so `via` stays unset.
      //
      // "The resolver owns this binding" is `auto` for an activity producer,
      // whose key really is `__auto.<node>.<port>` unless an `outputs[]` row
      // says otherwise. A control-flow producer never has an auto key: it
      // writes through a dedicated field the AUTHOR names (`itemCtxKey`,
      // `resultsCtxKey`), so `auto` is false and this gate used to close on
      // every one of them (G-104 — a map-item wire could never claim the
      // `map-item` provenance `WorkflowEdge` already renders). The
      // equivalent test there is that the binding's key IS the key the
      // producer's type-level write emits for this port. That stays
      // conservative for `outputs[]`-based producers: `producerCtxKeyForPort`
      // returns undefined for activity/pollUntil, so a hand-authored ctx
      // binding to one still gets no `via`.
      let via: AutoBoundVia | undefined;
      const producerNode = config.nodes[producer.nodeId];
      const resolverOwnsBinding =
        auto ||
        (producerNode !== undefined &&
          producerCtxKeyForPort(producerNode, producer.port) ===
            binding.ctxKey);
      if (resolverOwnsBinding && !pinned && inputDescriptor) {
        const resolution = resolveInputPort(config, consumerNode.id, {
          name: inputDescriptor.name,
          kind: inputDescriptor.kind,
        });
        if (
          resolution.status === "auto-bound" &&
          resolution.producerNodeId === producer.nodeId &&
          resolution.producerPort === producer.port
        ) {
          via = resolution.via;
        }
      }

      wires.push({
        variant: "data",
        id: `wire:${consumerNode.id}:${binding.port}`,
        source: producer.nodeId,
        sourcePort: producer.port,
        target: consumerNode.id,
        targetPort: binding.port,
        kind: producer.kind ?? inputDescriptor?.kind,
        pinned,
        auto,
        via,
        ctxKey: binding.ctxKey,
      });
    }
  }

  return wires;
}

/**
 * §5.2/§5.3: conditional/error edges always pass through as structural
 * wires. A `normal` edge whose (source, target) pair produced no data wire
 * becomes a `sequence` structural wire; if the pair DID produce data
 * wire(s), the edge id is stamped onto those wires instead (for run-status
 * animation) and no separate sequence wire is emitted.
 */
function deriveStructuralWires(
  config: GraphWorkflowConfig,
  dataWires: DataWire[],
): StructuralWire[] {
  const structural: StructuralWire[] = [];

  for (const edge of config.edges) {
    if (edge.type === "conditional" || edge.type === "error") {
      structural.push({ variant: edge.type, id: edge.id, edge });
      continue;
    }

    const unstampedPairWires = dataWires.filter(
      (wire) =>
        wire.source === edge.source &&
        wire.target === edge.target &&
        wire.edgeId === undefined,
    );
    if (unstampedPairWires.length === 0) {
      // Either the pair has no data wires, or an earlier normal edge
      // already claimed them all (duplicate edges between one pair). In
      // both cases the edge renders as a sequence wire so it never
      // silently disappears from the canvas.
      structural.push({ variant: "sequence", id: edge.id, edge });
      continue;
    }
    for (const wire of unstampedPairWires) {
      wire.edgeId = edge.id;
    }
  }

  return structural;
}

export function deriveWires(config: GraphWorkflowConfig): DerivedWire[] {
  const producers = buildProducerIndex(config);
  const dataWires = deriveDataWires(config, producers);
  const structuralWires = deriveStructuralWires(config, dataWires);
  return [...dataWires, ...structuralWires];
}
