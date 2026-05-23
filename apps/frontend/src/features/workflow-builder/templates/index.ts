/**
 * Static bundle of workflow templates.
 *
 * Templates are JSON files in `docs-md/graph-workflows/templates/`. They
 * are not API-backed today — the picker reads them straight out of the
 * bundle, hydrates the editor's local state, and saves create a brand
 * new workflow record. To add a template, drop a new JSON file into the
 * directory; Vite's glob import picks it up on next build.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";

const templateModules = import.meta.glob<GraphWorkflowConfig>(
  "@docs/graph-workflows/templates/*.json",
  { eager: true, import: "default" },
);

export interface WorkflowTemplate {
  /** Filename stem — stable identifier across builds. */
  id: string;
  /** From config.metadata.name; falls back to id. */
  name: string;
  /** From config.metadata.description; may be empty. */
  description: string;
  /** From config.metadata.tags; may be empty. */
  tags: string[];
  /** Node count gives a quick sense of complexity. */
  nodeCount: number;
  /** The full graph config — fed into the editor as-is. */
  config: GraphWorkflowConfig;
}

function fileStem(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  return filename.replace(/\.json$/, "");
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = Object.entries(
  templateModules,
)
  .map(([path, config]): WorkflowTemplate => {
    const id = fileStem(path);
    return {
      id,
      name: config.metadata?.name ?? id,
      description: config.metadata?.description ?? "",
      tags: config.metadata?.tags ?? [],
      nodeCount: Object.keys(config.nodes ?? {}).length,
      config,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
