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
  validateGraphConfig,
} from "@ai-di/graph-workflow";
import { useEffect, useMemo, useState } from "react";

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

export function useGraphValidation(
  config: GraphWorkflowConfig,
  debounceMs = 300,
): GraphValidationResult {
  const [errors, setErrors] = useState<GraphValidationError[]>(EMPTY_ERRORS);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsPending(true);
    const handle = setTimeout(() => {
      const result = validateGraphConfig(config, {
        isRegisteredActivityType: (type) => Boolean(ACTIVITY_CATALOG[type]),
        validateActivityParameters,
      });
      setErrors(result.errors);
      setIsPending(false);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [config, debounceMs]);

  return useMemo(() => {
    const errorsByNode = new Map<string, GraphValidationError[]>();
    const workflowLevelErrors: GraphValidationError[] = [];
    let errorCount = 0;
    let warningCount = 0;
    for (const err of errors) {
      if (err.severity === "error") errorCount += 1;
      else warningCount += 1;
      const nodeId = nodeIdFromPath(err.path);
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
      isPending,
    };
  }, [errors, isPending]);
}

function nodeIdFromPath(path: string): string | null {
  if (!path.startsWith("nodes.")) return null;
  const rest = path.slice("nodes.".length);
  const dot = rest.indexOf(".");
  return dot === -1 ? rest : rest.slice(0, dot);
}
