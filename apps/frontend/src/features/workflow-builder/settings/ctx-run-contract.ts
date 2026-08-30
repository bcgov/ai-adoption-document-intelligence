/**
 * G-065 — what the `Input` checkbox actually does to the workflow's PUBLIC
 * contract.
 *
 * Ticking `isInput` does not just annotate a variable: it adds a property to
 * the JSON Schema `GET /api/workflows/:id/run-spec` publishes and `POST
 * /runs` validates bodies against — and, unless the declaration carries a
 * `defaultValue`, a REQUIRED one, which every existing caller immediately
 * fails. The drawer said none of that; the checkbox looked like a display
 * preference.
 *
 * The flag is also silently INERT under two conditions, which is the same
 * defect from the other side — the author ticks it and the contract does not
 * change at all:
 *   - a `source.api` node is present (it wins outright), or
 *   - the workflow is a library workflow (inputs come from `metadata.inputs[]`).
 *
 * This mirrors the precedence in
 * `apps/backend-services/src/workflow/derive-input-schema.ts`
 * (`deriveInputSchema`). If that order changes, this must change with it —
 * the two are a coupled pair, and a drawer that describes a contract the
 * backend does not publish is worse than saying nothing.
 */
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
} from "../../../types/workflow";

export type CtxRunContract =
  /** Not flagged as an input — invisible to callers. */
  | { status: "internal" }
  /** Callers MUST send it: flagged, no default, and nothing overrides. */
  | { status: "required" }
  /** Callers MAY send it: flagged, but a `defaultValue` fills the gap. */
  | { status: "optional" }
  /** Flagged, but something else supplies this workflow's inputs. */
  | { status: "ignored"; reason: "source-api" | "library" };

export function ctxRunContract(
  config: GraphWorkflowConfig,
  declaration: CtxDeclaration,
): CtxRunContract {
  if (declaration.isInput !== true) return { status: "internal" };

  const hasSourceApi = Object.values(config.nodes).some(
    (node) => node.type === "source" && node.sourceType === "source.api",
  );
  if (hasSourceApi) return { status: "ignored", reason: "source-api" };
  if (config.metadata?.kind === "library") {
    return { status: "ignored", reason: "library" };
  }

  return declaration.defaultValue !== undefined
    ? { status: "optional" }
    : { status: "required" };
}

/** One line of drawer copy, written from the caller's side of the API. */
export function describeRunContract(contract: CtxRunContract): string | null {
  switch (contract.status) {
    case "internal":
      return null;
    case "required":
      return "Callers must send this when starting a run";
    case "optional":
      return "Callers may send this; the default is used when they don't";
    case "ignored":
      return contract.reason === "source-api"
        ? "No effect — this workflow's inputs come from its API source node"
        : "No effect — library workflows take their inputs from the library port list";
  }
}
