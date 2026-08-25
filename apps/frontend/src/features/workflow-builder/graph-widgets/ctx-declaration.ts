import type { CtxDeclaration } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

/**
 * Declare a workflow-level ctx variable, returning a new config with the
 * key added to `config.ctx`. This is what the VariablePicker's inline
 * "+ Create variable" affordance calls so binding a port to a brand-new
 * ctx key doesn't require a detour to Workflow Settings — an undeclared
 * ctx key on a port binding is a save-blocking validation error.
 *
 * Pure. No-op (returns the same reference) when the key already exists, so
 * a stray call never clobbers an existing declaration's type/description.
 * Defaults new keys to `object` — the most permissive runtime shape; the
 * author can refine the type later in Workflow Settings.
 */
export function declareCtxKey(
  config: GraphWorkflowConfig,
  key: string,
  type: CtxDeclaration["type"] = "object",
): GraphWorkflowConfig {
  if (config.ctx?.[key]) return config;
  return {
    ...config,
    ctx: {
      ...(config.ctx ?? {}),
      [key]: { type },
    },
  };
}
