/**
 * Debounced graph-validation hook for the visual editor.
 *
 * Wraps `validateGraphConfig` from the shared @ai-di/graph-workflow
 * package, supplies the activity catalog as the registry, and groups
 * errors by node so the canvas can surface red badges and the
 * Validation drawer can list issues per node.
 *
 * Per-activity parameters are validated through each catalog entry's
 * Zod schema; the resulting issues are flattened into the
 * GraphValidationError shape the validator expects.
 */

import {
  ACTIVITY_CATALOG,
  createCatalogParameterValidator,
  type GraphValidationError,
  type GraphWorkflowConfig,
  type ValidateGraphConfigOptions,
  validateGraphConfig,
} from "@ai-di/graph-workflow";
import { useEffect, useMemo, useState } from "react";
import { autoWireIssuesToValidationErrors } from "../auto-wire-validation";
import type { DynamicNodeCatalogEntry } from "../canvas/port-rows";
import { useActivityCatalog } from "../dynamic-nodes/useActivityCatalog";
import { mapBodyIssuesToValidationErrors } from "./map-body-validation";

const validateActivityParameters = createCatalogParameterValidator();

export interface GraphValidationResult {
  errors: GraphValidationError[];
  errorCount: number;
  warningCount: number;
  /** Errors bucketed by the node id parsed out of `path`. */
  errorsByNode: Map<string, GraphValidationError[]>;
  /** Errors whose path doesn't start with `nodes.` — e.g., entryNodeId, edges. */
  workflowLevelErrors: GraphValidationError[];
  /** True while a debounced run is pending. */
  isPending: boolean;
}

const EMPTY_ERRORS: GraphValidationError[] = [];
const EMPTY_NODE_IDS: string[] = [];

/**
 * One debounced validation run: the errors it produced, plus the node ids that
 * were in the graph when it produced them.
 *
 * D7 — these travel together deliberately. Bucketing errors resolves each
 * anchor against the graph's real node ids (G-096), and reading those ids from
 * the LIVE `config` made the result memo re-run — and hand out a brand-new
 * `errorsByNode` Map — on every keystroke, 300 ms before the validator that
 * could have changed anything actually ran. That new Map identity drove the
 * canvas's badge-sync effect, which replaced the whole xyflow node array and
 * re-rendered every card. Snapshotting the ids inside the run keeps G-096's
 * behaviour exactly while making the result stable between runs.
 */
interface ValidationRun {
  errors: GraphValidationError[];
  knownNodeIds: string[];
}

const EMPTY_RUN: ValidationRun = {
  errors: EMPTY_ERRORS,
  knownNodeIds: EMPTY_NODE_IDS,
};

/**
 * The registry callbacks `validateGraphConfig` needs in the editor: static
 * catalog + the group's published `dyn.*` lineages, plus the catalog-driven
 * parameter validator.
 *
 * Exported because the inline child-graph editor (G-015) validates the graph
 * inside its JSON textarea with the SAME rules the outer graph gets — sharing
 * the options object is what makes "the same rules" literally true rather
 * than approximately true.
 */
export function useValidatorOptions(): ValidateGraphConfigOptions {
  // Published dynamic nodes (`dyn.*`) only exist in the merged catalog the
  // backend serves — validating against the static ACTIVITY_CATALOG alone
  // flags every dynamic-node instance with a false "not registered" error.
  const { entries: mergedEntries, isLoading: catalogLoading } =
    useActivityCatalog();
  const mergedTypes = useMemo(
    () => new Set(mergedEntries.map((e) => e.activityType)),
    [mergedEntries],
  );
  return useMemo(
    () => ({
      isRegisteredActivityType: (type: string) =>
        Boolean(ACTIVITY_CATALOG[type]) ||
        mergedTypes.has(type) ||
        // While the merged catalog is still loading, give dyn.* types the
        // benefit of the doubt — otherwise a false "not registered" error
        // flashes on every editor load of a dynamic-node workflow.
        (catalogLoading && type.startsWith("dyn.")),
      validateActivityParameters,
    }),
    [mergedTypes, catalogLoading],
  );
}

