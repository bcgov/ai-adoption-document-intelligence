/**
 * Graph insertion-slot helpers (shared by backend-services and Temporal worker).
 * Minimal graph shape: only `nodes` and `edges` are read.
 */

export interface GraphNodeForInsertionSlots {
  type?: string;
  activityType?: string;
}

export interface GraphEdgeForInsertionSlots {
  id: string;
  type: string;
  source: string;
  target: string;
}

/** Minimal graph shape for insertion-slot algorithms. */
export interface InsertionSlotsGraphConfig {
  nodes: Record<string, GraphNodeForInsertionSlots>;
  edges: GraphEdgeForInsertionSlots[];
}

export interface InsertionSlot {
  slotIndex: number;
  afterNodeId: string;
  beforeNodeId: string;
  afterActivityType: string | null;
  beforeActivityType: string | null;
  edgeId: string;
}

function nodeActivityType(
  node: GraphNodeForInsertionSlots | undefined,
): string | null {
  if (!node || node.type !== "activity") return null;
  return node.activityType ?? null;
}

/**
 * Activity types whose node outputs structured OCR (`ocrResult` shape) used by
 * downstream cleanup and correction tools. Extend this list when adding a new
 * OCR provider whose graph ends with an equivalent “structured extract” step.
 */
export const OCR_CORRECTION_AFTER_ACTIVITY_TYPES = [
  "azureOcr.extract",
  "mistralOcr.process",
] as const;

export type OcrCorrectionAnchorActivityType =
  (typeof OCR_CORRECTION_AFTER_ACTIVITY_TYPES)[number];

export interface BuildInsertionSlotsOptions {
  /** Only list normal edges whose source is reachable from a structured-OCR anchor (see {@link OCR_CORRECTION_AFTER_ACTIVITY_TYPES}). */
  postAzureOcrExtractOnly?: boolean;
}

function findActivityNodeIdsByTypes(
  config: InsertionSlotsGraphConfig,
  activityTypes: readonly string[],
): Set<string> {
  const want = new Set(activityTypes.map((t) => t.toLowerCase()));
  const ids = new Set<string>();
  for (const [id, node] of Object.entries(config.nodes)) {
    if (node.type !== "activity") continue;
    const at = node.activityType;
    if (at != null && want.has(at.toLowerCase())) {
      ids.add(id);
    }
  }
  return ids;
}

export function forwardReachableNormalFromNodes(
  config: InsertionSlotsGraphConfig,
  seeds: Set<string>,
): Set<string> {
  if (seeds.size === 0) {
    return new Set();
  }
  const adj = new Map<string, string[]>();
  for (const edge of config.edges) {
    if (edge.type !== "normal") continue;
    if (!(edge.source in config.nodes) || !(edge.target in config.nodes)) {
      continue;
    }
    const next = adj.get(edge.source) ?? [];
    next.push(edge.target);
    adj.set(edge.source, next);
  }
  const visited = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
      }
    }
  }
  return visited;
}

export function isOcrCorrectionInsertionEdgeSourceAllowed(
  config: InsertionSlotsGraphConfig,
  sourceNodeId: string,
): boolean {
  const anchorIds = findActivityNodeIdsByTypes(
    config,
    OCR_CORRECTION_AFTER_ACTIVITY_TYPES,
  );
  if (anchorIds.size === 0) {
    return true;
  }
  const allowed = forwardReachableNormalFromNodes(config, anchorIds);
  return allowed.has(sourceNodeId);
}

