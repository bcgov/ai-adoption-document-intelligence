import { APIRequestContext, expect } from "@playwright/test";
import { BACKEND_URL, TEST_API_KEY } from "./wb-test";

const headers = {
  "x-api-key": TEST_API_KEY,
  "Content-Type": "application/json",
};

/**
 * A minimal, publish-valid dynamic-node script (mirrors the Phase 6 walkthrough
 * fixture). Publishing runs jsdoc-parse → signature-semantics → ts-check
 * (via the deno-runner sidecar) → allowlist, so callers of `publishDynamicNode`
 * MUST be in the @infra tier.
 */
export function validDynamicNodeScript(name: string): string {
  return `import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name ${name}
 * @description Uppercases the documentUrl field.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  ctx: { document: Document },
  _params: Record<string, unknown>,
): Promise<{ result: { url: string } }> {
  const url = String((ctx.document as { url?: string }).url ?? "");
  return { result: { url: url.toUpperCase() } };
}`;
}

export async function publishDynamicNode(
  request: APIRequestContext,
  name: string,
): Promise<{ slug: string; version: number }> {
  const res = await request.post(`${BACKEND_URL}/api/dynamic-nodes`, {
    headers,
    data: { script: validDynamicNodeScript(name) },
  });
  expect(
    res.ok(),
    `publish dynamic node failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  return (await res.json()) as { slug: string; version: number };
}

export async function deleteDynamicNode(
  request: APIRequestContext,
  slug: string,
): Promise<void> {
  await request.delete(`${BACKEND_URL}/api/dynamic-nodes/${slug}`, { headers });
}
