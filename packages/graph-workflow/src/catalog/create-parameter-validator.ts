/**
 * Shared adapter that turns a catalog of activity Zod parameter schemas
 * into the `validateActivityParameters` callback the shared
 * `validateGraphConfig` expects.
 *
 * Used by:
 *   - backend save-time validator (apps/backend-services)
 *   - temporal execute-time validator (apps/temporal)
 *   - frontend editor validation hook (apps/frontend)
 *
 * Keeping this in one place ensures the three call sites can't drift on
 * how Zod issues are mapped to `GraphValidationError` paths.
 */

import type { GraphValidationError } from "../types";
import { ACTIVITY_CATALOG } from "./index";
import type { ActivityCatalogEntry } from "./types";

export type ValidateActivityParameters = (
  activityType: string,
  nodeId: string,
  parameters: Record<string, unknown> | undefined,
  errors: GraphValidationError[],
) => void;

/**
 * Build a `validateActivityParameters` callback that runs each activity's
 * catalog Zod schema and pushes Zod issues onto the shared
 * `GraphValidationError[]` array.
 *
 * If `catalog` is omitted, the default `ACTIVITY_CATALOG` is used.
 *
 * Activities not present in the supplied catalog are silently ignored —
 * the caller's `isRegisteredActivityType` is the gate for "should this
 * activity exist at all?".
 */
export function createCatalogParameterValidator(
  catalog: Record<string, ActivityCatalogEntry> = ACTIVITY_CATALOG,
): ValidateActivityParameters {
  return (activityType, nodeId, parameters, errors) => {
    const entry = catalog[activityType];
    if (!entry) return;
    // Dynamic-node entries (Phase 6) carry `paramsSchema` (JSON Schema 7)
    // instead of a Zod `parametersSchema`. Parameter validation for those
    // entries is handled separately by the publish-time pipeline; skip here.
    if (!entry.parametersSchema) return;
    const parsed = entry.parametersSchema.safeParse(parameters ?? {});
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      const suffix =
        issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
      errors.push({
        path: `nodes.${nodeId}.parameters${suffix}`,
        message: issue.message,
        severity: "error",
      });
    }
  };
}
