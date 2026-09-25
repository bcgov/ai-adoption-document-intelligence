/**
 * Every shipped template's OCR steps read one model.
 *
 * Azure Document Intelligence keeps an analysis under the model it was
 * submitted to; asking for the result under another model id is a 404. In a
 * workflow, Submit OCR sends the model Prepare File put into the prepared
 * file, while Wait for OCR Result and Extract OCR Result each take their own
 * `modelId` input. The steps agree only if they all read the same value, so
 * each one binds `modelId` to a workflow variable — the same variable — and
 * none has a model typed into its settings.
 *
 * A model typed into one step passes the validator, the shipped-workflow
 * linter and any run that uses the template's default model, because the
 * default then matches. It fails only when a run starts with another model,
 * which is what the Upload page and the documents API do. This test is pure
 * JSON inspection — no database, no network.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "docs-md/workflows/templates");

/** The steps whose model has to match the one the file was submitted to. */
const MODEL_STEPS = new Set([
  "file.prepare",
  "azureOcr.poll",
  "azureOcr.extract",
]);

interface PortBinding {
  port: string;
  ctxKey: string;
}

interface TemplateNode {
  type?: string;
  activityType?: string;
  inputs?: PortBinding[];
  parameters?: Record<string, unknown>;
  workflowRef?: { type?: string; graph?: TemplateGraph };
}

interface TemplateGraph {
  ctx?: Record<string, unknown>;
  nodes?: Record<string, TemplateNode>;
}

function loadTemplates(): Array<{ fileName: string; graph: TemplateGraph }> {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((fileName) => ({
      fileName,
      graph: JSON.parse(
        fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf-8"),
      ) as TemplateGraph,
    }));
}

/**
 * The graph itself plus every inline child graph, each checked on its own:
 * an inline child has its own variables, so "the same variable" is only
 * meaningful within one graph.
 */
function graphsOf(
  graph: TemplateGraph,
  label: string,
): Array<{ label: string; graph: TemplateGraph }> {
  const found = [{ label, graph }];
  for (const [nodeId, node] of Object.entries(graph.nodes ?? {})) {
    const inline = node.workflowRef?.graph;
    if (node.workflowRef?.type === "inline" && inline) {
      found.push(...graphsOf(inline, `${label} › ${nodeId}`));
    }
  }
  return found;
}

/** Every rule this graph breaks, one readable line each. */
function modelProblems(label: string, graph: TemplateGraph): string[] {
  const problems: string[] = [];
  const variables = new Set<string>();

  for (const [nodeId, node] of Object.entries(graph.nodes ?? {})) {
    if (!node.activityType || !MODEL_STEPS.has(node.activityType)) continue;
    const where = `${label}: ${nodeId} (${node.activityType})`;

    if (node.parameters && "modelId" in node.parameters) {
      problems.push(`${where} has a model typed into its settings`);
    }
    const binding = node.inputs?.find((b) => b.port === "modelId");
    if (!binding) {
      problems.push(`${where} does not read the model from a variable`);
      continue;
    }
    if (!(binding.ctxKey in (graph.ctx ?? {}))) {
      problems.push(`${where} reads undeclared variable "${binding.ctxKey}"`);
    }
    variables.add(binding.ctxKey);
  }

  if (variables.size > 1) {
    problems.push(
      `${label}: OCR steps read different variables: ${[...variables].sort().join(", ")}`,
    );
  }
  return problems;
}

describe("shipped templates: OCR steps read one model", () => {
  const templates = loadTemplates();

  it("finds the shipped templates", () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it("binds every Prepare, Wait and Extract step to the same model variable", () => {
    const problems = templates.flatMap(({ fileName, graph }) =>
      graphsOf(graph, fileName).flatMap((g) => modelProblems(g.label, g.graph)),
    );
    expect(problems).toEqual([]);
  });

  it("checks the templates that carry a full Azure OCR chain", () => {
    // Guards against the rule passing vacuously: these templates submit a
    // file and then wait for and extract its result, so all three steps
    // must be present for the check above to mean anything.
    const withFullChain = templates
      .filter(({ graph }) => {
        const types = new Set(
          Object.values(graph.nodes ?? {}).map((n) => n.activityType),
        );
        return [...MODEL_STEPS].every((t) => types.has(t));
      })
      .map((t) => t.fileName);
    expect(withFullChain).toEqual(
      expect.arrayContaining([
        "standard-ocr-workflow.json",
        "standard-ocr-workflow-normalize.json",
        "standard-ocr-workflow-with-corrections.json",
        "standard-ocr-workflow-with-payment-lookup.json",
        "multi-page-report-workflow.json",
      ]),
    );
  });
});