export function useGraphValidation(
  config: GraphWorkflowConfig,
  debounceMs = 300,
): GraphValidationResult {
  const [run, setRun] = useState<ValidationRun>(EMPTY_RUN);
  const [isPending, setIsPending] = useState(false);
  const options = useValidatorOptions();

  // The merged catalog's published `dyn.*` entries, for the auto-wire pass
  // below. Same single query instance the canvas subscribes to (one query
  // key, no extra fetch), filtered to dynamic entries because that is all
  // the auto-wire selectors consult the list for — without them a dyn node's
  // required unbound inputs contribute no warnings at all.
  const { entries: catalogEntries } = useActivityCatalog();
  const dynamicEntries = useMemo<readonly DynamicNodeCatalogEntry[]>(
    () =>
      catalogEntries.filter((entry: DynamicNodeCatalogEntry) =>
        entry.activityType.startsWith("dyn."),
      ),
    [catalogEntries],
  );

  useEffect(() => {
    setIsPending(true);
    const handle = setTimeout(() => {
      const result = validateGraphConfig(config, options);
      // Fold auto-wire input health (unbound / ambiguous ports) into the same
      // problems list so it feeds the ONE unified surface — top-bar count,
      // per-node badge, and drawer — instead of a separate status-dot system.
      setRun({
        errors: [
          ...result.errors,
          ...autoWireIssuesToValidationErrors(config, dynamicEntries),
          ...mapBodyIssuesToValidationErrors(config),
        ],
        knownNodeIds: Object.keys(config.nodes ?? {}),
      });
      setIsPending(false);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [config, debounceMs, options, dynamicEntries]);

  // Bucketed separately from the result object below, and deliberately NOT
  // dependent on `isPending`. `errorsByNode` is the canvas's badge-sync input;
  // folding the pending flag in here would hand out a new Map on the first
  // keystroke of every editing burst, for no change in what it contains. The
  // run carries its own node-id snapshot (G-096's bucketing input), so the
  // live `config` is not a dependency either — see `ValidationRun`.
  const buckets = useMemo(() => {
    const { errors, knownNodeIds } = run;
    const errorsByNode = new Map<string, GraphValidationError[]>();
    const workflowLevelErrors: GraphValidationError[] = [];
    let errorCount = 0;
    let warningCount = 0;
    for (const err of errors) {
      if (err.severity === "error") errorCount += 1;
      else warningCount += 1;
      const nodeId = nodeIdFromPath(err.path, knownNodeIds);
      if (nodeId) {
        let bucket = errorsByNode.get(nodeId);
        if (!bucket) {
          bucket = [];
          errorsByNode.set(nodeId, bucket);
        }
        bucket.push(err);
      } else {
        workflowLevelErrors.push(err);
      }
    }
    return {
      errors,
      errorCount,
      warningCount,
      errorsByNode,
      workflowLevelErrors,
    };
  }, [run]);

  return useMemo(() => ({ ...buckets, isPending }), [buckets, isPending]);
}

/**
 * Bucket a validation anchor under the node it names.
 *
 * Node ids are author- and agent-supplied strings with no charset rule, so one
 * can contain a dot. Splitting at the first dot filed `nodes.my.node.inputs.x`
 * under a node called `my`, which exists nowhere: the drawer heading fell back
 * to the raw key and clicking the row selected nothing (G-096). Its greedy
 * counterpart `parseInputPortPath` (`/^nodes\.(.+)\.inputs\./`) disagreed with
 * it on exactly these paths.
 *
 * Matching against the ids the graph actually has removes the guess. Longest
 * match wins, so `a.b` beats `a` when both exist. The positional split stays as
 * a fallback for an anchor naming a node that has since been deleted — such an
 * error still belongs somewhere rather than vanishing from the drawer.
 */
export function nodeIdFromPath(
  path: string,
  knownNodeIds: readonly string[],
): string | null {
  if (!path.startsWith("nodes.")) return null;
  const rest = path.slice("nodes.".length);

  let best: string | null = null;
  for (const id of knownNodeIds) {
    if (rest === id || rest.startsWith(`${id}.`)) {
      if (best === null || id.length > best.length) best = id;
    }
  }
  if (best !== null) return best;

  const dot = rest.indexOf(".");
  return dot === -1 ? rest : rest.slice(0, dot);
}
