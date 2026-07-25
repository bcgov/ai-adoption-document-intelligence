/**
 * Regression floor for broken shipped content (G-019).
 *
 * A `childWorkflow` node's `workflowRef.workflowId` is a free-text string
 * inside a JSON column. No validator pass resolves it — cross-workflow
 * library resolution is explicitly out of the validator's scope — so a
 * template that names a workflow which does not exist saves clean, loads
 * clean, and validates green. It fails only when someone runs it.
 *
 * That is exactly what happened: all four childWorkflow nodes in
 * `multi-page-report-workflow.json` named `"standard-ocr-workflow"` — the
 * template's own FILENAME, not any identifier the runtime can resolve. The
 * seeded lineage is id `seed-workflow-standard-ocr`, name `Standard OCR
 * Workflow`, slug `standard-ocr`. The reference had never resolved, and
 * `MANUAL_TEST_PLAN` step 3.7 tells testers to load that very template.
 * At authoring time no lineage id exists yet, which is almost certainly
 * how the filename got used.
 *
 * This test is pure JSON inspection — no database, no network. It asserts
 * every shipped library reference names something the runtime can actually
 * resolve, so the class of defect cannot ship again.
 *
 * `getWorkflowGraphConfig` (apps/temporal/src/activities) resolves a ref in
 * this order:
 *   1. `WorkflowVersion.id`
 *   2. `WorkflowLineage.id`
 *   3. `WorkflowLineage.name`
 *
 * It does NOT resolve by slug. A template cannot know a version id or a
 * lineage id ahead of time — those are minted at seed/save time — so the
 * only identifier a template can portably name is the lineage NAME, which
 * the seeder takes verbatim from each template's `metadata.name`
 * (`apps/shared/prisma/seed.ts` → `seedLineageVersion`). Seeded lineage ids
 * are also accepted, since a ref may legitimately pin one.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "docs-md/graph-workflows/templates");
const SEED_FILE = path.join(REPO_ROOT, "apps/shared/prisma/seed.ts");

/**
 * Lineage ids minted by `apps/shared/prisma/seed.ts`. Mirrored here rather
 * than imported because the seed script is a standalone CLI entry point
 * that connects to Postgres on import. The final test in this file asserts
 * each id still appears in `seed.ts`, so this list cannot drift silently.
 */
const SEEDED_LINEAGE_IDS = [
  "seed-workflow-standard-ocr",
  "seed-workflow-standard-ocr-mistral",
  "seed-workflow-multi-page-report",
];

interface TemplateFile {
  fileName: string;
  config: Record<string, unknown>;
}

function loadTemplates(): TemplateFile[] {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((fileName) => ({
      fileName,
      config: JSON.parse(
        fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf-8"),
      ) as Record<string, unknown>,
    }));
}

/**
 * Every `{ type: "library", workflowId }` in a config, at any depth —
 * inline child graphs (`workflowRef.graph`) can nest them too. Mirrors
 * `collectLibraryWorkflowRefs` in `workflow.service.ts`, which is what the
 * delete-time guard uses; keeping the two walks equivalent means the
 * content this test blesses is the same content that guard protects.
 */
function collectLibraryRefs(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLibraryRefs(item, out);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "library" && typeof record.workflowId === "string") {
    out.push(record.workflowId);
  }
  for (const child of Object.values(record)) {
    collectLibraryRefs(child, out);
  }
}

function templateName(template: TemplateFile): string | undefined {
  const metadata = template.config.metadata as { name?: unknown } | undefined;
  return typeof metadata?.name === "string" ? metadata.name : undefined;
}

describe("shipped workflow templates — library references (G-019)", () => {
  const templates = loadTemplates();

  it("ships at least one template with a library reference (guard is live)", () => {
    // If this ever hits zero the suite below becomes vacuously true and
    // would stop protecting anything — fail loudly instead.
    const total = templates.flatMap((t) => {
      const refs: string[] = [];
      collectLibraryRefs(t.config, refs);
      return refs;
    });
    expect(total.length).toBeGreaterThan(0);
  });

  it("every library reference names a resolvable workflow", () => {
    const resolvable = new Set<string>(SEEDED_LINEAGE_IDS);
    for (const template of templates) {
      const name = templateName(template);
      if (name !== undefined) {
        resolvable.add(name);
      }
    }

    const unresolvable: string[] = [];
    for (const template of templates) {
      const refs: string[] = [];
      collectLibraryRefs(template.config, refs);
      for (const ref of refs) {
        if (!resolvable.has(ref)) {
          unresolvable.push(`${template.fileName} → "${ref}"`);
        }
      }
    }

    // A failure here means a shipped template references a workflow the
    // runtime cannot resolve. Fix the reference — do NOT widen
    // `getWorkflowGraphConfig` (e.g. to resolve slugs) to accommodate it.
    expect(unresolvable).toEqual([]);
  });

  it("does not reference a template by its FILENAME (the original defect)", () => {
    const fileStems = new Set(
      templates.map((t) => t.fileName.replace(/\.json$/, "")),
    );
    const names = new Set(
      templates.map(templateName).filter((n): n is string => n !== undefined),
    );

    const byFilename: string[] = [];
    for (const template of templates) {
      const refs: string[] = [];
      collectLibraryRefs(template.config, refs);
      for (const ref of refs) {
        // A filename stem that is not ALSO a legitimate lineage name is
        // the exact shape of the original bug.
        if (fileStems.has(ref) && !names.has(ref)) {
          byFilename.push(`${template.fileName} → "${ref}"`);
        }
      }
    }

    expect(byFilename).toEqual([]);
  });

  it("SEEDED_LINEAGE_IDS still matches apps/shared/prisma/seed.ts", () => {
    const seedSource = fs.readFileSync(SEED_FILE, "utf-8");
    for (const id of SEEDED_LINEAGE_IDS) {
      expect(seedSource).toContain(`"${id}"`);
    }
  });
});
