# Label Suggestions Bench (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only harness that scores label suggestions against a known answer key. It fills copies of public BC forms with made-up values, runs them through the platform's own upload and OCR, and scores:

- suggested labels word for word;
- suggested fields by value.

It first records a baseline for today's rule-based engine, then measures the new LLM engine.

**Architecture:**
- **Generator.** A TypeScript script, run with `tsx`, fills each fillable form with `pdf-lib` and flattens it. It writes an answer key per copy: each field's value and the rectangle it sits in.
- **Runner.** It drives the running backend over HTTP with an API key: it creates a template model per form, adds the answer-key fields, uploads the copies and waits for OCR.
- **Ground truth.** The OCR words whose centres fall inside each field's rectangle. When those words don't join back into the value, as with clipped text, the field is excluded.
- **Scoring.** The runner compares each suggestion with the ground truth.
- **Storage.** Everything downloaded or generated stays in a git-ignored `.cache/`.

**Tech Stack:** TypeScript on Node (`tsx` 4.22.4 at the repo root), `pdf-lib` 1.17.1, `dotenv`, Node's built-in `node:test`, and the platform's REST API.

**Spec:** `docs/superpowers/specs/2026-09-18-label-suggestions-design.md` §5.

**Scope of Part 1:** the generator, the loop 1 scoring of suggested labels and suggested fields, the baseline, and the read-only availability checks. **Part 2 gets its own plan after Part 1's first runs.** It covers:
- loop 2: training through the platform, plus the word-order and label-file-shape variant runs;
- the engine comparison with Content Understanding and Document Intelligence query fields.

Part 2 waits because its details depend on what Part 1 settles:
- which forms survive clipping checks;
- how long OCR takes;
- whether query fields return locations;
- which models are really available.

**Order of execution:**
1. Tasks 1–7 of this plan.
2. The product plan (`docs/superpowers/plans/2026-09-18-label-suggestions.md`).
3. Task 8 of this plan.

## Global Constraints

- **Branch and staging.** Work on `feature/label-drafting`, and stage only the paths a task lists. Never run `git add -A` or `git add .`: `docs-md/workflows/FEATURE_DEMO_GUIDE.md` has an unrelated uncommitted edit.
- **No installs.** Never run `npm install`, `npm ci` or any other installer. `tsx`, `pdf-lib`, `dotenv` and `@types/node` are already at the repo root.
- **Never commit downloaded or generated data.** The repo is public, and the forms are © Province of British Columbia (internal use only). Everything goes in `apps/backend-services/scripts/label-suggestions-bench/.cache/`, which its own `.gitignore` ignores.
- **Secrets.** The bench reads `BENCH_API_KEY` (falling back to `TEST_API_KEY`) from the environment or the repo's `.env` files, and never prints it. Never open `.env` files directly.
- **Defaults.**
  - Backend: `BENCH_BACKEND_URL` = `http://localhost:3002`.
  - Group: `BENCH_GROUP_ID` = `seeddefaultgroup`. An API key cannot look up its own group, so the id comes from settings.
