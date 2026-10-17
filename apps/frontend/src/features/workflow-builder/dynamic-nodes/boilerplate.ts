/**
 * Boilerplate prefill for the `DynamicNodeEditor` in create-mode
 * (Phase 6 US-177 / REQUIREMENTS L38).
 *
 * Mirrors the exact snippet from REQUIREMENTS §3.3 L38 — the editor mounts
 * this string verbatim when no `slug` is provided, giving authors (and the
 * Phase 7 agent) a minimal-but-valid starting point that already parses
 * cleanly against the shared `parseDynamicNodeSignature` (Phase 6 US-158 /
 * US-159).
 */
export const DYNAMIC_NODE_BOILERPLATE = `import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name my-custom-node
 * @description TODO
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
// The document input above is an example. A node declares the inputs it
// needs, required or not, or none with \`@inputs {}\`.
export default async function dynamicNode(
  ctx: { document: Document },
  params: {},
): Promise<{ result: unknown }> {
  return { result: ctx.document };
}
`;