export function buildInsertionSlots(
  config: InsertionSlotsGraphConfig,
  options?: BuildInsertionSlotsOptions,
): InsertionSlot[] {
  const postExtractOnly = options?.postAzureOcrExtractOnly === true;
  const allowedSources: Set<string> | null = postExtractOnly
    ? (() => {
        const anchorIds = findActivityNodeIdsByTypes(
          config,
          OCR_CORRECTION_AFTER_ACTIVITY_TYPES,
        );
        // No registered structured-OCR node: do not use an empty Set (that would
        // drop every edge). Fall back to unfiltered edges so callers/debug logs
        // still see the graph; findSlotImmediatelyAfterAzureOcrExtract may still
        // return undefined until the activity type is added to the anchor list.
        if (anchorIds.size === 0) {
          return null;
        }
        return forwardReachableNormalFromNodes(config, anchorIds);
      })()
    : null;

  const slots: InsertionSlot[] = [];
  const seen = new Set<string>();
  for (const edge of config.edges) {
    if (edge.type !== "normal") continue;
    const sourceNode = config.nodes[edge.source];
    const targetNode = config.nodes[edge.target];
    if (!sourceNode || !targetNode) continue;
    if (allowedSources !== null && !allowedSources.has(edge.source)) {
      continue;
    }
    const key = `${edge.source}\0${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({
      slotIndex: slots.length,
      afterNodeId: edge.source,
      beforeNodeId: edge.target,
      afterActivityType: nodeActivityType(sourceNode),
      beforeActivityType: nodeActivityType(targetNode),
      edgeId: edge.id,
    });
  }
  return slots;
}

/**
 * First normal edge leaving a structured-OCR anchor ({@link OCR_CORRECTION_AFTER_ACTIVITY_TYPES}).
 * If multiple exist, the result is deterministic (lexicographic by afterNodeId, then beforeNodeId).
 */
export function findSlotImmediatelyAfterAzureOcrExtract(
  slots: Pick<
    InsertionSlot,
    "afterNodeId" | "beforeNodeId" | "afterActivityType"
  >[],
): { afterNodeId: string; beforeNodeId: string } | undefined {
  const want = new Set(
    OCR_CORRECTION_AFTER_ACTIVITY_TYPES.map((t) => t.toLowerCase()),
  );
  const matches = slots.filter(
    (s) =>
      s.afterActivityType != null &&
      want.has(s.afterActivityType.toLowerCase()),
  );
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const c = a.afterNodeId.localeCompare(b.afterNodeId);
    if (c !== 0) return c;
    return a.beforeNodeId.localeCompare(b.beforeNodeId);
  });
  const found = matches[0];
  return { afterNodeId: found.afterNodeId, beforeNodeId: found.beforeNodeId };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function findSlotByActivityTypes(
  slots: InsertionSlot[],
  afterActivityType: string,
  beforeActivityType: string,
): InsertionSlot | undefined {
  const a = norm(afterActivityType);
  const b = norm(beforeActivityType);
  return slots.find((s) => {
    if (!s.afterActivityType || !s.beforeActivityType) return false;
    return (
      norm(s.afterActivityType) === a && norm(s.beforeActivityType) === b
    );
  });
}

export interface RecommendationWithInsertion {
  insertionPoint: { afterNodeId?: string; beforeNodeId?: string };
  insertionSlotIndex?: number;
  afterActivityType?: string;
  beforeActivityType?: string;
}

export type ResolvedRecommendation<T extends RecommendationWithInsertion> =
  Omit<T, "insertionPoint"> & {
    insertionPoint: { afterNodeId?: string; beforeNodeId?: string };
  };

/**
 * Prefer insertionSlotIndex, then afterActivityType+beforeActivityType against slots;
 * otherwise leave insertionPoint unchanged.
 */
export function resolveRecommendationsInsertionSlots<
  T extends RecommendationWithInsertion,
>(
  recommendations: T[],
  slots: InsertionSlot[],
): ResolvedRecommendation<T>[] {
  if (slots.length === 0) {
    return recommendations;
  }
  return recommendations.map((rec) => {
    if (
      typeof rec.insertionSlotIndex === "number" &&
      Number.isFinite(rec.insertionSlotIndex)
    ) {
      const idx = Math.floor(rec.insertionSlotIndex);
      const slot = slots[idx];
      if (slot) {
        return {
          ...rec,
          insertionPoint: {
            afterNodeId: slot.afterNodeId,
            beforeNodeId: slot.beforeNodeId,
          },
        };
      }
    }
    if (
      typeof rec.afterActivityType === "string" &&
      rec.afterActivityType.trim() !== "" &&
      typeof rec.beforeActivityType === "string" &&
      rec.beforeActivityType.trim() !== ""
    ) {
      const found = findSlotByActivityTypes(
        slots,
        rec.afterActivityType,
        rec.beforeActivityType,
      );
      if (found) {
        return {
          ...rec,
          insertionPoint: {
            afterNodeId: found.afterNodeId,
            beforeNodeId: found.beforeNodeId,
          },
        };
      }
    }
    return rec;
  });
}