- **API limits.** Keep at least 700 ms between API requests: the backend's global limit is 100 requests per 60 s. Poll OCR no more than every 10 s.
- **Code rules.** No `any` types, and no placeholders.
- **Running.**
  - Tests: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/*.test.ts`.
  - Type-check: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json`.
  - Commands: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts <command>`.
- **Commits** end with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold, settings and API client

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/README.md`
- Create: `apps/backend-services/scripts/label-suggestions-bench/tsconfig.json`
- Create: `apps/backend-services/scripts/label-suggestions-bench/.cache/.gitignore`
- Create: `apps/backend-services/scripts/label-suggestions-bench/forms.json`
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/config.ts`
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/api.ts`
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/cli.ts`
- Test: `apps/backend-services/scripts/label-suggestions-bench/src/config.test.ts`

**Interfaces:**
- Produces, from `config.ts`:
  - `BENCH_DIR`, `CACHE_DIR` and `FORMS_FILE`.
  - `interface BenchForm { id; title; url; pages }` and `readForms(): BenchForm[]`.
  - `interface BenchSettings { backendUrl; apiKey; groupId }` and `readSettings(env?: NodeJS.ProcessEnv): BenchSettings`.
- Produces, from `api.ts`: `class BenchApi` with
  - `listTemplateModels()`, `createTemplateModel(name)`, `addField(modelId, field)`;
  - `uploadDocument(modelId, title, originalFilename, pdf)`, `listDocuments(modelId)`;
  - `suggestLabels(modelId, documentId)`, `suggestFields(modelId, documentId)`.
- Produces the types `BenchDocument`, `BenchLabelSuggestion` and `BenchSuggestedField`.

- [ ] **Step 1: Create the folder files**

Create `apps/backend-services/scripts/label-suggestions-bench/.cache/.gitignore`:

```
*
!.gitignore
```

Create `apps/backend-services/scripts/label-suggestions-bench/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `apps/backend-services/scripts/label-suggestions-bench/forms.json`. Each form was checked on 2026-09-19: it is an AcroForm with no XFA, not encrypted, has no rotated pages, and has a MediaBox origin of 0,0.

```json
[
  { "id": "bc-family-trial-readiness", "title": "Trial Readiness Statement (Form 22, Provincial Court Family Rules)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/family/pfa735.pdf", "pages": 4 },
  { "id": "bc-family-income-expenses", "title": "Statement of Income and Expenses (PFA 822)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/family/pfa822.pdf", "pages": 3 },
  { "id": "bc-family-order-general", "title": "Order - General (Form 44, Provincial Court Family Rules)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/family/pfa719.pdf", "pages": 1 },
  { "id": "bc-smallclaims-offence-act-certificate", "title": "Certificate (Section 82(6) Offence Act) (SCL804)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/small-claims/scl804.pdf", "pages": 2 },
  { "id": "bc-smallclaims-offer-to-settle", "title": "Offer to Settle (Form 18, SCL 803)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/small-claims/scl803.pdf", "pages": 2 },
  { "id": "bc-smallclaims-cancel-default-affidavit", "title": "Affidavit to Cancel a Dismissal or Default Order (SCL 020)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/small-claims/scl020.pdf", "pages": 1 },
  { "id": "bc-criminal-remote-attendance", "title": "Request for Remote Attendance by the Accused/Young Person (PCR968)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/criminal/pcr968.pdf", "pages": 1 },
  { "id": "bc-criminal-publication-ban", "title": "Application to Vary or Revoke Publication Ban Under Section 486.51 (PCR318)", "url": "https://www2.gov.bc.ca/assets/gov/law-crime-and-justice/courthouse-services/court-files-records/court-forms/criminal/pcr318.pdf", "pages": 3 },
  { "id": "bc-rtb-9-proof-of-service", "title": "Proof of Service Notice of Expedited Hearing (RTB-9)", "url": "https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/rtb9.pdf", "pages": 2 },
  { "id": "bc-rtb-59-exempt-publication", "title": "Application to Exempt Monetary Order from Publication (RTB-59)", "url": "https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/rtb59.pdf", "pages": 2 }
]
```

Create `apps/backend-services/scripts/label-suggestions-bench/README.md`:

````markdown
# Label suggestions bench

A dev-only harness that scores the platform's label suggestions against a known answer key. It never ships.

## What it does

1. **download**: fetches the public fillable BC forms listed in `forms.json` into `.cache/forms/`.
2. **generate**: fills each form N times with made-up values, flattens it into a plain PDF, and writes `.cache/copies/<form>/copy-<n>.pdf` with an answer key, `copy-<n>.answers.json`, holding each field's value and the rectangle it sits in.
3. **run-labels**: for each form, creates a template model with the answer-key fields, uploads the copies through the platform (so its real OCR runs), asks for suggested labels on every copy, and scores them against the ground truth. The ground truth is the OCR words whose centres fall inside each field's rectangle. The report goes to `.cache/runs/<name>/labels-report.md` and `.json`.
4. **run-fields**: uploads copy 1 of each form into an empty template model, asks for suggested fields, and scores them by value. The report goes to `.cache/runs/<name>/fields-report.md` and `.json`.

## Scores

- **Suggested labels**, per field on each copy:
  - **exact**: the suggested words are exactly the ground truth;
  - **partial**: they overlap it;
  - **wrong**: no overlap;
  - **missed**: no suggestion.

  A field is **unverifiable**, and left out, when its OCR words don't join back into the value (clipped or split text). Radio groups and dropdowns are filled but not scored.
- **Suggested fields**:
  - text fields found: answer-key values that some suggested field's value matches;
  - matching suggestions: suggested values that equal some answer-key value;
  - checkbox count: suggested checkbox fields against answer-key checkboxes.

## Running

From `apps/backend-services`, with the whole stack running locally:

```bash
npx tsx scripts/label-suggestions-bench/src/cli.ts ping
npx tsx scripts/label-suggestions-bench/src/cli.ts download
npx tsx scripts/label-suggestions-bench/src/cli.ts generate --copies 20
npx tsx scripts/label-suggestions-bench/src/cli.ts run-labels --name baseline-rules --engine "rule-based (before LLM suggestions)" --copies 10
npx tsx scripts/label-suggestions-bench/src/cli.ts run-fields --name llm-1 --engine "LLM, deployment <name>"
```

Settings, read from the environment or the repo's `.env` files; values are never printed:

| Variable | Default | Purpose |
|---|---|---|
| `BENCH_API_KEY` | `TEST_API_KEY` | API key for the bench group |
| `BENCH_GROUP_ID` | `seeddefaultgroup` | Group the key belongs to. An API key cannot look this up, so it comes from here |
| `BENCH_BACKEND_URL` | `http://localhost:3002` | Backend base URL |

`run-labels --with-descriptions` sends each field's PDF tooltip as its description. Use it only against a backend that has the field-description column.

## Cost and clean-up

- **Document Intelligence:** each run pays for layout OCR, about USD 1.50 per 1,000 pages. Ten forms × 10 copies is about 200 pages.
- **LLM:** suggestion calls add LLM usage on the configured deployment.
- **Template models:** each run creates one per form, named `bench <form> <run>`. Delete them from the Template models page when you're done.

## Licence

The forms are © Province of British Columbia and are used here internally only. They and every generated copy stay in `.cache/`, which git ignores; the repository is public.
````

- [ ] **Step 2: Write the failing settings test**

Create `apps/backend-services/scripts/label-suggestions-bench/src/config.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readForms, readSettings } from "./config";

describe("readSettings", () => {
  it("uses the defaults and falls back to TEST_API_KEY", () => {
    const settings = readSettings({ TEST_API_KEY: "key-from-test" });
    assert.deepEqual(settings, {
      backendUrl: "http://localhost:3002",
      apiKey: "key-from-test",
      groupId: "seeddefaultgroup",
    });
  });

  it("prefers the BENCH_ settings and trims a trailing slash", () => {
    const settings = readSettings({
      BENCH_API_KEY: "bench-key",
      TEST_API_KEY: "ignored",
      BENCH_GROUP_ID: "group-9",
      BENCH_BACKEND_URL: "http://example.test:3002/",
    });
    assert.deepEqual(settings, {
      backendUrl: "http://example.test:3002",
      apiKey: "bench-key",
      groupId: "group-9",
    });
  });

  it("refuses to run without an API key, naming the setting", () => {
    assert.throws(() => readSettings({}), /BENCH_API_KEY/);
  });
});

describe("readForms", () => {
  it("lists ten forms with unique ids and direct PDF links", () => {
    const forms = readForms();
    assert.equal(forms.length, 10);
    assert.equal(new Set(forms.map((form) => form.id)).size, 10);
    for (const form of forms) {
      assert.match(form.url, /^https:\/\/www2\.gov\.bc\.ca\/.+\.pdf$/);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/config.test.ts`
Expected: FAIL with `Cannot find module './config'`.

- [ ] **Step 4: Implement settings and the API client**

Create `apps/backend-services/scripts/label-suggestions-bench/src/config.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

export const BENCH_DIR = resolve(__dirname, "..");
export const CACHE_DIR = resolve(BENCH_DIR, ".cache");
export const FORMS_FILE = resolve(BENCH_DIR, "forms.json");

// Repo-root .env, then the backend's own .env; neither overrides variables already set.
for (const envFile of [
  resolve(BENCH_DIR, "../../../../.env"),
  resolve(BENCH_DIR, "../../.env"),
]) {
  if (existsSync(envFile)) loadEnv({ path: envFile, quiet: true });
}

export interface BenchForm {
  id: string;
  title: string;
  url: string;
  pages: number;
}

export function readForms(): BenchForm[] {
  return JSON.parse(readFileSync(FORMS_FILE, "utf-8")) as BenchForm[];
}

export interface BenchSettings {
  backendUrl: string;
  apiKey: string;
  groupId: string;
}

export function readSettings(
  env: NodeJS.ProcessEnv = process.env,
): BenchSettings {
  const apiKey = env.BENCH_API_KEY ?? env.TEST_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Set BENCH_API_KEY (or TEST_API_KEY) to an API key for the bench group.",
    );
  }
  return {
    backendUrl: (env.BENCH_BACKEND_URL ?? "http://localhost:3002").replace(
      /\/+$/,
      "",
    ),
    apiKey,
    groupId: env.BENCH_GROUP_ID ?? "seeddefaultgroup",
  };
}
```

Create `apps/backend-services/scripts/label-suggestions-bench/src/api.ts`:

```ts
import type { AnalysisResponse } from "../../../src/ocr/azure-types";
import type { BenchSettings } from "./config";

export interface BenchDocument {
  labeling_document_id: string;
  labeling_document: {
    status: string;
    original_filename: string;
    ocr_result?: AnalysisResponse | null;
  };
}

export interface BenchLabelSuggestion {
  field_key: string;
  element_ids: string[];
}

export interface BenchSuggestedField {
  field_key: string;
  field_type: string;
  description: string;
  value: string | null;
  page_number: number | null;
  already_exists: boolean;
}

/** The backend allows 100 requests per 60 s; keep under it. */
const MIN_GAP_MS = 700;

export class BenchApi {
  private lastRequestAt = 0;

  constructor(private readonly settings: BenchSettings) {}

  listTemplateModels(): Promise<Array<{ id: string; name: string }>> {
    return this.request(
      "GET",
      `/template-models?group_id=${encodeURIComponent(this.settings.groupId)}`,
    );
  }

  createTemplateModel(name: string): Promise<{ id: string }> {
    return this.request("POST", "/template-models", {
      name,
      group_id: this.settings.groupId,
    });
  }

  addField(
    modelId: string,
    field: {
      field_key: string;
      field_type: "string" | "selectionMark";
      description?: string;
    },
  ): Promise<{ id: string }> {
    return this.request("POST", `/template-models/${modelId}/fields`, field);
  }

  uploadDocument(
    modelId: string,
    title: string,
    originalFilename: string,
    pdf: Uint8Array,
  ): Promise<{ labelingDocument: { id: string; status: string } }> {
    return this.request("POST", `/template-models/${modelId}/upload`, {
      title,
      file: Buffer.from(pdf).toString("base64"),
      file_type: "pdf",
      original_filename: originalFilename,
      group_id: this.settings.groupId,
    });
  }

  listDocuments(modelId: string): Promise<BenchDocument[]> {
    return this.request("GET", `/template-models/${modelId}/documents`);
  }

  suggestLabels(
    modelId: string,
    documentId: string,
  ): Promise<BenchLabelSuggestion[]> {
    return this.request(
      "POST",
      `/template-models/${modelId}/documents/${documentId}/suggestions`,
      {},
    );
  }

  suggestFields(
    modelId: string,
    documentId: string,
  ): Promise<BenchSuggestedField[]> {
    return this.request("POST", `/template-models/${modelId}/field-suggestions`, {
      document_id: documentId,
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const wait = this.lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();

    const response = await fetch(`${this.settings.backendUrl}/api${path}`, {
      method,
      headers: {
        "x-api-key": this.settings.apiKey,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!response.ok) {
      const message =
        typeof parsed === "object" && parsed !== null && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : text.slice(0, 200);
      throw new Error(`${method} ${path} failed with ${response.status}: ${message}`);
    }
    return parsed as T;
  }
}
```

Create `apps/backend-services/scripts/label-suggestions-bench/src/cli.ts` with the `ping` command. Later tasks add the other commands to the same `switch`.

```ts
import { BenchApi } from "./api";
import { readSettings } from "./config";

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(arg.slice(2), "true");
    } else {
      flags.set(arg.slice(2), next);
      i += 1;
    }
  }
  return flags;
}

export function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value || value === "true") {
    throw new Error(`--${name} <value> is required`);
  }
  return value;
}

