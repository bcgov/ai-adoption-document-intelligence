/**
 * Every shipped template sets only parameters its step's catalog entry
 * declares.
 *
 * The settings panel draws a step's settings from its catalog entry. A saved
 * parameter the entry does not declare is listed as a setting the step "no
 * longer uses", said to be ignored when the workflow runs, with a button that
 * removes it. The engine still passes every saved parameter to the activity,
 * so for one the activity reads, that message is false and the button breaks
 * the workflow. A step with no catalog entry has nothing to check against and
 * is skipped. Pure JSON inspection, no database.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getActivityParametersJsonSchema } from "@ai-di/graph-workflow";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "packages/graph-workflow/templates");

interface TemplateNode {
  activityType?: string;
  parameters?: Record<string, unknown>;
  workflowRef?: { type?: string; graph?: TemplateGraph };
}

interface TemplateGraph {
  nodes?: Record<string, TemplateNode>;
}

interface ParametersJsonSchema {
  properties?: Record<string, unknown>;
  anyOf?: ParametersJsonSchema[];
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

/** Parameter names a schema declares, across a discriminated union's variants. */
function declaredParameters(schema: ParametersJsonSchema): Set<string> {
  const names = new Set(Object.keys(schema.properties ?? {}));
  for (const variant of schema.anyOf ?? []) {
    for (const name of declaredParameters(variant)) names.add(name);
  }
  return names;
}

/** Saved parameters the step's catalog entry does not declare. */
function undeclaredParameters(fileName: string): string[] {
  const graph = JSON.parse(
    fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf-8"),
  ) as TemplateGraph;
  const found: string[] = [];
  for (const { label, nodeId, node } of stepsOf(graph, fileName)) {
    if (!node.activityType) continue;
    const schema = getActivityParametersJsonSchema(node.activityType) as
      | ParametersJsonSchema
      | undefined;
    if (!schema) continue;
    const declared = declaredParameters(schema);
    for (const name of Object.keys(node.parameters ?? {})) {
      if (!declared.has(name)) {
        found.push(`${label}: ${nodeId} (${node.activityType}) sets "${name}"`);
      }
    }
  }
  return found;
}

describe("shipped templates set only declared parameters", () => {
  it.each(TEMPLATE_FILES)("%s", (fileName) => {
    expect(undeclaredParameters(fileName)).toEqual([]);
  });
});
