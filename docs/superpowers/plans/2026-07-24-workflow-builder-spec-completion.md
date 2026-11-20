# Workflow Builder Spec Completion — Discovery Plan (Phases 1–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a ranked, dispositioned gap register for workflow-builder Parts 3–9, discovered by four oracles that are independent of the implementation.

**Architecture:** Build one shared domain/surface inventory, then fan out four discovery subagents (B editor-obligations, D mutation/cascade, C static cross-product, A author-journeys) that emit machine-validated findings against a fixed schema. Merge by corroboration, rank, and gate every finding through an explicit fix/defer/won't-support decision.

**Tech Stack:** Node ESM scripts (`.mjs`), Node's built-in test runner (`node:test`) for the validator, markdown deliverables under `feature-docs/`, Claude subagents via the Agent tool.

> **Why `node:test` and not Vitest:** the repo root has no Vitest config (every config lives inside a workspace), and this repo has a standing rule against running installs. `node --test` needs neither — Node 24 ships it.

**Design doc:** [docs-md/workflow-builder/SPEC_COMPLETION_DESIGN.md](../../../docs-md/workflow-builder/SPEC_COMPLETION_DESIGN.md) (commit `84e9c10d`)

---

## Scope of this plan

This plan covers **Phases 1–5** of the design's execution sequence (§7): inventory → four passes → merge → disposition gate. It ends with an approved gap register.

**Phases 6–8 (write the spec, implement fixes, regenerate the test plan) are deliberately excluded.** Their content is the *output* of this plan — writing tasks for them now would mean inventing placeholder work. A second plan gets written against the approved register.

**Deliverable of this plan:** `feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md` — every finding ranked, with an approved disposition.

---

## File Structure

| File | Responsibility |
|---|---|
| `feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md` | Shared vocabulary: artifacts, surfaces, dependency edges, state enums. Authoritative naming for all four passes. |
| `feature-docs/20260724-workflow-builder-spec-completion/BRIEF-{A,B,C,D}.md` | The exact prompt handed to each discovery subagent. Kept as files so a pass can be re-run reproducibly. |
| `feature-docs/20260724-workflow-builder-spec-completion/findings-{a,b,c,d}.json` | Machine-validated findings, one array per pass. |
| `feature-docs/20260724-workflow-builder-spec-completion/notes-{a,b,c,d}.md` | Each pass's narrative — reasoning, coverage claims, what it could not check. |
| `feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md` | Pass A's goal-first journeys. Drafted, then red-penned by Alex before A runs. |
| `feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md` | Merged, deduped, corroboration-ranked findings with approved dispositions. |
| `scripts/validate-gap-findings.mjs` | Validates findings files against the schema and checks every `evidence` file:line resolves. |
| `scripts/validate-gap-findings.test.mjs` | `node:test` spec for the validator. |

---

## Task 1: Findings schema validator

Agents reliably emit malformed findings and cite file:line locations that do not exist. Validating this mechanically is cheaper than catching it during review of four documents.