const USAGE = `Usage: tsx scripts/label-suggestions-bench/src/cli.ts <command> [flags]
Commands:
  ping                                     check the backend and API key
  download                                 fetch the forms in forms.json
  generate [--copies 20]                   fill and flatten copies with answer keys
  run-labels --name <run> --engine <text> [--copies 10] [--with-descriptions]
  run-fields --name <run> --engine <text>`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  switch (command) {
    case "ping": {
      const models = await new BenchApi(readSettings()).listTemplateModels();
      console.log(`Backend reachable; the group has ${models.length} template models.`);
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
  void flags;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

- [ ] **Step 5: Run the tests and the type-check**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/config.test.ts`
Expected: PASS (4 tests).

Run: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json`
Expected: exits 0.

With the stack running, run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts ping`
Expected: `Backend reachable; the group has N template models.`

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/README.md \
  apps/backend-services/scripts/label-suggestions-bench/tsconfig.json \
  apps/backend-services/scripts/label-suggestions-bench/.cache/.gitignore \
  apps/backend-services/scripts/label-suggestions-bench/forms.json \
  apps/backend-services/scripts/label-suggestions-bench/src/config.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/config.test.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/api.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/cli.ts
git commit -m "chore(bench): scaffold the label suggestions bench

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Seeded made-up values

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/values.ts`
- Test: `apps/backend-services/scripts/label-suggestions-bench/src/values.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number`;
  - `createRng(seed: number): Rng`;
  - `seedFor(formId: string, copy: number): number`;
  - `valueFor(fieldName: string, multiline: boolean, maxLength: number | undefined, rng: Rng): string`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend-services/scripts/label-suggestions-bench/src/values.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng, seedFor, valueFor } from "./values";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a(), a(), a()];
    assert.deepEqual([b(), b(), b()], first);
    assert.ok(first.every((n) => n >= 0 && n < 1));
  });

  it("gives different copies different seeds", () => {
    assert.notEqual(seedFor("form-a", 1), seedFor("form-a", 2));
    assert.equal(seedFor("form-a", 1), seedFor("form-a", 1));
  });
});

