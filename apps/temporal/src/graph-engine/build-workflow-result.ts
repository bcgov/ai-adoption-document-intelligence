import type { GraphWorkflowResult } from "../graph-workflow-types";
import { isOcrPayloadRef, type OcrPayloadRef } from "../ocr-payload-ref-types";
import type { ExecutionState } from "./execution-state";

function pickRef(
  ctx: Record<string, unknown>,
  key: string,
): OcrPayloadRef | undefined {
  const value = ctx[key];
  return isOcrPayloadRef(value) ? value : undefined;
}

function extractOutputPaths(ctx: Record<string, unknown>): string[] {
  const paths: string[] = [];

  if (Array.isArray(ctx.outputPaths)) {
    for (const p of ctx.outputPaths) {
      if (typeof p === "string") paths.push(p);
    }
  }

  if (typeof ctx.outputPath === "string") {
    paths.push(ctx.outputPath);
  }

  if (Array.isArray(ctx.results)) {
    for (const result of ctx.results) {
      if (result && typeof result === "object" && "outputPath" in result) {
        const r = result as Record<string, unknown>;
        if (typeof r.outputPath === "string") {
          paths.push(r.outputPath);
        }
      }
    }
  }

  if (paths.length === 0 && typeof ctx.outputBaseDir === "string") {
    paths.push(ctx.outputBaseDir);
  }

  return paths;
}

export function buildGraphWorkflowResult(
  state: ExecutionState,
  status: GraphWorkflowResult["status"],
): GraphWorkflowResult {
  const documentId =
    typeof state.ctx.documentId === "string" ? state.ctx.documentId : undefined;

  const failedNodeId =
    typeof state.ctx.failedNodeId === "string"
      ? state.ctx.failedNodeId
      : undefined;

  return {
    status,
    completedNodes: Array.from(state.completedNodeIds),
    documentId,
    refs: {
      ocrResponseRef: pickRef(state.ctx, "ocrResponseRef"),
      ocrResultRef: pickRef(state.ctx, "ocrResultRef"),
      cleanedResultRef: pickRef(state.ctx, "cleanedResultRef"),
    },
    failedNodeId,
    outputPaths: extractOutputPaths(state.ctx),
  };
}