**Files:**
- Create: `scripts/validate-gap-findings.mjs`
- Test: `scripts/validate-gap-findings.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/validate-gap-findings.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFindings } from "./validate-gap-findings.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT_PATH = new URL("./validate-gap-findings.mjs", import.meta.url).pathname;

const VALID = {
  id: "B-001",
  pass: "B",
  title: "No canvas-level undo/redo",
  severity: "major",
  type: "design-gap",
  evidence: "apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx:45",
  surfaces: ["canvas"],
  disposition: "fix",
  rationale: "Deletion cascades with no recovery path.",
};

const check = (findings) => validateFindings(findings, { repoRoot: REPO_ROOT }).errors;

describe("validateFindings", () => {
  it("accepts a well-formed finding whose evidence resolves", () => {
    assert.deepEqual(check([VALID]), []);
  });

  it("rejects a missing required field", () => {
    const { rationale, ...missing } = VALID;
    const errors = check([missing]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /rationale/);
  });

  it("rejects an out-of-vocabulary enum value", () => {
    const errors = check([{ ...VALID, severity: "catastrophic" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /severity/);
  });

  it("rejects evidence pointing at a file that does not exist", () => {
    const errors = check([{ ...VALID, evidence: "apps/frontend/src/does-not-exist.tsx:12" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does-not-exist/);
  });

  it("rejects evidence pointing past the end of a real file", () => {
    const errors = check([{ ...VALID, evidence: "package.json:999999" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /999999/);
  });

  it("accepts prose evidence that is not a file reference", () => {
    const errors = check([
      { ...VALID, evidence: "Repro: open the map demo, drag the exit node right by 400px." },
    ]);
    assert.deepEqual(errors, []);
  });

  it("rejects duplicate ids", () => {
    const errors = check([VALID, VALID]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /duplicate/);
  });

  it("rejects an explicit null in a required field", () => {
    const errors = check([{ ...VALID, rationale: null }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /rationale/);
  });

  it("rejects a citation one line past true EOF (trailing-newline off-by-one)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gap-findings-eof-"));
    const fixture = join(dir, "eof-fixture.txt");
    writeFileSync(fixture, "line1\nline2\nline3\n");

    const errors = check([{ ...VALID, evidence: `${fixture}:4` }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /4/);
  });

  it("rejects line 0 (files are 1-indexed)", () => {
    const errors = check([{ ...VALID, evidence: "package.json:0" }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /0/);
  });

  it("accepts line 1 of a real file (guards against over-correcting)", () => {
    const errors = check([{ ...VALID, evidence: "package.json:1" }]);
    assert.deepEqual(errors, []);
  });
});

describe("validate-gap-findings CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "gap-findings-cli-"));

  const runCli = (args) =>
    spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: "utf8" });

  it("reports a missing file cleanly and exits 1", () => {
    const missing = join(dir, "does-not-exist.json");
    const result = runCli([missing]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot read/);
  });

  it("reports invalid JSON cleanly and exits 1", () => {
    const badJson = join(dir, "invalid.json");
    writeFileSync(badJson, "{ not valid json");
    const result = runCli([badJson]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid JSON/);
  });

  it("reports a non-array JSON payload cleanly and exits 1", () => {
    const notArray = join(dir, "not-array.json");
    writeFileSync(notArray, JSON.stringify({}));
    const result = runCli([notArray]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected a JSON array/);
  });

  it("continues past a malformed file to validate the rest of the batch", () => {
    const badJson = join(dir, "batch-bad.json");
    const clean = join(dir, "batch-clean.json");
    writeFileSync(badJson, "{ not valid json");
    writeFileSync(clean, JSON.stringify([VALID]));

    const result = runCli([badJson, clean]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid JSON/);
    assert.match(result.stdout, new RegExp(`${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*clean`));
  });

  it("exits 2 with a usage message when called with no arguments", () => {
    const result = runCli([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/validate-gap-findings.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/validate-gap-findings.mjs`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/validate-gap-findings.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = [
  "id",
  "pass",
  "title",
  "severity",
  "type",
  "evidence",
  "surfaces",
  "disposition",
  "rationale",
];

const ENUMS = {
  pass: ["A", "B", "C", "D"],
  severity: ["blocker", "major", "minor"],
  type: ["design-gap", "impl-gap", "non-goal"],
  disposition: ["fix", "defer", "won't-support"],
};

// "path/to/file.ts:123" — a file reference. Anything else is prose evidence.
const FILE_REF = /^([\w./@-]+\.[a-z]{2,5}):(\d+)$/;

/**
 * Validates an array of gap findings against the shared schema (design §4.5)
 * and checks that every file:line evidence citation actually resolves.
 *
 * @param {object[]} findings
 * @param {{ repoRoot: string }} opts
 * @returns {{ errors: string[] }}
 */
export function validateFindings(findings, { repoRoot }) {
  if (!Array.isArray(findings)) {
    throw new TypeError("validateFindings: findings must be an array");
  }

  const errors = [];
  const seen = new Set();

  for (const [index, finding] of findings.entries()) {
    const label = finding?.id ?? `#${index}`;

    for (const field of REQUIRED) {
      const value = finding?.[field];
      if (value === undefined || value === null || value === "") {
        errors.push(`${label}: missing required field "${field}"`);
      }
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      const value = finding?.[field];
      if (value !== undefined && !allowed.includes(value)) {
        errors.push(
          `${label}: "${field}" must be one of ${allowed.join(", ")} — got "${value}"`,
        );
      }
    }

    if (finding?.surfaces !== undefined && !Array.isArray(finding.surfaces)) {
      errors.push(`${label}: "surfaces" must be an array`);
    }

    if (finding?.id !== undefined) {
      if (seen.has(finding.id)) errors.push(`${label}: duplicate id`);
      seen.add(finding.id);
    }

    const match = FILE_REF.exec(finding?.evidence ?? "");
    if (match) {
      const [, path, lineText] = match;
      const absolute = resolve(repoRoot, path);
      if (!existsSync(absolute)) {
        errors.push(`${label}: evidence file does not exist — ${path}`);
      } else {
        const content = readFileSync(absolute, "utf8");
        const lineCount = content.replace(/\n$/, "").split("\n").length;
        const line = Number(lineText);
        if (line < 1) {
          errors.push(
            `${label}: evidence line ${lineText} is out of range for ${path} (lines are 1-indexed)`,
          );
        } else if (line > lineCount) {
          errors.push(
            `${label}: evidence line ${lineText} is past end of ${path} (${lineCount} lines)`,
          );
        }
      }
    }
  }

  return { errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/validate-gap-findings.test.mjs`
Expected: PASS — `# pass 16` / `# fail 0`

- [ ] **Step 5: Add the CLI entry point**

Append to `scripts/validate-gap-findings.mjs`:

```javascript
// "object" | "null" | "number" | ... — mirrors typeof but calls out null explicitly,
// since typeof null === "object" would be a confusing error message.
function describeType(value) {
  return value === null ? "null" : typeof value;
}

// CLI: node scripts/validate-gap-findings.mjs <findings.json> [...]
if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node scripts/validate-gap-findings.mjs <findings.json> [...]");
    process.exit(2);
  }

  let failed = false;
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (error) {
      failed = true;
      console.error(`${file} — cannot read: ${error.message}`);
      continue;
    }

    let findings;
    try {
      findings = JSON.parse(raw);
    } catch (error) {
      failed = true;
      console.error(`${file} — invalid JSON: ${error.message}`);
      continue;
    }

    if (!Array.isArray(findings)) {
      failed = true;
      console.error(`${file} — expected a JSON array of findings, got ${describeType(findings)}`);
      continue;
    }

    const { errors } = validateFindings(findings, { repoRoot: process.cwd() });
    if (errors.length > 0) {
      failed = true;
      console.error(`\n${file} — ${errors.length} problem(s):`);
      for (const error of errors) console.error(`  ${error}`);
    } else {
      console.log(`${file} — ${findings.length} finding(s), clean`);
    }
  }
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 6: Verify the CLI runs clean on an empty array**

```bash
mkdir -p feature-docs/20260724-workflow-builder-spec-completion
echo '[]' > /tmp/empty-findings.json
node scripts/validate-gap-findings.mjs /tmp/empty-findings.json
```

Expected: `/tmp/empty-findings.json — 0 finding(s), clean` and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-gap-findings.mjs scripts/validate-gap-findings.test.mjs
git commit -m "test(workflow-builder): findings-schema validator for the gap-discovery passes"
```

---

## Task 2: Domain & surface inventory

The shared vocabulary all four passes cite. Built in one pass by one worker so naming stays consistent — four agents inventing their own terms produce findings that cannot be merged.

**Files:**
- Create: `feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md`

**Sources to read (all confirmed to exist):**

| What | Where |
|---|---|
| `NodeType` union (8 values), `PortBinding`, `GraphValidationError`, `NodeStatusValue` | `packages/graph-workflow/src/types.ts:152`, `:172`, `:420`, `:430` |
| Kind registry and family tree | `packages/graph-workflow/src/kinds/index.ts`, `packages/graph-workflow/src/types/artifact-registry.ts`, `types/kind-schemas.ts` |
| Activity + source catalogs | `packages/graph-workflow/src/catalog/` |
| Auto-wire resolution states | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts`, `resolver.ts` |
| Frontend surfaces (77 components) | `apps/frontend/src/features/workflow-builder/` |
| Run-status rendering | `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx` |
| Preview states | `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` |
| Validation surfacing | `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts`, `map-body-validation.ts` |

- [ ] **Step 1: Enumerate artifacts**

Write the **Artifacts** section. One row per authored object with its defining type and source location. Must cover: the 8 node types, ports, kinds and their `baseKind` family tree, `PortBinding`, ctx keys, the three edge flavours (normal / conditional / error), groups and their `exposedParams`, workflows, versions, runs, and activity-output cache rows.

- [ ] **Step 2: Enumerate surfaces**

Write the **Surfaces** section. Every UI surface in Parts 3–9 that renders or edits an artifact, with its component path and a stable short name (`canvas`, `node-card`, `settings-panel:map`, `variable-picker`, `validation-drawer`, `preview-widget`, `run-drawer`, `wire-menu`, …). These short names are what findings put in their `surfaces` array.

- [ ] **Step 3: Enumerate dependency edges**

Write the **Dependency edges** section — a table of `upstream artifact → downstream artifact` for every dependency in the model. This is Pass D's direct input. Cover at minimum: node→binding, binding→ctx key, ctx key→condition ref, group→member, group→exposedParam, catalog port kind→binding, map→join `resultsCtxKey`, version→childWorkflow reference, run→cache row, dynamic-node slug→node type.

- [ ] **Step 4: Enumerate state sources**

Write the **State sources** section — every enum a surface can render, with its exact members and where they are defined. This is Pass C's direct input. Confirmed so far:

- `NodeStatusValue` = `pending | running | completed | failed | skipped` (`types.ts:430`)
- `GraphValidationError.severity` = `error | warning` (`types.ts:423`)

**Record any surface that renders states not present in a backing enum.** The `PreviewWidget` work in `fbc6c2dd` referenced `not-reached` and `branch-not-taken`, which are absent from `NodeStatusValue` — derived frontend states with no backing type are exactly the kind of drift the inventory must expose.

- [ ] **Step 5: Verify every path cited resolves**

```bash
grep -oE '`[a-zA-Z0-9_/.@-]+\.(ts|tsx|mjs|json)(:[0-9]+)?`' \
  feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md \
  | tr -d '`' | cut -d: -f1 | sort -u \
  | while read -r p; do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md
git commit -m "docs(workflow-builder): domain & surface inventory for the gap-discovery passes"
```

---

## Task 3: Write the four pass briefs

Briefs live as files so any pass can be re-run reproducibly, and so a pass that returns weak findings can be diagnosed against its prompt rather than guessed at.

**Files:**
- Create: `feature-docs/20260724-workflow-builder-spec-completion/BRIEF-B.md`
- Create: `feature-docs/20260724-workflow-builder-spec-completion/BRIEF-D.md`
- Create: `feature-docs/20260724-workflow-builder-spec-completion/BRIEF-C.md`
- Create: `feature-docs/20260724-workflow-builder-spec-completion/BRIEF-A.md`

- [ ] **Step 1: Write the shared preamble**

Every brief opens with this block verbatim (substituting the pass letter):

```markdown
## Standing rules for this pass

- **Scope:** workflow-builder MANUAL_TEST_PLAN Parts 3–9 only (canvas, control-flow
  forms, typed I/O, auto-wire, port wiring, try-in-place/previews). Parts 10–16 are
  out of scope.
- **Discovery only.** Do not modify any source file. Do not fix anything you find.
- **Cite the inventory.** Use the short surface names from
  `feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md`. Do not
  invent names for artifacts or surfaces.
- **Do not read the other passes' outputs.** Independence is the point; overlap
  between passes is a priority signal and is handled at merge.
- **`MANUAL_TEST_PLAN.md` is not an oracle.** It was written from the implementation.
  Something being absent from it is not evidence the behaviour is correct or
  intentional — it is often evidence of exactly the gap you are looking for.
- **Evidence must be real.** Every `evidence` value is either `path/to/file.ts:123`
  that actually resolves, or concrete reproduction steps. Invented citations fail
  the validator.
- **Deliverables:**
  - `feature-docs/20260724-workflow-builder-spec-completion/findings-<letter>.json`
    — a JSON array conforming to the schema below.
  - `feature-docs/20260724-workflow-builder-spec-completion/notes-<letter>.md`
    — your narrative: what you covered, your reasoning on judgement calls, and an
    explicit list of what you could **not** check and why.
- **Self-check before finishing:**
  `node scripts/validate-gap-findings.mjs feature-docs/20260724-workflow-builder-spec-completion/findings-<letter>.json`
  must exit 0.

## Finding schema

```json
{
  "id": "<LETTER>-001",
  "pass": "<LETTER>",
  "title": "one line",
  "severity": "blocker | major | minor",
  "type": "design-gap | impl-gap | non-goal",
  "evidence": "path/to/file.ts:123  OR  concrete reproduction steps",
  "surfaces": ["short-name-from-inventory"],
  "disposition": "fix | defer | won't-support",
  "rationale": "why that disposition"
}
```

`design-gap` = the capability or behaviour was never specified.
`impl-gap` = it was specified and the implementation does not match.
`non-goal` = it is genuinely out of scope and should be recorded as a deliberate
decision so it stops being rediscovered.
```

- [ ] **Step 2: Write BRIEF-B (editor-environment obligations)**

Body after the preamble:

```markdown
## Your task

The workflow builder is a programming environment. Programming environments carry a
known duty roster. Audit every Parts 3–9 surface against it and report what is
missing and reasonably expected.

Roster — for each, report **present / partial / absent** with evidence:

1. CRUD on every artifact (create, read, update, delete)
2. Undo / redo
3. Duplicate a node or a selection
4. Copy / paste, including across workflows
5. Multi-select operations (move, delete, group, align)
6. Find & navigate — locating a node in a large graph
7. Refactor — rename, extract to sub-workflow, inline a sub-workflow
8. Inspect & debug — seeing intermediate values, understanding why a node did not run
9. Error recovery — undoing a destructive action, recovering from a failed save
10. Diff & compare — what changed between two versions
11. Concurrent editing — two tabs, or two people, on one workflow
12. Keyboard access — can the graph be authored without a mouse

Three holes are already confirmed and should appear in your findings with fuller
evidence than the probe that found them:

- No canvas-level undo/redo. The only `undo|redo` matches under
  `apps/frontend/src/features/workflow-builder/` are inside
  `settings/rich-widgets/ConfusionMapEditor.tsx` and
  `settings/control-flow/ChildWorkflowNodeSettings.tsx`.
- No node duplicate / copy / paste.
- No find-a-node.

Node deletion **does** exist and cascades — `canvas/NodeContextMenu.tsx` (context
menu + keyboard). Assess what that means with no undo behind it.

**Judgement standard:** "absent" is only a finding when a competent author would
reasonably expect it in a graph editor of this ambition. Not every roster item
applies — say so explicitly and mark it `non-goal` with your reasoning rather than
silently dropping it.
```

- [ ] **Step 3: Write BRIEF-D (mutation & cascade)**

Body after the preamble:

```markdown
## Your task

You own the **change/delete axis** of the domain model. For every dependency edge in
the INVENTORY's "Dependency edges" table, determine what actually happens when the
upstream artifact mutates or disappears.

For each edge, establish and report:

- What the code does today (cite it).
- Whether that behaviour is specified anywhere in `docs-md/workflow-builder/`.
- Whether the author is told it happened.
- Whether there is any recovery path.

A finding is any edge where behaviour is **undefined**, **silently destructive**, or
**leaves the graph invalid with no recovery**.

Start from these, then work the full inventory table:

- Delete a node that other nodes bind to — what happens to their bindings?
- Swap a node's activity type while bindings are live (`replace-node.ts`).
- Rename a ctx key (`settings/rename-ctx-key.ts`) — do all consumers follow,
  including condition refs and `outputs[]` materialisations?
- Remove a group member that an `exposedParam` references.
- Change a port's kind in the catalog while workflows bind to it.
- Delete a workflow version referenced by a `childWorkflow` node.
- Delete or edit a node whose output is in the activity-output cache.
- Delete a `map` node that a downstream `join` names as its source map.

This class is live and under-explored: the `exposedParams` pruning fix and the
dynamic-node slug tombstone were both cascade findings discovered one at a time, in
production use, months apart.
```

- [ ] **Step 4: Write BRIEF-C (static domain cross-product)**

Body after the preamble:

```markdown
## Your task

Enumerate the static cross-product of the domain model and mark every cell
**specified / unspecified / won't-support**.

**You do NOT own the mutation axis** — change and delete behaviour belongs to Pass D.
Anything about an artifact changing or disappearing is out of your scope. Report
static cells only.

Axes, from the INVENTORY's "State sources" section:

1. **Control-flow nesting** — every meaningful combination of the 6 control-flow node
   types nested inside one another. `map` containing `switch`; `switch` inside `map`
   inside `map`; `join` whose source map is inside a `switch` branch; `pollUntil`
   inside a `map` body; `humanGate` inside a branch that may not execute.
2. **Port kind × binding state** — each kind family against bound / unbound /
   ambiguous / locked / pinned.
3. **Run status × surface** — every member of `NodeStatusValue`
   (`pending | running | completed | failed | skipped`, `packages/graph-workflow/src/types.ts:430`)
   against every surface that renders run state. **Include any derived frontend state
   the INVENTORY flagged as having no backing enum member** — those cells are the
   most likely to be unspecified.
4. **Validation severity × anchor target** — `error | warning`
   (`packages/graph-workflow/src/types.ts:423`) against every anchor path shape the
   drawer can deep-link to.

Output the grid in `notes-c.md`. Emit a **finding** for every `unspecified` cell and
for every `won't-support` cell.

**The `won't-support` cells are a first-class deliverable**, not leftovers. Written
down, they become the non-goals register and stop the same non-decision being
rediscovered months apart. Give each one a real rationale.

This is the highest-volume, lowest-density pass. Prefer a complete grid with terse
cells over a partial grid with essays.
```

- [ ] **Step 5: Write BRIEF-A (author journeys)**

Body after the preamble:

```markdown
## Your task

Walk each journey in
`feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md` against the
implementation, in order, as an author who has read the product's own documentation
and nothing else.

For each step of each journey, establish:

- Can it be done at all?
- Would a competent author **discover** how, without reading source or asking someone?
- How many steps does it take versus how many it should?
- Does anything along the way destroy work already done?

A finding is any **wall** (cannot be done) and any **unguessable step** (can be done,
but only by someone who already knows).

Weight discoverability heavily. A control that exists but cannot be found is a gap,
not a success — the humanGate signal-name field was a free-text input with no way to
know what to type, and it shipped that way because everyone testing it already knew
the answer.

Record where in the journey each finding occurred; that ordering is what makes these
journeys reusable as e2e acceptance scenarios later.

**Do not fix the journeys.** If a journey is wrong about the product, that is itself
worth reporting in `notes-a.md` — but the journeys were written and corrected
deliberately before you ran, so treat them as the requirement.
```

- [ ] **Step 6: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/BRIEF-*.md
git commit -m "docs(workflow-builder): discovery briefs for the four gap-finding passes"
```

---

## Task 4: Draft the author journeys for red-pen

Pass A is worthless if its journeys are invented. They get drafted from observable real workloads, then corrected by Alex before A runs.

**Files:**
- Create: `feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md`

**Source material for realistic workloads:**
- `docs-md/OCR_FAILURE_HANDLING.md` — encrypted-PDF rejection, the stuck-document incident
- `docs-md/HITL_ARCHITECTURE.md` — human review routing
- `docs-md/graph-workflows/templates/multi-page-report-workflow.json` — the 16-node keyword-split exemplar
- `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` — what real seeded workflows do

- [ ] **Step 1: Draft 6–8 journeys**

Each journey is written **goal-first, before consulting the builder UI**, in this shape:

```markdown
### J1 — <goal in the author's words>

**Author:** <who they are, what they already know>
**Starting point:** <what they have — files, an existing workflow, nothing>
**Goal:** <what "done" means to them, in outcome terms not UI terms>

**Steps they expect to take:**
1. …
2. …

**What "done" looks like:** <observable end state>
```

Cover at minimum these shapes, drawn from real workloads:

- A batch of mixed PDFs where **some are encrypted and will fail** — the author needs
  to find out which, and why, without the run silently stalling.
- **Keyword-based splitting** of a multi-page report into sections, then per-section
  processing.
- **Per-page OCR** with a fan-out and a collected result.
- **Classification** followed by **routing on confidence**, with low-confidence
  documents going to human review.
- **Iterating on an existing workflow** someone else built — understanding it before
  changing it.
- **Debugging a run that produced the wrong output** — finding which node did it.

Write in outcome terms. "The author needs to know which documents failed and why" — not
"the author opens the validation drawer." The moment a journey describes UI, it has
stopped being an independent oracle.

- [ ] **Step 2: Verify the journeys contain no UI vocabulary**

```bash
grep -inE '\b(drawer|badge|panel|palette|canvas|click|button|dropdown|toggle|modal)\b' \
  feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md
```

Expected: no output. Any hit means that journey was written from the implementation and must be rewritten in outcome terms.

- [ ] **Step 3: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md
git commit -m "docs(workflow-builder): draft author journeys for pass A red-pen"
```

- [ ] **Step 4: STOP — hand to Alex for red-pen**

Present the journeys and ask for corrections. State plainly that un-corrected journeys are plausible fiction and that Pass A's output is only as good as this input.

**Do not launch Pass A until Alex has corrected or explicitly approved the journeys.**

---

## Task 5: Launch passes B, C, D in parallel

These three need no user input and can start as soon as Task 2 and Task 3 are committed. Launch all three in **one message** so they run concurrently.

**Files:**
- Create (by agents): `findings-{b,c,d}.json`, `notes-{b,c,d}.md`

- [ ] **Step 1: Dispatch the three subagents**

Use the Agent tool three times in a single message, `subagent_type: "general-purpose"`. Each prompt is:

```
Read feature-docs/20260724-workflow-builder-spec-completion/BRIEF-<LETTER>.md and
feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md, then execute
the brief exactly as written.

Write your two deliverables to the paths the brief names. Before finishing, run
the validator the brief specifies and fix anything it reports.

Your final message should be a summary for the orchestrator: how many findings by
severity, the two or three most consequential ones, and anything you could not check.
```

- [ ] **Step 2: Validate each pass's output as it lands**

```bash
node scripts/validate-gap-findings.mjs \
  feature-docs/20260724-workflow-builder-spec-completion/findings-b.json \
  feature-docs/20260724-workflow-builder-spec-completion/findings-c.json \
  feature-docs/20260724-workflow-builder-spec-completion/findings-d.json
```

Expected: exit 0, one clean line per file.

If a pass fails validation, send it back via SendMessage with the validator output rather than fixing its findings yourself — a pass that cites evidence it cannot substantiate has a reasoning problem, not a formatting problem, and patching the JSON hides that.

- [ ] **Step 3: Spot-check evidence quality**

The validator proves citations *resolve*; it cannot prove they *support the claim*. Pick the two highest-severity findings from each pass and read the cited code yourself. A pass whose top findings do not survive this check should be re-run with a sharper brief.

- [ ] **Step 4: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/findings-{b,c,d}.json \
        feature-docs/20260724-workflow-builder-spec-completion/notes-{b,c,d}.md
git commit -m "docs(workflow-builder): gap findings from passes B, C, D"
```

---

## Task 6: Launch pass A

**Prerequisite: Task 4 Step 4 complete — Alex has corrected the journeys.**

**Files:**
- Create (by agent): `findings-a.json`, `notes-a.md`

- [ ] **Step 1: Dispatch the subagent**

Agent tool, `subagent_type: "general-purpose"`:

```
Read feature-docs/20260724-workflow-builder-spec-completion/BRIEF-A.md,
feature-docs/20260724-workflow-builder-spec-completion/INVENTORY.md, and
feature-docs/20260724-workflow-builder-spec-completion/JOURNEYS.md, then execute
the brief exactly as written.

Write your two deliverables to the paths the brief names. Before finishing, run
the validator the brief specifies and fix anything it reports.

Your final message should be a summary for the orchestrator: how many findings by
severity, which journeys hit walls, and anything you could not check.
```

- [ ] **Step 2: Validate**

```bash
node scripts/validate-gap-findings.mjs \
  feature-docs/20260724-workflow-builder-spec-completion/findings-a.json
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/findings-a.json \
        feature-docs/20260724-workflow-builder-spec-completion/notes-a.md
git commit -m "docs(workflow-builder): gap findings from pass A (author journeys)"
```

---

## Task 7: Merge, dedupe, and rank

**Files:**
- Create: `feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md`

- [ ] **Step 1: Merge all four findings files**

Read all four `findings-*.json`. Group findings that describe the same underlying gap, even where the passes worded them differently — B's "no undo behind a cascading delete" and D's "deleting a bound node silently drops consumer bindings with no recovery" are one gap seen from two angles.

Each merged entry records **which passes found it**.

- [ ] **Step 2: Rank**

Sort by, in order:

1. **Corroboration** — how many independent passes found it. This is the strongest priority signal available, because the passes cannot see each other's output.
2. **Severity** — `blocker` > `major` > `minor`.
3. **Breadth** — number of distinct surfaces in the union of `surfaces`.

- [ ] **Step 3: Write the register**

```markdown
# Workflow Builder — Gap Register

Merged output of the four discovery passes (design §4). Ranked by corroboration,
then severity, then breadth.

**Source:** `findings-{a,b,c,d}.json` · **Scope:** Parts 3–9

## Summary

| Passes | Findings | Blocker | Major | Minor |
|---|---|---|---|---|
| A | n | n | n | n |
| B | n | n | n | n |
| C | n | n | n | n |
| D | n | n | n | n |
| **Merged** | **n** | **n** | **n** | **n** |

## Findings

### G-001 — <title>

**Found by:** B, D (2 passes) · **Severity:** major · **Type:** design-gap
**Surfaces:** canvas, node-card
**Evidence:** …
**Proposed disposition:** fix
**Rationale:** …

…
```

- [ ] **Step 4: Sanity-check the merge**

```bash
# Every finding id from every pass must appear somewhere in the register.
for f in feature-docs/20260724-workflow-builder-spec-completion/findings-*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8')).forEach(x=>console.log(x.id))"
done | sort -u | while read -r id; do
  grep -q "$id" feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md \
    || echo "DROPPED IN MERGE: $id"
done
```

Expected: no output. A dropped finding is a merge bug, not a judgement call.

- [ ] **Step 5: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md
git commit -m "docs(workflow-builder): merged gap register, ranked by corroboration"
```

---

## Task 8: Disposition gate

Without this gate the effort has no natural end. The passes will find more than is worth building.

- [ ] **Step 1: Present the register to Alex**

Lead with the corroborated findings — those found independently by two or more passes. Present proposed dispositions as recommendations, not decisions.

Be explicit about which findings are **capability-level design gaps** (undo, duplicate, find) versus **implementation gaps**. The first group is where the effort could balloon, and it is Alex's call whether the builder takes on that scope now.

- [ ] **Step 2: Record the approved dispositions**

Update every finding's `disposition` in `GAP_REGISTER.md` to Alex's decision, and record the rationale for anything downgraded from the recommendation. A `won't-support` with a reason is a deliverable; a `won't-support` with no reason will be rediscovered in three months.

- [ ] **Step 3: Commit**

```bash
git add feature-docs/20260724-workflow-builder-spec-completion/GAP_REGISTER.md
git commit -m "docs(workflow-builder): approved dispositions on the gap register"
```

- [ ] **Step 4: Hand off to the implementation plan**

Discovery is complete. Write the Phase 6–8 plan (spec artifacts, implementation + tests, regenerated manual test plan) against the approved `fix` set, using the writing-plans skill.

---

## Notes for the executing engineer

**This is a discovery plan, not a feature build.** Only Task 1 is TDD in the usual sense, because only the validator is code. The other tasks produce documents, and their verification steps are real checks — path resolution, vocabulary greps, merge completeness — not ceremony. Run them.

**The passes must not see each other.** Independence is the entire mechanism by which corroboration means anything. If you find yourself tempted to give Pass C a hint from Pass D's output, you have destroyed the priority signal for both.

**`MANUAL_TEST_PLAN.md` is not an oracle in this effort.** It was derived from the implementation. Do not use it to check whether a finding is real — that reasoning is circular and is precisely how the current gaps survived.

**Expect the passes to disagree with the existing design docs.** When a pass reports something the docs say works, that is a finding worth keeping, not an error to reconcile away. Verify it against the code, and let the register record the discrepancy.
