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

export const OCR_CORRECTION_AFTER_ACTIVITY_TYPE = "azureOcr.extract";

export interface BuildInsertionSlotsOptions {
  postAzureOcrExtractOnly?: boolean;
}

function findActivityNodeIdsByType(
  config: InsertionSlotsGraphConfig,
  activityType: string,
): Set<string> {
  const ids = new Set<string>();
  for (const [id, node] of Object.entries(config.nodes)) {
    if (node.type !== "activity") continue;
    if (node.activityType === activityType) {
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
  const extractIds = findActivityNodeIdsByType(
    config,
    OCR_CORRECTION_AFTER_ACTIVITY_TYPE,
  );
  if (extractIds.size === 0) {
    return true;
  }
  const allowed = forwardReachableNormalFromNodes(config, extractIds);
  return allowed.has(sourceNodeId);
}

export function buildInsertionSlots(
  config: InsertionSlotsGraphConfig,
  options?: BuildInsertionSlotsOptions,
): InsertionSlot[] {
  const postExtractOnly = options?.postAzureOcrExtractOnly === true;
  const allowedSources: Set<string> | null = postExtractOnly
    ? (() => {
        const extractIds = findActivityNodeIdsByType(
          config,
          OCR_CORRECTION_AFTER_ACTIVITY_TYPE,
        );
        if (extractIds.size === 0) {
          return new Set<string>();
        }
        return forwardReachableNormalFromNodes(config, extractIds);
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
 * Normal edges whose source activity is {@link OCR_CORRECTION_AFTER_ACTIVITY_TYPE}.
 * If multiple exist, the result is deterministic (lexicographic by afterNodeId, then beforeNodeId).
 */
export function findSlotImmediatelyAfterAzureOcrExtract(
  slots: Pick<
    InsertionSlot,
    "afterNodeId" | "beforeNodeId" | "afterActivityType"
  >[],
): { afterNodeId: string; beforeNodeId: string } | undefined {
  const want = OCR_CORRECTION_AFTER_ACTIVITY_TYPE.toLowerCase();
  const matches = slots.filter(
    (s) =>
      s.afterActivityType != null &&
      s.afterActivityType.toLowerCase() === want,
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
