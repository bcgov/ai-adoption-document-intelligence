/**
 * Every shipped template binds a step's outputs only to ports the step
 * declares.
 *
 * The engine copies `result[binding.port]` into the variable each output
 * binding names (`apps/temporal/src/graph-engine/node-executors.ts`). A
 * binding under a name the step does not return writes an empty value over
 * the variable, and the next step reads nothing. The activity catalog declares
 * what each step returns, and the correction steps' tests in apps/temporal
 * check those declarations against the activities themselves, so a port
 * outside the step's catalog entry is that bug. A step with no catalog entry
 * has nothing to check against and is skipped. Pure JSON inspection, no
 * database.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getActivityCatalogEntry } from "@ai-di/graph-workflow";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "docs-md/workflows/templates");

interface PortBinding {
  port: string;
  ctxKey: string;
}

interface TemplateNode {
  activityType?: string;
  outputs?: PortBinding[];
  workflowRef?: { type?: string; graph?: TemplateGraph };
}

interface TemplateGraph {
  nodes?: Record<string, TemplateNode>;
}

const TEMPLATE_FILES = fs
  .readdirSync(TEMPLATE_DIR)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

/** The graph's own steps plus those of every inline child graph. */
function stepsOf(
  graph: TemplateGraph,
  label: string,
): Array<{ label: string; nodeId: string; node: TemplateNode }> {
  const steps: Array<{ label: string; nodeId: string; node: TemplateNode }> =
    [];
  for (const [nodeId, node] of Object.entries(graph.nodes ?? {})) {
    steps.push({ label, nodeId, node });
    const inline = node.workflowRef?.graph;
    if (node.workflowRef?.type === "inline" && inline) {
      steps.push(...stepsOf(inline, `${label} › ${nodeId}`));
    }
  }
  return steps;
}

/** Output bindings whose port the step's catalog entry does not declare. */
function undeclaredOutputPorts(fileName: string): string[] {
  const graph = JSON.parse(
    fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf-8"),
  ) as TemplateGraph;
  const found: string[] = [];
  for (const { label, nodeId, node } of stepsOf(graph, fileName)) {
    if (!node.activityType) continue;
    const entry = getActivityCatalogEntry(node.activityType);
    if (!entry) continue;
    const declared = new Set(entry.outputs.map((port) => port.name));
    for (const binding of node.outputs ?? []) {
      if (!declared.has(binding.port)) {
        found.push(
          `${label}: ${nodeId} (${node.activityType}) binds "${binding.port}"`,
        );
      }
    }
  }
  return found;
}

describe("shipped templates bind outputs to declared ports", () => {
  it.each(TEMPLATE_FILES)("%s", (fileName) => {
    expect(undeclaredOutputPorts(fileName)).toEqual([]);
  });
});