describe("valueFor", () => {
  it("picks a value shaped like the field name", () => {
    const rng = createRng(7);
    assert.match(valueFor("Telephone", false, undefined, rng), /^\d{3}-555-\d{4}$/);
    assert.match(valueFor("Postal Code", false, undefined, rng), /^[A-Z]\d[A-Z] \d[A-Z]\d$/);
    assert.match(valueFor("Date of hearing", false, undefined, rng), /^\d{4}-\d{2}-\d{2}$/);
    assert.match(valueFor("Email address", false, undefined, rng), /^[a-z]+\.[a-z]+@example\.com$/);
    assert.match(valueFor("Claimant name", false, undefined, rng), /^[A-Z][a-z]+ [A-Z][A-Za-z]+$/);
  });

  it("respects the field's maximum length", () => {
    const value = valueFor("Comments", true, 12, createRng(3));
    assert.ok(value.length <= 12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/values.test.ts`
Expected: FAIL with `Cannot find module './values'`.

- [ ] **Step 3: Implement**

Create `apps/backend-services/scripts/label-suggestions-bench/src/values.ts`:

```ts
/** A seeded random number generator returning values in [0, 1). */
export type Rng = () => number;

/** mulberry32: small, fast and deterministic. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of "<form>#<copy>", so each copy gets its own stable values. */
export function seedFor(formId: string, copy: number): number {
  let hash = 2166136261;
  for (const char of `${formId}#${copy}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const FIRST_NAMES = ["Avery", "Jordan", "Priya", "Liam", "Mei", "Noah", "Amara", "Ethan", "Sofia", "Kai", "Harper", "Mateo", "Leila", "Owen", "Zoe", "Arjun"] as const;
const LAST_NAMES = ["Nguyen", "Singh", "MacDonald", "Tremblay", "Chen", "Wilson", "Gill", "Roy", "Campbell", "Dhillon", "Park", "Moreau", "Brown", "Sandhu", "Lee", "Martin"] as const;
const STREETS = ["Douglas Street", "Kingsway", "Granville Street", "Fort Street", "Main Street", "Oak Bay Avenue", "Hastings Street", "Lakeshore Road", "Cook Street", "Marine Drive"] as const;
const CITIES = ["Victoria", "Vancouver", "Kelowna", "Kamloops", "Nanaimo", "Prince George", "Surrey", "Burnaby", "Abbotsford", "Courtenay"] as const;
const WORDS = ["hearing", "order", "payment", "notice", "tenant", "agreement", "schedule", "service", "review", "claim", "evidence", "matter", "account", "request", "support", "date", "copy", "record", "court", "party"] as const;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function digits(count: number, rng: Rng): string {
  return Array.from({ length: count }, () => Math.floor(rng() * 10)).join("");
}

function postalCode(rng: Rng): string {
  const letters = "ABCEGHJKLMNPRSTVXY";
  const letter = () => letters[Math.floor(rng() * letters.length)];
  return `V${digits(1, rng)}${letter()} ${digits(1, rng)}${letter()}${digits(1, rng)}`;
}

function dateValue(rng: Rng): string {
  const year = 2024 + Math.floor(rng() * 3);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function amount(rng: Rng): string {
  const dollars = 10 + Math.floor(rng() * 9990);
  return `${dollars.toLocaleString("en-CA")}.${digits(2, rng)}`;
}

function sentence(wordCount: number, rng: Rng): string {
  const words = Array.from({ length: wordCount }, () => pick(WORDS, rng));
  const text = words.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** A made-up value shaped by the field's name, cut to its maximum length. */
export function valueFor(
  fieldName: string,
  multiline: boolean,
  maxLength: number | undefined,
  rng: Rng,
): string {
  const name = fieldName.toLowerCase();
  let value: string;
  if (/e-?mail/.test(name)) {
    value = `${pick(FIRST_NAMES, rng).toLowerCase()}.${pick(LAST_NAMES, rng).toLowerCase()}@example.com`;
  } else if (/phone|\btel\b|\bfax\b|\bcell\b/.test(name)) {
    value = `${pick(["250", "604", "778", "236"], rng)}-555-${digits(4, rng)}`;
  } else if (/postal|zip/.test(name)) {
    value = postalCode(rng);
  } else if (/date|dob|birth/.test(name)) {
    value = dateValue(rng);
  } else if (/province/.test(name)) {
    value = "BC";
  } else if (/city|town|municipality/.test(name)) {
    value = pick(CITIES, rng);
  } else if (/address|street/.test(name)) {
    value = `${1 + Math.floor(rng() * 9000)} ${pick(STREETS, rng)}`;
  } else if (/name/.test(name)) {
    value = `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
  } else if (/amount|total|fee|income|expense|\$|sum|cost|balance/.test(name)) {
    value = amount(rng);
  } else if (/file|number|\bno\b|registry/.test(name)) {
    value = `${pick(["S", "F", "C", "P"], rng)}-${10000 + Math.floor(rng() * 89999)}`;
  } else if (multiline) {
    value = sentence(8 + Math.floor(rng() * 8), rng);
  } else {
    value = sentence(2 + Math.floor(rng() * 3), rng);
  }
  return maxLength !== undefined && maxLength > 0
    ? value.slice(0, maxLength)
    : value;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/values.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/src/values.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/values.test.ts
git commit -m "chore(bench): seeded made-up field values

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Fill, flatten and write the answer key

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/fill.ts`
- Test: `apps/backend-services/scripts/label-suggestions-bench/src/fill.test.ts`

**Interfaces:**
- Consumes: `createRng`, `seedFor` and `valueFor` (Task 2).
- Produces:
  - `interface AnswerLocation { page: number; rect: [number, number, number, number] }`. The rect is `[left, top, right, bottom]`, normalised to 0–1 with the origin at the top-left, like the OCR.
  - `interface AnswerField { key; pdfName; type: "string" | "selectionMark"; value; description: string | null; locations: AnswerLocation[] }`.
  - `interface AnswerKey { formId; copy; seed; fields: AnswerField[] }`.
  - `toFieldKey(pdfName: string): string`.
  - `fillForm(pdf: Uint8Array, formId: string, copy: number): Promise<{ pdf: Uint8Array; answers: AnswerKey }>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend-services/scripts/label-suggestions-bench/src/fill.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { fillForm, toFieldKey } from "./fill";

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const name = form.createTextField("Applicant Name");
  name.addToPage(page, { x: 72, y: 700, width: 200, height: 20 });
  const agree = form.createCheckBox("Agree");
  agree.addToPage(page, { x: 72, y: 650, width: 12, height: 12 });
  return doc.save();
}

describe("toFieldKey", () => {
  it("makes lowercase snake_case keys that start with a letter", () => {
    assert.equal(toFieldKey("Applicant Name"), "applicant_name");
    assert.equal(toFieldKey("1st Party (Name)"), "field_1st_party_name");
    assert.equal(toFieldKey("---"), "field");
  });
});

describe("fillForm", () => {
  it("fills every field, flattens the form and records where each value sits", async () => {
    const { pdf, answers } = await fillForm(await samplePdf(), "sample", 1);

    assert.equal(answers.fields.length, 2);
    const [text, checkbox] = answers.fields;
    assert.equal(text.key, "applicant_name");
    assert.equal(text.type, "string");
    assert.ok(text.value.length > 0);
    assert.equal(text.locations.length, 1);
    assert.equal(text.locations[0].page, 1);
    const [left, top, right, bottom] = text.locations[0].rect;
    assert.ok(Math.abs(left - 72 / 612) < 1e-6);
    assert.ok(Math.abs(top - (1 - 720 / 792)) < 1e-6);
    assert.ok(Math.abs(right - 272 / 612) < 1e-6);
    assert.ok(Math.abs(bottom - (1 - 700 / 792)) < 1e-6);
    assert.equal(checkbox.type, "selectionMark");
    assert.ok(["selected", "unselected"].includes(checkbox.value));

    const flattened = await PDFDocument.load(pdf);
    assert.equal(flattened.getForm().getFields().length, 0);
  });

  it("gives the same copy the same values", async () => {
    const source = await samplePdf();
    const a = await fillForm(source, "sample", 3);
    const b = await fillForm(source, "sample", 3);
    assert.deepEqual(a.answers, b.answers);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/fill.test.ts`
Expected: FAIL with `Cannot find module './fill'`.

- [ ] **Step 3: Implement**

Create `apps/backend-services/scripts/label-suggestions-bench/src/fill.ts`:

```ts
import {
  type PDFAcroField,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  type PDFField,
  PDFHexString,
  PDFName,
  type PDFPage,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import { createRng, seedFor, valueFor } from "./values";

export interface AnswerLocation {
  page: number;
  /** [left, top, right, bottom], normalised to 0–1 with the origin top-left. */
  rect: [number, number, number, number];
}

export interface AnswerField {
  key: string;
  pdfName: string;
  type: "string" | "selectionMark";
  /** The text written, or "selected" / "unselected" for a checkbox. */
  value: string;
  /** The field's tooltip (/TU), used as its description when present. */
  description: string | null;
  locations: AnswerLocation[];
}

export interface AnswerKey {
  formId: string;
  copy: number;
  seed: number;
  fields: AnswerField[];
}

/** Same rules as the backend's suggested-field keys: lowercase snake_case starting with a letter. */
export function toFieldKey(pdfName: string): string {
  const key = pdfName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key.length === 0) return "field";
  return /^[a-z]/.test(key) ? key : `field_${key}`;
}

function uniqueKey(key: string, used: Set<string>): string {
  let candidate = key;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${key}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function tooltip(acroField: PDFAcroField): string | null {
  const raw = acroField.dict.lookup(PDFName.of("TU"));
  if (raw instanceof PDFString || raw instanceof PDFHexString) {
    const text = raw.decodeText().trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function locationsOf(
  field: PDFField,
  doc: PDFDocument,
  pages: PDFPage[],
): AnswerLocation[] {
  const locations: AnswerLocation[] = [];
  for (const widget of field.acroField.getWidgets()) {
    const pageRef = widget.P();
    let pageIndex = pages.findIndex((page) => page.ref === pageRef);
    if (pageIndex < 0) {
      const widgetRef = doc.context.getObjectRef(widget.dict);
      pageIndex = pages.findIndex(
        (page) =>
          page.node
            .Annots()
            ?.asArray()
            .some((annot) => annot === widgetRef) ?? false,
      );
    }
    if (pageIndex < 0) continue;
    const box = pages[pageIndex].getMediaBox();
    const rect = widget.getRectangle();
    locations.push({
      page: pageIndex + 1,
      rect: [
        (rect.x - box.x) / box.width,
        1 - (rect.y - box.y + rect.height) / box.height,
        (rect.x - box.x + rect.width) / box.width,
        1 - (rect.y - box.y) / box.height,
      ],
    });
  }
  return locations;
}

/**
 * Fills every writable field with seeded made-up values, flattens the form
 * into plain page content, and returns the answer key. Radio groups and
 * dropdowns are filled for realism but not recorded, because they are not scored.
 */
export async function fillForm(
  source: Uint8Array,
  formId: string,
  copy: number,
): Promise<{ pdf: Uint8Array; answers: AnswerKey }> {
  const doc = await PDFDocument.load(source);
  const form = doc.getForm();
  const pages = doc.getPages();
  const seed = seedFor(formId, copy);
  const rng = createRng(seed);
  const usedKeys = new Set<string>();
  const fields: AnswerField[] = [];

  for (const field of form.getFields()) {
    if (field.isReadOnly()) continue;
    const pdfName = field.getName();
    if (field instanceof PDFTextField) {
      const value = valueFor(pdfName, field.isMultiline(), field.getMaxLength(), rng);
      field.setText(value);
      fields.push({
        key: uniqueKey(toFieldKey(pdfName), usedKeys),
        pdfName,
        type: "string",
        value,
        description: tooltip(field.acroField),
        locations: locationsOf(field, doc, pages),
      });
    } else if (field instanceof PDFCheckBox) {
      const ticked = rng() < 0.5;
      if (ticked) field.check();
      else field.uncheck();
      fields.push({
        key: uniqueKey(toFieldKey(pdfName), usedKeys),
        pdfName,
        type: "selectionMark",
        value: ticked ? "selected" : "unselected",
        description: tooltip(field.acroField),
        locations: locationsOf(field, doc, pages),
      });
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
      const options = field.getOptions();
      if (options.length > 0) {
        field.select(options[Math.floor(rng() * options.length)]);
      }
    }
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  form.flatten();
  return { pdf: await doc.save(), answers: { formId, copy, seed, fields } };
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/fill.test.ts`
Expected: PASS (3 tests).

Run: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/src/fill.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/fill.test.ts
git commit -m "chore(bench): fill and flatten forms with an answer key

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Download and generate commands

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/corpus.ts`
- Modify: `apps/backend-services/scripts/label-suggestions-bench/src/cli.ts`

**Interfaces:**
- Consumes: `readForms` and `CACHE_DIR` (Task 1); `fillForm` and `AnswerKey` (Task 3).
- Produces:
  - `downloadForms(): Promise<void>` and `generateCopies(copies: number): Promise<void>`.
  - `interface CopyFiles { copy: number; pdfPath: string; answersPath: string }`.
  - `listCopies(formId: string): CopyFiles[]` (sorted by copy) and `readAnswers(path: string): AnswerKey`.

- [ ] **Step 1: Implement the corpus helpers**

Create `apps/backend-services/scripts/label-suggestions-bench/src/corpus.ts`:

```ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, readForms } from "./config";
import { type AnswerKey, fillForm } from "./fill";

const FORMS_DIR = join(CACHE_DIR, "forms");
const COPIES_DIR = join(CACHE_DIR, "copies");

export async function downloadForms(): Promise<void> {
  mkdirSync(FORMS_DIR, { recursive: true });
  for (const form of readForms()) {
    const target = join(FORMS_DIR, `${form.id}.pdf`);
    if (existsSync(target)) {
      console.log(`have ${form.id}`);
      continue;
    }
    const response = await fetch(form.url);
    if (!response.ok) {
      throw new Error(`Downloading ${form.id} failed with ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
      throw new Error(`${form.id} did not download as a PDF`);
    }
    writeFileSync(target, bytes);
    console.log(`downloaded ${form.id}`);
  }
}

export async function generateCopies(copies: number): Promise<void> {
  for (const form of readForms()) {
    const sourcePath = join(FORMS_DIR, `${form.id}.pdf`);
    if (!existsSync(sourcePath)) {
      throw new Error(`${form.id} is not downloaded; run the download command first`);
    }
    const source = readFileSync(sourcePath);
    const dir = join(COPIES_DIR, form.id);
    mkdirSync(dir, { recursive: true });
    for (let copy = 1; copy <= copies; copy += 1) {
      const { pdf, answers } = await fillForm(source, form.id, copy);
      writeFileSync(join(dir, `copy-${copy}.pdf`), pdf);
      writeFileSync(
        join(dir, `copy-${copy}.answers.json`),
        JSON.stringify(answers, null, 2),
      );
    }
    console.log(`generated ${copies} copies of ${form.id}`);
  }
}

export interface CopyFiles {
  copy: number;
  pdfPath: string;
  answersPath: string;
}

export function listCopies(formId: string): CopyFiles[] {
  const dir = join(COPIES_DIR, formId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^copy-(\d+)\.pdf$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      copy: Number(match[1]),
      pdfPath: join(dir, match[0]),
      answersPath: join(dir, `copy-${match[1]}.answers.json`),
    }))
    .sort((a, b) => a.copy - b.copy);
}

export function readAnswers(path: string): AnswerKey {
  return JSON.parse(readFileSync(path, "utf-8")) as AnswerKey;
}
```

- [ ] **Step 2: Add the commands to the CLI**

In `cli.ts`, add `import { downloadForms, generateCopies } from "./corpus";` and add these cases to the `switch`, before `default`:

```ts
    case "download":
      await downloadForms();
      return;
    case "generate":
      await generateCopies(Number(flags.get("copies") ?? "20"));
      return;
```

Then delete the `void flags;` line, since `flags` is now used.

- [ ] **Step 3: Run it**

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts download`
Expected: `downloaded <id>` ten times.

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts generate --copies 20`
Expected: `generated 20 copies of <id>` ten times. `.cache/copies/<id>/` then holds `copy-1.pdf` … `copy-20.pdf` and their `.answers.json` files.

Open one generated PDF in a PDF viewer and confirm the values are drawn on the page as ordinary text, with no editable fields left. Then check git ignores them:

Run: `git status --short apps/backend-services/scripts/label-suggestions-bench`
Expected: only `src/corpus.ts` and `src/cli.ts` are listed. Nothing under `.cache/` appears.

Run: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/src/corpus.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/cli.ts
git commit -m "chore(bench): download forms and generate filled copies

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Ground truth and scoring

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.ts`
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/score.ts`
- Test: `apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.test.ts`
- Test: `apps/backend-services/scripts/label-suggestions-bench/src/score.test.ts`

**Interfaces:**
- Consumes: `AnswerKey` (Task 3), and the backend's `AnalysisResult` type (type-only import).
- Produces, from `ground-truth.ts`:
  - `normalizeText(value): string`.
  - `interface TruthField { key; type; verified: boolean; alternatives: string[][] }`. There is one alternative element-id list per location that verified.
  - `buildTruth(answers: AnswerKey, result: AnalysisResult): TruthField[]`.
- Produces, from `score.ts`:
  - `type Outcome = "exact" | "partial" | "wrong" | "missed"`.
  - `interface CopyScore { copy; verifiedFields; unverifiedFields; fields: Array<{ key; outcome }> }`.
  - `scoreCopy(copy, truth, suggestions): CopyScore`.
  - `interface Totals { verified; unverified; exact; partial; wrong; missed; exactRate }` and `totals(scores: CopyScore[]): Totals`.
  - `interface FieldListScore { answerTextFields; foundTextFields; suggestedWithValue; suggestedMatching; answerCheckboxes; suggestedCheckboxes }` and `scoreFieldList(answers, suggested): FieldListScore`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisResult } from "../../../src/ocr/azure-types";
import type { AnswerKey } from "./fill";
import { buildTruth } from "./ground-truth";

/** An 8.5 × 11 inch page with two words and one ticked checkbox. */
function ocr(): AnalysisResult {
  const box = (x: number, y: number, w: number, h: number) => [
    x, y, x + w, y, x + w, y + h, x, y + h,
  ];
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-layout",
    stringIndexType: "textElements",
    content: "Jane Doe :selected:",
    contentFormat: "text",
    pages: [
      {
        pageNumber: 1,
        angle: 0,
        width: 8.5,
        height: 11,
        unit: "inch",
        spans: [{ offset: 0, length: 19 }],
        words: [
          { content: "Jane", polygon: box(1.0, 1.0, 0.5, 0.2), confidence: 1, span: { offset: 0, length: 4 } },
          { content: "Doe", polygon: box(1.6, 1.0, 0.4, 0.2), confidence: 1, span: { offset: 5, length: 3 } },
        ],
        selectionMarks: [
          { state: "selected", polygon: box(1.0, 2.0, 0.15, 0.15), confidence: 1, span: { offset: 9, length: 10 } },
        ],
        lines: [],
      },
    ],
    tables: [],
    paragraphs: [],
    styles: [],
    sections: [],
    figures: [],
  };
}

function answers(nameValue: string, ticked: string): AnswerKey {
  return {
    formId: "t",
    copy: 1,
    seed: 1,
    fields: [
      {
        key: "name",
        pdfName: "Name",
        type: "string",
        value: nameValue,
        description: null,
        locations: [{ page: 1, rect: [0.9 / 8.5, 0.95 / 11, 2.2 / 8.5, 1.25 / 11] }],
      },
      {
        key: "agree",
        pdfName: "Agree",
        type: "selectionMark",
        value: ticked,
        description: null,
        locations: [{ page: 1, rect: [0.95 / 8.5, 1.95 / 11, 1.2 / 8.5, 2.2 / 11] }],
      },
    ],
  };
}

describe("buildTruth", () => {
  it("maps each field to the OCR elements inside its rectangle", () => {
    const truth = buildTruth(answers("Jane Doe", "selected"), ocr());
    assert.deepEqual(truth, [
      { key: "name", type: "string", verified: true, alternatives: [["p1-w0", "p1-w1"]] },
      { key: "agree", type: "selectionMark", verified: true, alternatives: [["p1-sm0"]] },
    ]);
  });

  it("marks a field unverifiable when the OCR does not read back its value", () => {
    const truth = buildTruth(answers("Jane Doherty", "unselected"), ocr());
    assert.equal(truth[0].verified, false);
    assert.equal(truth[1].verified, false);
  });
});
```

Create `apps/backend-services/scripts/label-suggestions-bench/src/score.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnswerKey } from "./fill";
import type { TruthField } from "./ground-truth";
import { scoreCopy, scoreFieldList, totals } from "./score";

const truth: TruthField[] = [
  { key: "a", type: "string", verified: true, alternatives: [["w1", "w2"]] },
  { key: "b", type: "string", verified: true, alternatives: [["w3"], ["w9"]] },
  { key: "c", type: "string", verified: true, alternatives: [["w4"]] },
  { key: "d", type: "string", verified: true, alternatives: [["w5"]] },
  { key: "e", type: "string", verified: false, alternatives: [] },
];

describe("scoreCopy", () => {
  it("classifies each verified field", () => {
    const score = scoreCopy("copy-1.pdf", truth, [
      { field_key: "a", element_ids: ["w2", "w1"] },
      { field_key: "b", element_ids: ["w9", "w10"] },
      { field_key: "c", element_ids: ["w7"] },
      { field_key: "e", element_ids: ["w8"] },
    ]);
    assert.deepEqual(score, {
      copy: "copy-1.pdf",
      verifiedFields: 4,
      unverifiedFields: 1,
      fields: [
        { key: "a", outcome: "exact" },
        { key: "b", outcome: "partial" },
        { key: "c", outcome: "wrong" },
        { key: "d", outcome: "missed" },
      ],
    });
  });
});

describe("totals", () => {
  it("adds up outcomes and the exact rate", () => {
    const score = scoreCopy("copy-1.pdf", truth, [
      { field_key: "a", element_ids: ["w1", "w2"] },
    ]);
    assert.deepEqual(totals([score, score]), {
      verified: 8,
      unverified: 2,
      exact: 2,
      partial: 0,
      wrong: 0,
      missed: 6,
      exactRate: 0.25,
    });
  });
});

describe("scoreFieldList", () => {
  it("matches suggested fields to the answer key by value", () => {
    const answers: AnswerKey = {
      formId: "t",
      copy: 1,
      seed: 1,
      fields: [
        { key: "name", pdfName: "Name", type: "string", value: "Jane Doe", description: null, locations: [] },
        { key: "city", pdfName: "City", type: "string", value: "Victoria", description: null, locations: [] },
        { key: "agree", pdfName: "Agree", type: "selectionMark", value: "selected", description: null, locations: [] },
      ],
    };
    const score = scoreFieldList(answers, [
      { field_key: "applicant", field_type: "string", description: "", value: "JANE  doe", page_number: 1, already_exists: false },
      { field_key: "heading", field_type: "string", description: "", value: "Form 7", page_number: 1, already_exists: false },
      { field_key: "blank", field_type: "date", description: "", value: null, page_number: null, already_exists: false },
      { field_key: "agree", field_type: "selectionMark", description: "", value: "selected", page_number: 1, already_exists: false },
    ]);
    assert.deepEqual(score, {
      answerTextFields: 2,
      foundTextFields: 1,
      suggestedWithValue: 2,
      suggestedMatching: 1,
      answerCheckboxes: 1,
      suggestedCheckboxes: 1,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/ground-truth.test.ts scripts/label-suggestions-bench/src/score.test.ts`
Expected: FAIL with `Cannot find module './ground-truth'`.

- [ ] **Step 3: Implement**

Create `apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.ts`:

```ts
import type { AnalysisResult } from "../../../src/ocr/azure-types";
import type { AnswerField, AnswerKey } from "./fill";

/** Slack around a field's rectangle, in normalised page units. */
const TOLERANCE = 0.005;

export interface TruthField {
  key: string;
  type: "string" | "selectionMark";
  /** False when no location's OCR reads back the value (clipped or split text). */
  verified: boolean;
  /** One element-id list per location that verified; any one of them is a correct label. */
  alternatives: string[][];
}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function centre(polygon: number[]): [number, number] {
  const xs = polygon.filter((_, i) => i % 2 === 0);
  const ys = polygon.filter((_, i) => i % 2 === 1);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function truthFor(field: AnswerField, result: AnalysisResult): TruthField {
  const alternatives: string[][] = [];
  for (const location of field.locations) {
    const page = result.pages.find((p) => p.pageNumber === location.page);
    if (!page) continue;
    const [left, top, right, bottom] = location.rect;
    const inside = (polygon: number[]): boolean => {
      const [x, y] = centre(polygon);
      const nx = x / page.width;
      const ny = y / page.height;
      return (
        nx >= left - TOLERANCE &&
        nx <= right + TOLERANCE &&
        ny >= top - TOLERANCE &&
        ny <= bottom + TOLERANCE
      );
    };
    if (field.type === "selectionMark") {
      const marks = (page.selectionMarks ?? [])
        .map((mark, index) => ({ mark, id: `p${page.pageNumber}-sm${index}` }))
        .filter(({ mark }) => mark.polygon?.length >= 8 && inside(mark.polygon));
      if (marks.length === 1 && marks[0].mark.state === field.value) {
        alternatives.push([marks[0].id]);
      }
    } else {
      const words = (page.words ?? [])
        .map((word, index) => ({ word, id: `p${page.pageNumber}-w${index}` }))
        .filter(({ word }) => word.polygon?.length >= 8 && inside(word.polygon));
      const read = normalizeText(words.map(({ word }) => word.content).join(" "));
      if (words.length > 0 && read === normalizeText(field.value)) {
        alternatives.push(words.map(({ id }) => id));
      }
    }
  }
  return {
    key: field.key,
    type: field.type,
    verified: alternatives.length > 0,
    alternatives,
  };
}

export function buildTruth(
  answers: AnswerKey,
  result: AnalysisResult,
): TruthField[] {
  return answers.fields.map((field) => truthFor(field, result));
}
```

Create `apps/backend-services/scripts/label-suggestions-bench/src/score.ts`:

```ts
import type { BenchLabelSuggestion, BenchSuggestedField } from "./api";
import type { AnswerKey } from "./fill";
import { normalizeText, type TruthField } from "./ground-truth";

export type Outcome = "exact" | "partial" | "wrong" | "missed";

export interface CopyScore {
  copy: string;
  verifiedFields: number;
  unverifiedFields: number;
  fields: Array<{ key: string; outcome: Outcome }>;
}

export function scoreCopy(
  copy: string,
  truth: TruthField[],
  suggestions: BenchLabelSuggestion[],
): CopyScore {
  const byKey = new Map(
    suggestions.map((s) => [s.field_key, new Set(s.element_ids)]),
  );
  const fields: CopyScore["fields"] = [];
  let unverified = 0;
  for (const field of truth) {
    if (!field.verified) {
      unverified += 1;
      continue;
    }
    const suggested = byKey.get(field.key);
    if (!suggested || suggested.size === 0) {
      fields.push({ key: field.key, outcome: "missed" });
      continue;
    }
    const exact = field.alternatives.some(
      (ids) => ids.length === suggested.size && ids.every((id) => suggested.has(id)),
    );
    const overlaps = field.alternatives.some((ids) =>
      ids.some((id) => suggested.has(id)),
    );
    fields.push({
      key: field.key,
      outcome: exact ? "exact" : overlaps ? "partial" : "wrong",
    });
  }
  return { copy, verifiedFields: fields.length, unverifiedFields: unverified, fields };
}

export interface Totals {
  verified: number;
  unverified: number;
  exact: number;
  partial: number;
  wrong: number;
  missed: number;
  exactRate: number;
}

export function totals(scores: CopyScore[]): Totals {
  const count = (outcome: Outcome) =>
    scores.reduce(
      (sum, score) => sum + score.fields.filter((f) => f.outcome === outcome).length,
      0,
    );
  const verified = scores.reduce((sum, s) => sum + s.verifiedFields, 0);
  const exact = count("exact");
  return {
    verified,
    unverified: scores.reduce((sum, s) => sum + s.unverifiedFields, 0),
    exact,
    partial: count("partial"),
    wrong: count("wrong"),
    missed: count("missed"),
    exactRate: verified === 0 ? 0 : exact / verified,
  };
}

export interface FieldListScore {
  answerTextFields: number;
  foundTextFields: number;
  suggestedWithValue: number;
  suggestedMatching: number;
  answerCheckboxes: number;
  suggestedCheckboxes: number;
}

export function scoreFieldList(
  answers: AnswerKey,
  suggested: BenchSuggestedField[],
): FieldListScore {
  const truthValues = answers.fields
    .filter((field) => field.type === "string")
    .map((field) => normalizeText(field.value));
  const suggestedValues = suggested.flatMap((field) =>
    field.field_type !== "selectionMark" && field.value !== null
      ? [normalizeText(field.value)]
      : [],
  );
  return {
    answerTextFields: truthValues.length,
    foundTextFields: truthValues.filter((v) => suggestedValues.includes(v)).length,
    suggestedWithValue: suggestedValues.length,
    suggestedMatching: suggestedValues.filter((v) => truthValues.includes(v)).length,
    answerCheckboxes: answers.fields.filter((f) => f.type === "selectionMark").length,
    suggestedCheckboxes: suggested.filter((f) => f.field_type === "selectionMark").length,
  };
}
```

- [ ] **Step 4: Run the tests and the type-check**

Run: `cd apps/backend-services && npx tsx --test scripts/label-suggestions-bench/src/*.test.ts`
Expected: PASS: all bench tests, including the 6 new ones.

Run: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/ground-truth.test.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/score.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/score.test.ts
git commit -m "chore(bench): ground truth from OCR and suggestion scoring

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Run against the platform, and record the baseline

**Files:**
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/run.ts`
- Create: `apps/backend-services/scripts/label-suggestions-bench/src/report.ts`
- Modify: `apps/backend-services/scripts/label-suggestions-bench/src/cli.ts`

**Interfaces:**
- Consumes: `BenchApi` (Task 1), `listCopies` and `readAnswers` (Task 4), `buildTruth` (Task 5), and `scoreCopy`, `totals` and `scoreFieldList` (Task 5).
- Produces:
  - `runLabels(options: { name; engine; copies; withDescriptions }): Promise<string>`, which returns the run folder.
  - `runFields(options: { name; engine }): Promise<string>`.
  - Reports: `labels-report.md` / `.json` and `fields-report.md` / `.json` under `.cache/runs/<name>/`.

- [ ] **Step 1: Implement the report writer**

Create `apps/backend-services/scripts/label-suggestions-bench/src/report.ts`:

```ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CopyScore, type FieldListScore, totals } from "./score";

export interface LabelFormResult {
  formId: string;
  title: string;
  templateModelId: string;
  copies: number;
  failedOcr: number;
  failedCalls: number;
  medianLatencyMs: number | null;
  scores: CopyScore[];
}

export interface FieldFormResult {
  formId: string;
  title: string;
  templateModelId: string;
  latencyMs: number | null;
  error: string | null;
  score: FieldListScore | null;
}

interface RunInfo {
  name: string;
  engine: string;
  date: string;
  backendUrl: string;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function writeLabelReport(
  dir: string,
  run: RunInfo,
  results: LabelFormResult[],
): void {
  writeFileSync(
    join(dir, "labels-report.json"),
    JSON.stringify({ ...run, results }, null, 2),
  );
  const rows = results.map((r) => {
    const t = totals(r.scores);
    return `| ${r.formId} | ${r.copies} | ${t.verified} | ${t.exact} | ${t.partial} | ${t.wrong} | ${t.missed} | ${percent(t.exactRate)} | ${t.unverified} | ${r.failedOcr} | ${r.failedCalls} | ${r.medianLatencyMs ?? "—"} |`;
  });
  const all = totals(results.flatMap((r) => r.scores));
  const lines = [
    `# Suggested labels: ${run.name}`,
    "",
    `Engine: ${run.engine}. Date: ${run.date}. Backend: ${run.backendUrl}.`,
    "",
    "| Form | Copies | Verified fields | Exact | Partial | Wrong | Missed | Exact rate | Unverifiable | OCR failed | Call failed | Median ms |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    `| **All** | ${results.reduce((s, r) => s + r.copies, 0)} | ${all.verified} | ${all.exact} | ${all.partial} | ${all.wrong} | ${all.missed} | **${percent(all.exactRate)}** | ${all.unverified} | ${results.reduce((s, r) => s + r.failedOcr, 0)} | ${results.reduce((s, r) => s + r.failedCalls, 0)} | |`,
    "",
    "Exact: the suggested words are exactly the ground truth. Partial: they overlap it. Wrong: no overlap. Missed: no suggestion. Unverifiable fields (OCR did not read the value back) are left out.",
  ];
  writeFileSync(join(dir, "labels-report.md"), `${lines.join("\n")}\n`);
}

export function writeFieldReport(
  dir: string,
  run: RunInfo,
  results: FieldFormResult[],
): void {
  writeFileSync(
    join(dir, "fields-report.json"),
    JSON.stringify({ ...run, results }, null, 2),
  );
  const rows = results.map((r) =>
    r.score
      ? `| ${r.formId} | ${r.score.foundTextFields} / ${r.score.answerTextFields} | ${r.score.suggestedMatching} / ${r.score.suggestedWithValue} | ${r.score.suggestedCheckboxes} / ${r.score.answerCheckboxes} | ${r.latencyMs ?? "—"} |`
      : `| ${r.formId} | failed: ${r.error ?? "unknown"} | | | |`,
  );
  const lines = [
    `# Suggested fields: ${run.name}`,
    "",
    `Engine: ${run.engine}. Date: ${run.date}. Backend: ${run.backendUrl}.`,
    "",
    "| Form | Text fields found | Suggestions matching a real value | Checkboxes suggested / in form | ms |",
    "|---|---|---|---|---|",
    ...rows,
  ];
  writeFileSync(join(dir, "fields-report.md"), `${lines.join("\n")}\n`);
}
```

- [ ] **Step 2: Implement the runner**

Create `apps/backend-services/scripts/label-suggestions-bench/src/run.ts`:

```ts
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BenchApi, type BenchDocument } from "./api";
import { CACHE_DIR, readForms, readSettings } from "./config";
import { listCopies, readAnswers } from "./corpus";
import type { AnswerKey } from "./fill";
import { buildTruth } from "./ground-truth";
import {
  type FieldFormResult,
  type LabelFormResult,
  writeFieldReport,
  writeLabelReport,
} from "./report";
import { type CopyScore, scoreCopy, scoreFieldList } from "./score";

const TERMINAL = new Set(["extracted", "failed", "conversion_failed"]);
const OCR_TIMEOUT_MS = 15 * 60_000;
const OCR_POLL_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function waitForOcr(
  api: BenchApi,
  modelId: string,
  expected: number,
): Promise<BenchDocument[]> {
  const deadline = Date.now() + OCR_TIMEOUT_MS;
  for (;;) {
    const documents = await api.listDocuments(modelId);
    const finished = documents.filter((d) =>
      TERMINAL.has(d.labeling_document.status),
    );
    if (documents.length >= expected && finished.length === documents.length) {
      return documents;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `OCR did not finish for template model ${modelId} within 15 minutes`,
      );
    }
    await sleep(OCR_POLL_MS);
  }
}

async function uploadCopies(
  api: BenchApi,
  modelId: string,
  formId: string,
  copies: Array<{ copy: number; pdfPath: string; answers: AnswerKey }>,
): Promise<Map<string, AnswerKey>> {
  const byDocument = new Map<string, AnswerKey>();
  for (const copy of copies) {
    const uploaded = await api.uploadDocument(
      modelId,
      `${formId} copy ${copy.copy}`,
      `${formId}-copy-${copy.copy}.pdf`,
      readFileSync(copy.pdfPath),
    );
    byDocument.set(uploaded.labelingDocument.id, copy.answers);
  }
  return byDocument;
}

function runInfo(name: string, engine: string) {
  return {
    name,
    engine,
    date: new Date().toISOString(),
    backendUrl: readSettings().backendUrl,
  };
}

export async function runLabels(options: {
  name: string;
  engine: string;
  copies: number;
  withDescriptions: boolean;
}): Promise<string> {
  const api = new BenchApi(readSettings());
  const dir = join(CACHE_DIR, "runs", options.name);
  mkdirSync(dir, { recursive: true });
  const results: LabelFormResult[] = [];

  for (const form of readForms()) {
    const copies = listCopies(form.id)
      .slice(0, options.copies)
      .map((c) => ({ ...c, answers: readAnswers(c.answersPath) }));
    if (copies.length === 0) {
      console.log(`skip ${form.id}: no generated copies`);
      continue;
    }
    const model = await api.createTemplateModel(`bench ${form.id} ${options.name}`);
    for (const field of copies[0].answers.fields) {
      await api.addField(model.id, {
        field_key: field.key,
        field_type: field.type,
        ...(options.withDescriptions && field.description
          ? { description: field.description }
          : {}),
      });
    }
    const answersByDocument = await uploadCopies(api, model.id, form.id, copies);
    const documents = await waitForOcr(api, model.id, answersByDocument.size);

    const scores: CopyScore[] = [];
    const latencies: number[] = [];
    let failedOcr = 0;
    let failedCalls = 0;
    for (const document of documents) {
      const answers = answersByDocument.get(document.labeling_document_id);
      const result = document.labeling_document.ocr_result?.analyzeResult;
      if (!answers || document.labeling_document.status !== "extracted" || !result) {
        failedOcr += 1;
        continue;
      }
      const started = Date.now();
      try {
        const suggestions = await api.suggestLabels(
          model.id,
          document.labeling_document_id,
        );
        latencies.push(Date.now() - started);
        scores.push(
          scoreCopy(
            document.labeling_document.original_filename,
            buildTruth(answers, result),
            suggestions,
          ),
        );
      } catch (error) {
        failedCalls += 1;
        console.log(
          `${form.id}: suggestion call failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    results.push({
      formId: form.id,
      title: form.title,
      templateModelId: model.id,
      copies: copies.length,
      failedOcr,
      failedCalls,
      medianLatencyMs: median(latencies),
      scores,
    });
    console.log(`${form.id}: scored ${scores.length} copies`);
  }

  writeLabelReport(dir, runInfo(options.name, options.engine), results);
  return dir;
}

export async function runFields(options: {
  name: string;
  engine: string;
}): Promise<string> {
  const api = new BenchApi(readSettings());
  const dir = join(CACHE_DIR, "runs", options.name);
  mkdirSync(dir, { recursive: true });
  const results: FieldFormResult[] = [];

  for (const form of readForms()) {
    const [first] = listCopies(form.id);
    if (!first) {
      console.log(`skip ${form.id}: no generated copies`);
      continue;
    }
    const answers = readAnswers(first.answersPath);
    const model = await api.createTemplateModel(
      `bench ${form.id} ${options.name} fields`,
    );
    const byDocument = await uploadCopies(api, model.id, form.id, [
      { copy: first.copy, pdfPath: first.pdfPath, answers },
    ]);
    const documents = await waitForOcr(api, model.id, byDocument.size);
    const document = documents[0];
    if (!document || document.labeling_document.status !== "extracted") {
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: null,
        error: "OCR did not finish",
        score: null,
      });
      continue;
    }
    const started = Date.now();
    try {
      const suggested = await api.suggestFields(
        model.id,
        document.labeling_document_id,
      );
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: Date.now() - started,
        error: null,
        score: scoreFieldList(answers, suggested),
      });
    } catch (error) {
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: null,
        error: error instanceof Error ? error.message : String(error),
        score: null,
      });
    }
    console.log(`${form.id}: suggested fields scored`);
  }

  writeFieldReport(dir, runInfo(options.name, options.engine), results);
  return dir;
}
```

- [ ] **Step 3: Add the run commands to the CLI**

In `cli.ts`, add `import { runFields, runLabels } from "./run";`. Add these cases to the `switch`, before `default`:

```ts
    case "run-labels": {
      const dir = await runLabels({
        name: requireFlag(flags, "name"),
        engine: requireFlag(flags, "engine"),
        copies: Number(flags.get("copies") ?? "10"),
        withDescriptions: flags.get("with-descriptions") === "true",
      });
      console.log(`Report: ${dir}/labels-report.md`);
      return;
    }
    case "run-fields": {
      const dir = await runFields({
        name: requireFlag(flags, "name"),
        engine: requireFlag(flags, "engine"),
      });
      console.log(`Report: ${dir}/fields-report.md`);
      return;
    }
```

Run: `cd apps/backend-services && npx tsc -p scripts/label-suggestions-bench/tsconfig.json && npx tsx --test scripts/label-suggestions-bench/src/*.test.ts`
Expected: exits 0, and all bench tests pass.

- [ ] **Step 4: Commit the runner**

```bash
git add apps/backend-services/scripts/label-suggestions-bench/src/run.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/report.ts \
  apps/backend-services/scripts/label-suggestions-bench/src/cli.ts
git commit -m "chore(bench): run suggestions against the platform and write reports

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Record the baseline for today's engine**

Do this with the branch still at the commit above: the product plan has not started, so the rule-based engine is still in place. Start the whole stack with the `run` skill, then:

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts run-labels --name baseline-rules --engine "rule-based (before LLM suggestions)" --copies 10`
Expected: `<form>: scored 10 copies` for each form, then `Report: …/.cache/runs/baseline-rules/labels-report.md`. The table shows an exact rate for each form and an overall row. A low rate is the expected result for the rule-based engine on these forms, not a failure of the bench.

Read the report. Check two things:
- **Unverifiable column.** If more than half of a form's verified-plus-unverifiable fields are unverifiable, the generator is clipping that form's values. Note it for Part 2; don't change the forms list now.
- **Where the report lives.** It is the baseline that Task 8 compares against. It stays in `.cache/` and is never committed.

---

### Task 7: Read-only availability checks

**Files:**
- Modify: `apps/backend-services/scripts/label-suggestions-bench/README.md`

**Interfaces:**
- Produces: `.cache/availability/<date>/` text files. They list which Azure OpenAI models and quotas exist in the Canadian regions, and whether the `AIServices` kind, which hosts Content Understanding, can be created in Canada Central.

- [ ] **Step 1: Confirm which subscription to read**

Ask Alex which Azure subscription the checks should read. Do not run `az login` or `az account set` yourself. Then confirm the CLI is already pointed there:

Run: `az account show --query "{name:name, id:id}" -o table`
Expected: the subscription Alex named. If it isn't, stop and ask him to switch it.

- [ ] **Step 2: Run the read-only listings**

```bash
DIR=apps/backend-services/scripts/label-suggestions-bench/.cache/availability/$(date +%F)
mkdir -p "$DIR"
az cognitiveservices model list --location canadaeast -o table > "$DIR/models-canadaeast.txt"
az cognitiveservices model list --location canadacentral -o table > "$DIR/models-canadacentral.txt"
az cognitiveservices usage list --location canadaeast -o table > "$DIR/quota-canadaeast.txt"
az cognitiveservices usage list --location canadacentral -o table > "$DIR/quota-canadacentral.txt"
az cognitiveservices account list-skus --kind AIServices --location canadacentral -o table > "$DIR/aiservices-skus-canadacentral.txt"
az provider show --namespace Microsoft.CognitiveServices --query "resourceTypes[?resourceType=='accounts'].locations" -o tsv > "$DIR/accounts-locations.txt"
```

Expected: six files, each non-empty. None of these commands creates or changes anything.

- [ ] **Step 3: Document the checks and the step that needs sign-off**

Add this section to the end of the bench `README.md`:

````markdown
## Availability checks

Read-only; never create resources without sign-off. With the Azure CLI already pointed at the agreed subscription:

```bash
DIR=.cache/availability/$(date +%F); mkdir -p "$DIR"
az cognitiveservices model list --location canadaeast -o table > "$DIR/models-canadaeast.txt"
az cognitiveservices model list --location canadacentral -o table > "$DIR/models-canadacentral.txt"
az cognitiveservices usage list --location canadaeast -o table > "$DIR/quota-canadaeast.txt"
az cognitiveservices usage list --location canadacentral -o table > "$DIR/quota-canadacentral.txt"
az cognitiveservices account list-skus --kind AIServices --location canadacentral -o table > "$DIR/aiservices-skus-canadacentral.txt"
az provider show --namespace Microsoft.CognitiveServices --query "resourceTypes[?resourceType=='accounts'].locations" -o tsv > "$DIR/accounts-locations.txt"
```

In the model lists, a deployment type of `Standard` or `ProvisionedManaged` processes data in that region. `GlobalStandard` may process it anywhere.

Proving Content Understanding works in Canada Central needs a test `AIServices` resource there and one call to `GET {endpoint}/contentunderstanding/analyzers?api-version=2025-11-01`. Creating that resource needs sign-off first.
````

- [ ] **Step 4: Report the findings and commit**

Summarise the six files for Alex in plain words:
- which OpenAI models have a `Standard` (pay-as-you-go) or regional provisioned deployment type in each Canadian region;
- the quota that exists;
- whether `AIServices` lists SKUs for Canada Central.

Ask whether to create the Content Understanding test resource. Do not create it without his yes.

```bash
git add apps/backend-services/scripts/label-suggestions-bench/README.md
git commit -m "docs(bench): read-only model and Content Understanding availability checks

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Measure the LLM engine (after the product plan)

**Precondition:** every task of `docs/superpowers/plans/2026-09-18-label-suggestions.md` is done, and the Azure OpenAI settings point at the deployment to measure.

- [ ] **Step 1: Suggested labels, with and without descriptions**

Start the whole stack with the `run` skill.

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts run-labels --name llm-labels --engine "LLM, deployment <AZURE_OPENAI_DEPLOYMENT>" --copies 10`

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts run-labels --name llm-labels-described --engine "LLM + PDF tooltip descriptions, deployment <AZURE_OPENAI_DEPLOYMENT>" --copies 10 --with-descriptions`

Expected: two reports. `Call failed` stays at 0. If calls fail, the console line gives the backend's reason. A 503 means the settings are missing; a 502 comes with the model's reason.

- [ ] **Step 2: Suggested fields**

Run: `cd apps/backend-services && npx tsx scripts/label-suggestions-bench/src/cli.ts run-fields --name llm-fields --engine "LLM, deployment <AZURE_OPENAI_DEPLOYMENT>"`
Expected: `fields-report.md` with one row per form.

- [ ] **Step 3: Compare and report**

Put the overall rows of `baseline-rules`, `llm-labels` and `llm-labels-described` side by side (exact rate, partial, wrong, missed, median ms), together with the `llm-fields` table. Report them to Alex with:
- the three forms with the lowest exact rates;
- for each of those, the fields most often `wrong` or `missed`, read from `labels-report.json`.

That comparison is the input for Part 2's plan. Nothing in `.cache/` is committed.
