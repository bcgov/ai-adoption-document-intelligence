/**
 * `selectPreviewOutput` — which of a node's output ports is being previewed,
 * what value sits behind it, and what kind that value claims to be.
 *
 * Extracted when item 9 (Option C) split the node-card preview into a
 * fixed-height strip plus a popover: the strip summarises the selected value
 * and the popover renders it in full, so the SAME selection has to happen in
 * two components. Two copies of the `resolveCtxBinding` + kind-fallback rules
 * would drift, and the wrong one drifting means a card whose one-line summary
 * disagrees with the panel it opens.
 */

import { resolveCtxBinding } from "@ai-di/graph-workflow";

import type {
  ActivityOutputPreview,
  PreviewOutputBinding,
} from "./preview.types";

export interface SelectedPreviewOutput {
  /** The port being previewed — `undefined` when the node declares none. */
  selected: PreviewOutputBinding | undefined;
  /** The value bound to that port. `undefined` means "the key holds nothing". */
  value: unknown;
  /** The kind to render `value` as, or `null` when nothing declares one. */
  kind: string | null;
}

/**
 * @param outputs      Every previewable output of the node, in declaration
 *                     order (G-011).
 * @param selectedPort The port the author picked, or `null` for "the first
 *                     one", which keeps the single-output case unchanged.
 * @param data         The node's cache row.
 */
export function selectPreviewOutput(
  outputs: readonly PreviewOutputBinding[],
  selectedPort: string | null,
  data: ActivityOutputPreview,
): SelectedPreviewOutput {
  const selected =
    outputs.find((output) => output.port === selectedPort) ?? outputs[0];

  // `outputCtx` is stored NESTED at runtime (the engine splits the ctxKey on
  // "." and namespace-remaps prefixes). `resolveCtxBinding` performs the
  // identical read the engine resolver uses, so flat, `__auto.*` and
  // namespaced keys all resolve.
  const value =
    selected === undefined
      ? undefined
      : resolveCtxBinding(selected.ctxKey, data.outputCtx);

  // G-011: `data.outputKind` types only the FIRST port — the worker's cache
  // decorator records `entry.outputs[0].kind` — so it stands in only for that
  // port. Later ports rely on their own catalog descriptor and fall through to
  // the generic renderer when they have none.
  const kind =
    selected?.kind ??
    (selected !== undefined && selected === outputs[0]
      ? data.outputKind
      : null);

  return { selected, value, kind };
}
