# Kind Field Schemas (Variable-Picker Drill-Down) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the workflow-builder variable picker and condition editor enumerate an object value's fields (e.g. `ocrResult.status`) by giving artifact kinds central field schemas derived from Zod single-source definitions.

**Architecture:** `ArtifactKindMeta` gains `fields?: FieldDescriptor[]`, derived via a new `zodToFields` converter from Zod schemas that are also the compiler-enforced source of activity I/O types (`OcrPayloadRef` moves into the shared package). A pure resolution layer (`resolveKindFields` in the package, `variable-field-options` in the frontend) turns *ctx key → kind → fields* into prefix-driven picker options; the executor needs **zero changes** because `resolveCtxBinding` already walks dotted ctx paths.

**Tech Stack:** TypeScript, Zod v4 (`zod/v4` subpath of zod 3.25.76), Jest (packages/graph-workflow, apps/temporal), Vitest + Testing Library (apps/frontend), Mantine v8 Autocomplete, Biome.

**Spec:** `docs-md/workflow-builder/KIND_FIELD_SCHEMAS_DESIGN.md` (committed as d6d4e516).

---

## Key decisions (resolving the spec's open questions — grounded in code research)

1. **OQ1 — v1 seeds fields for `OcrResult` ONLY.** Runtime research showed `Document` and `Classification` are polymorphic and a schema would lie (spec §2 principle 3):
   - "Document"-kind values are sometimes `PreparedFileData` (`apps/temporal/src/types.ts:205`), sometimes a bare blob-key/base64 **string** (`blob.read`, `source.upload`), and the demo's `currentDoc` (`{type, confidence, blobKey}`) is trigger-supplied and matches no activity.
   - "Classification"-kind values are a bare string from `document.classify` but a `Record<string, ClassifiedDocument[]>` map from `azureClassify.poll`.
   - `OcrResult` is consistent: both `azureOcr.extract` and `mistral.ocr` put an `OcrPayloadRef` (`apps/temporal/src/ocr-payload-ref-types.ts:6-14`) in ctx: `{ documentId, blobPath, storage: "blob", byteLength?, pageCount?, status? }`. The part-4 demo's pollUntil already reads `ctx.ocrResult.status` — the end-to-end demo path.
2. **OQ2 — cycle guard:** prefix-driven option generation (depth grows only on author action) + a hard `MAX_DRILL_DEPTH = 8` / `MAX_BASE_CHAIN = 16` cap in the pure functions.
3. **OQ3 — captions:** yes; field rows show a dimmed `type · kind` caption.
4. **OQ4 — parameterized kinds:** moot in v1 (no `Segment` schema seeded); inheritance via `baseKind` works unchanged when one is added.
5. **OQ5 — stop rule confirmed:** `{ type: "object" }` without `kind` → drilling stops.
6. **OQ6 — converter scope:** accept `string | number | boolean | literal | object | array | optional`; **throw** on anything else (union, record, transform, …) rather than mis-derive.
7. **Deviation from spec §4:** the frontend map-item unwrap does NOT reuse the package's `resolveMapElementKind` (it only sees catalog producers). Instead `resolve-producer-kind.ts` recurses through its own `resolveProducerKindFor` on the map's `collectionCtxKey` (covers ctx-declared / source-produced collections too) with a visited-set guard. Task 10 syncs the spec.
8. **Runtime already works:** `resolveCtxBinding` (`packages/graph-workflow/src/validator/context-utils.ts:84`) splits ctx keys on `.` and walks the nested bag, so drilled refs (`ocrResult.status`, `__auto.n1.result.status`) evaluate today. No executor/backend-controller changes; no new API surface.

## File map

**packages/graph-workflow** (tests: Jest, colocated `*.test.ts`; run `npm test` in the package dir; build with `npm run build`):
- Create `src/types/zod-to-fields.ts` (+ `.test.ts`) — Zod→FieldDescriptor converter with kind-identity map.
- Create `src/types/kind-schemas.ts` (+ `.test.ts`) — `OcrResultSchema`, `KIND_SCHEMAS`, derived `OcrPayloadRef` type.
- Create `src/types/kind-fields.ts` (+ `.test.ts`) — `resolveKindFields(kind)` with `baseKind` merge.
- Modify `src/types/artifact-registry.ts` — `fields?` on meta; seed `OcrResult.fields`.
- Modify `src/types/index.ts` — barrel exports.

**apps/temporal** (tests: Jest):
- Modify `src/ocr-payload-ref-types.ts` — interface replaced by package-derived type.
- Modify `src/graph-workflow-types.ts:8`, `src/graph-engine/build-workflow-result.ts:2`, `src/ocr-payload-ref.ts:12,15` — import the type from the package.

**apps/frontend** (tests: Vitest; run `npx vitest run <file>` from `apps/frontend`):
- Modify `src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts` (+ test) — map-item unwrap.
- Create `src/features/workflow-builder/graph-widgets/variable-field-options.ts` (+ `.test.ts`) — pure prefix-driven expansion + path metadata.
- Modify `src/features/workflow-builder/graph-widgets/VariablePicker.tsx` (+ test) — expanded options + captions in both render paths.
- Modify `src/features/workflow-builder/graph-widgets/condition-producer-binding.ts` (+ test) — prefix-aware reverse-resolve with `fieldPath`/`portKind`.
- Modify `src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx` (+ test) — field picker in step sub-mode.

**Other:**
- Modify `scripts/seed-feature-demos.mjs:399` — `ocrResult` ctx declaration gains `kind: "OcrResult"`.
- Modify `docs-md/workflow-builder/KIND_FIELD_SCHEMAS_DESIGN.md` + `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md` — Task 10.

**Conventions for every commit:** lefthook pre-commit runs Biome lint + tsc per workspace. Before each commit run `npx @biomejs/biome check --write <changed files>` from the repo root. Commit messages end with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
Never run `npm install` or `npx playwright install` (repo rule). No `any` types.

---

### Task 1: `zodToFields` converter (package)

**Files:**
- Create: `packages/graph-workflow/src/types/zod-to-fields.ts`
- Test: `packages/graph-workflow/src/types/zod-to-fields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/graph-workflow/src/types/zod-to-fields.test.ts
import { z } from "zod/v4";
import type { KindRef } from "./artifacts";
import { type KindSchemaMap, zodToFields } from "./zod-to-fields";

const EMPTY: KindSchemaMap = new Map();

describe("zodToFields", () => {
  it("maps primitives with required flags", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().optional(),
      ok: z.boolean(),
    });
    expect(zodToFields(schema, EMPTY)).toEqual([
      { name: "name", type: "string", required: true },
      { name: "count", type: "number", required: false },
      { name: "ok", type: "boolean", required: true },
    ]);
  });

  it("maps a literal to its value's primitive type", () => {
    const schema = z.object({ storage: z.literal("blob") });
    expect(zodToFields(schema, EMPTY)).toEqual([
      { name: "storage", type: "string", required: true },
    ]);
  });

  it("emits a kind reference for a sub-schema registered in the map (identity, not inline)", () => {
    const Segment = z.object({ polygon: z.array(z.number()) });
    const kindSchemas: KindSchemaMap = new Map([[Segment, "Segment" as KindRef]]);
    const Doc = z.object({ primarySegment: Segment, extra: z.object({ x: z.string() }) });
    expect(zodToFields(Doc, kindSchemas)).toEqual([
      { name: "primarySegment", type: "object", kind: "Segment", required: true },
      { name: "extra", type: "object", required: true }, // anonymous object: no kind, no inline fields
    ]);
  });

  it("emits an array kind for arrays of a registered kind schema", () => {
    const Segment = z.object({ polygon: z.array(z.number()) });
    const kindSchemas: KindSchemaMap = new Map([[Segment, "Segment" as KindRef]]);
    const Doc = z.object({ segments: z.array(Segment), tags: z.array(z.string()) });
    expect(zodToFields(Doc, kindSchemas)).toEqual([
      { name: "segments", type: "array", kind: "Segment[]", required: true },
      { name: "tags", type: "array", required: true },
    ]);
  });

  it("throws on unsupported constructs instead of mis-deriving", () => {
    const schema = z.object({ u: z.union([z.string(), z.number()]) });
    expect(() => zodToFields(schema, EMPTY)).toThrow(
      'zodToFields: unsupported schema type "union" for field "u"',
    );
  });

  it("throws when the top-level schema is not an object", () => {
    expect(() => zodToFields(z.string(), EMPTY)).toThrow(
      'zodToFields: top-level schema must be an object, got "string"',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/graph-workflow && npx jest src/types/zod-to-fields.test.ts`
Expected: FAIL — `Cannot find module './zod-to-fields'`

- [ ] **Step 3: Write the implementation**

Note on the zod/v4 introspection API (verified against the installed zod 3.25.76): every schema exposes `.def.type` (`"string" | "number" | "boolean" | "object" | "array" | "optional" | "literal" | "union" | …`), optionals expose `.def.innerType`, arrays expose `.def.element`, literals expose `.def.values` (array of literal values), and object schemas expose `.shape` in declaration order.

```ts
// packages/graph-workflow/src/types/zod-to-fields.ts
/**
 * Zod → FieldDescriptor[] converter for kind field schemas
 * (KIND_FIELD_SCHEMAS_DESIGN.md §3.4).
 *
 * A kind's shape is authored ONCE as a Zod schema; activities derive their
 * I/O type via `z.infer`, and the registry derives its `fields` here. Nested
 * kind references are recovered by SCHEMA IDENTITY: a sub-schema that is (===)
 * a schema registered in `kindSchemas` becomes `{ type, kind }` — a reference,
 * not an inline copy. An anonymous nested object stays `{ type: "object" }`
 * with no kind, where picker drill-down stops (spec open question 5).
 *
 * Deliberately narrow: accepts string/number/boolean/literal/object/array/
 * optional and THROWS on anything else (union, record, transform, …) so an
 * unsupported construct fails loudly at module load instead of deriving a
 * schema that lies to the picker.
 */
import type { ZodType } from "zod/v4";
import type { FieldDescriptor } from "../catalog/source-types";
import type { ArrayKind, KindRef } from "./artifacts";

/** Identity map from a kind's Zod schema object to its kind name. */
export type KindSchemaMap = ReadonlyMap<ZodType, KindRef>;

/** The zod/v4 public def surface this converter relies on. */
interface ZodDefView {
  type: string;
  innerType?: ZodType;
  element?: ZodType;
  values?: unknown[];
}

function defOf(schema: ZodType): ZodDefView {
  return (schema as unknown as { def: ZodDefView }).def;
}

export function zodToFields(
  schema: ZodType,
  kindSchemas: KindSchemaMap,
): FieldDescriptor[] {
  const def = defOf(schema);
  if (def.type !== "object") {
    throw new Error(
      `zodToFields: top-level schema must be an object, got "${def.type}"`,
    );
  }
  const shape = (schema as unknown as { shape: Record<string, ZodType> }).shape;
  return Object.entries(shape).map(([name, fieldSchema]) =>
    fieldToDescriptor(name, fieldSchema, kindSchemas),
  );
}

function fieldToDescriptor(
  name: string,
  fieldSchema: ZodType,
  kindSchemas: KindSchemaMap,
): FieldDescriptor {
  let required = true;
  let current = fieldSchema;
  while (defOf(current).type === "optional") {
    const inner = defOf(current).innerType;
    if (inner === undefined) break;
    required = false;
    current = inner;
  }
  const def = defOf(current);
  switch (def.type) {
    case "string":
    case "number":
    case "boolean":
      return { name, type: def.type, required };
    case "literal": {
      const literalType = typeof def.values?.[0];
      if (
        literalType !== "string" &&
        literalType !== "number" &&
        literalType !== "boolean"
      ) {
        throw new Error(
          `zodToFields: unsupported literal type "${literalType}" for field "${name}"`,
        );
      }
      return { name, type: literalType, required };
    }
    case "object": {
      const kind = kindSchemas.get(current);
      return kind !== undefined
        ? { name, type: "object", kind, required }
        : { name, type: "object", required };
    }
    case "array": {
      const elementKind = def.element
        ? kindSchemas.get(def.element)
        : undefined;
      return elementKind !== undefined
        ? { name, type: "array", kind: `${elementKind}[]` as ArrayKind, required }
        : { name, type: "array", required };
    }
    default:
      throw new Error(
        `zodToFields: unsupported schema type "${def.type}" for field "${name}"`,
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/graph-workflow && npx jest src/types/zod-to-fields.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write packages/graph-workflow/src/types/zod-to-fields.ts packages/graph-workflow/src/types/zod-to-fields.test.ts
git add packages/graph-workflow/src/types/zod-to-fields.ts packages/graph-workflow/src/types/zod-to-fields.test.ts
git commit -m "feat(graph-workflow): zodToFields converter with schema-identity kind references

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Kind schemas + registry `fields` (package)

**Files:**
- Create: `packages/graph-workflow/src/types/kind-schemas.ts`
- Modify: `packages/graph-workflow/src/types/artifact-registry.ts` (interface at :35, `OcrResult` entry at :125, no change to `registerArtifactKind`)
- Modify: `packages/graph-workflow/src/types/index.ts`
- Test: `packages/graph-workflow/src/types/kind-schemas.test.ts` and extend `packages/graph-workflow/src/types/artifact-registry.test.ts` (create if absent)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/graph-workflow/src/types/kind-schemas.test.ts
import { ARTIFACT_REGISTRY, getArtifactKindMeta } from "./artifact-registry";
import type { OcrPayloadRef } from "./kind-schemas";
import { KIND_SCHEMAS, OcrResultSchema } from "./kind-schemas";

describe("kind schemas", () => {
  it("OcrResultSchema derives the same shape the Temporal runtime constructs", () => {
    // Compile-time single-source check: this literal is the exact object
    // extract-ocr-results.ts / mistral-ocr-process.ts put in ctx.
    const ref: OcrPayloadRef = {
      documentId: "doc-1",
      blobPath: "ocr/doc-1.json",
      storage: "blob",
      byteLength: 1024,
      pageCount: 3,
      status: "succeeded",
    };
    expect(OcrResultSchema.safeParse(ref).success).toBe(true);
    // Optionals really are optional:
    const minimal: OcrPayloadRef = {
      documentId: "d",
      blobPath: "p",
      storage: "blob",
    };
    expect(OcrResultSchema.safeParse(minimal).success).toBe(true);
  });

  it("registers OcrResultSchema in KIND_SCHEMAS under the OcrResult kind", () => {
    expect(KIND_SCHEMAS.get(OcrResultSchema)).toBe("OcrResult");
  });

  it("seeds ARTIFACT_REGISTRY.OcrResult.fields from the schema", () => {
    expect(ARTIFACT_REGISTRY.OcrResult.fields).toEqual([
      { name: "documentId", type: "string", required: true },
      { name: "blobPath", type: "string", required: true },
      { name: "storage", type: "string", required: true },
      { name: "byteLength", type: "number", required: false },
      { name: "pageCount", type: "number", required: false },
      { name: "status", type: "string", required: false },
    ]);
  });

  it("keeps the Artifact wildcard schema-free", () => {
    expect(ARTIFACT_REGISTRY.Artifact.fields).toBeUndefined();
    // The wildcard cannot acquire fields at runtime either: the duplicate-name
    // guard rejects re-registration of "Artifact".
    expect(getArtifactKindMeta("Artifact")?.fields).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/graph-workflow && npx jest src/types/kind-schemas.test.ts`
Expected: FAIL — `Cannot find module './kind-schemas'`

- [ ] **Step 3: Create `kind-schemas.ts`**

```ts
// packages/graph-workflow/src/types/kind-schemas.ts
/**
 * Zod source-of-truth schemas for built-in kinds that carry field schemas
 * (KIND_FIELD_SCHEMAS_DESIGN.md §3.3–§3.4).
 *
 * v1 seeds OcrResult ONLY. Document and Classification are deliberately
 * schema-free: their runtime shapes are polymorphic (a "Document" is
 * sometimes PreparedFileData, sometimes a bare blob-key string; a
 * "Classification" is a string from document.classify but a label→segments
 * map from azureClassify.poll) and an honest wildcard beats a lying type
 * (spec §2 principle 3).
 *
 * Kinds compose by referencing each other's schema OBJECT (identity), so a
 * referenced kind's schema must be declared before schemas that embed it.
 */
import { z, type ZodType } from "zod/v4";
import type { KindRef } from "./artifacts";
import type { KindSchemaMap } from "./zod-to-fields";

/**
 * The OcrResult-kind ctx value: a blob POINTER to the full OCR payload, not
 * the payload itself. Both azureOcr.extract and mistral.ocr construct exactly
 * this object; pollUntil conditions read `.status` off it.
 */
export const OcrResultSchema = z.object({
  documentId: z.string(),
  blobPath: z.string(),
  storage: z.literal("blob"),
  byteLength: z.number().optional(),
  pageCount: z.number().optional(),
  /** running | succeeded | failed — used by pollUntil conditions */
  status: z.string().optional(),
});

/**
 * The single-source runtime type for OcrResult-kind values. The Temporal
 * activities that construct the object type against THIS (imported as
 * `OcrPayloadRef`), so a schema change fails compilation there.
 */
export type OcrPayloadRef = z.infer<typeof OcrResultSchema>;

/** Identity map consumed by `zodToFields` to emit kind references. */
export const KIND_SCHEMAS: KindSchemaMap = new Map<ZodType, KindRef>([
  [OcrResultSchema, "OcrResult"],
]);
```

- [ ] **Step 4: Modify `artifact-registry.ts`**

Add to the imports at the top (after the existing `import type { ArtifactKind } from "./artifacts";`):

```ts
import type { FieldDescriptor } from "../catalog/source-types";
import { KIND_SCHEMAS, OcrResultSchema } from "./kind-schemas";
import { zodToFields } from "./zod-to-fields";
```

Extend the interface (line 35):

```ts
export interface ArtifactKindMeta {
  displayName: string;
  color: string;
  baseKind?: ArtifactKind;
  /**
   * The kind's OWN field schema (excludes inherited — resolution walks
   * `baseKind`; see kind-fields.ts). Derived from the kind's Zod schema via
   * `zodToFields`, never hand-written, so it cannot drift from the runtime
   * type (KIND_FIELD_SCHEMAS_DESIGN.md §3.4). Absent = no drill-down.
   */
  fields?: FieldDescriptor[];
  isArray: false;
}
```

Change ONLY the `OcrResult` entry in `ARTIFACT_REGISTRY` (line 125):

```ts
    OcrResult: {
      displayName: "OCR result",
      color: "violet",
      baseKind: "Artifact",
      fields: zodToFields(OcrResultSchema, KIND_SCHEMAS),
      isArray: false,
    },
```

No change to `registerArtifactKind`: the existing duplicate-name guard already makes `Artifact` unable to acquire fields at runtime (it is pre-registered), which is the §3.1 wildcard rule.

- [ ] **Step 5: Export from the barrel**

In `packages/graph-workflow/src/types/index.ts`, append:

```ts
export { KIND_SCHEMAS, OcrResultSchema } from "./kind-schemas";
export type { OcrPayloadRef } from "./kind-schemas";
export { zodToFields } from "./zod-to-fields";
export type { KindSchemaMap } from "./zod-to-fields";
```

(`src/index.browser.ts` already re-exports `./types/index`, verified at its line 13 — nothing else to touch. Runtime zod imports are already part of the browser surface via the catalog.)

- [ ] **Step 6: Run tests + full package suite**

Run: `cd packages/graph-workflow && npx jest src/types/ && npm test`
Expected: kind-schemas tests PASS; full suite PASS (the `satisfies Record<ArtifactKind, ArtifactKindMeta>` clause still compiles because `fields` is optional).

- [ ] **Step 7: Rebuild the package** (dependents consume `dist/` via `file:` links)

Run: `cd packages/graph-workflow && npm run build`
Expected: clean tsc build.

- [ ] **Step 8: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write packages/graph-workflow/src/types/
git add packages/graph-workflow/src/types/kind-schemas.ts packages/graph-workflow/src/types/kind-schemas.test.ts packages/graph-workflow/src/types/artifact-registry.ts packages/graph-workflow/src/types/index.ts
git commit -m "feat(graph-workflow): OcrResult kind field schema — Zod single-source + registry fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `resolveKindFields` — kind → merged fields (package)

**Files:**
- Create: `packages/graph-workflow/src/types/kind-fields.ts`
- Test: `packages/graph-workflow/src/types/kind-fields.test.ts`
- Modify: `packages/graph-workflow/src/types/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/graph-workflow/src/types/kind-fields.test.ts
import { registerArtifactKind } from "./artifact-registry";
import { resolveKindFields } from "./kind-fields";

describe("resolveKindFields", () => {
  it("returns the built-in OcrResult fields", () => {
    const names = resolveKindFields("OcrResult").map((f) => f.name);
    expect(names).toEqual([
      "documentId",
      "blobPath",
      "storage",
      "byteLength",
      "pageCount",
      "status",
    ]);
  });

  it("returns [] for unknown kinds, wildcards, and array kinds (direct [] drill-down is out of scope)", () => {
    expect(resolveKindFields("NoSuchKind")).toEqual([]);
    expect(resolveKindFields("Artifact")).toEqual([]);
    expect(resolveKindFields("Document[]")).toEqual([]);
    expect(resolveKindFields("OcrResult[]")).toEqual([]);
  });

  it("merges baseKind fields, own fields winning on name collision", () => {
    // The live registry is module-global and append-only, so use names
    // unique to this test file.
    registerArtifactKind("KfBase", {
      displayName: "KfBase",
      color: "gray",
      fields: [
        { name: "shared", type: "string", required: true },
        { name: "baseOnly", type: "number", required: true },
      ],
      isArray: false,
    });
    registerArtifactKind("KfChild", {
      displayName: "KfChild",
      color: "gray",
      baseKind: "KfBase" as never, // runtime-registered base; not in the static union
      fields: [{ name: "shared", type: "boolean", required: false }],
      isArray: false,
    });
    expect(resolveKindFields("KfChild")).toEqual([
      { name: "shared", type: "boolean", required: false }, // own wins
      { name: "baseOnly", type: "number", required: true },
    ]);
  });
});
```

Note: `baseKind` is typed `ArtifactKind` (the static union) but `registerArtifactKind` accepts runtime kinds by string at the `Map` level — the `as never` cast is confined to the test. If the existing dynamic-node registration tests use a different idiom for runtime `baseKind`, mirror that idiom instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/graph-workflow && npx jest src/types/kind-fields.test.ts`
Expected: FAIL — `Cannot find module './kind-fields'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/graph-workflow/src/types/kind-fields.ts
/**
 * Kind → effective field list (KIND_FIELD_SCHEMAS_DESIGN.md §4 step 2).
 *
 * Walks the `baseKind` chain in the live registry, merging inherited fields
 * with own fields (own wins on name collision), ancestor-first so subkinds
 * override. Array kinds return [] — a value is drilled as its ELEMENT type
 * once unwrapped (map itemCtxKey); direct `documents[].x` drill-down is out
 * of scope in v1 (spec §7). Unknown kinds and kinds without fields return []
 * (graceful degradation, spec §2 principle 5).
 *
 * Pure over registry state; no React, no config.
 */
import type { FieldDescriptor } from "../catalog/source-types";
import { getArtifactKindMeta } from "./artifact-registry";

/** Belt-and-suspenders bound on baseKind walks (registry guards existence, not cycles-by-future-bug). */
const MAX_BASE_CHAIN = 16;

export function resolveKindFields(kind: string): FieldDescriptor[] {
  if (kind.endsWith("[]")) return [];
  const ownFirst: FieldDescriptor[][] = [];
  let current: string | undefined = kind;
  for (let i = 0; current !== undefined && i < MAX_BASE_CHAIN; i++) {
    const meta = getArtifactKindMeta(current);
    if (meta === undefined) break;
    if (meta.fields !== undefined) ownFirst.push(meta.fields);
    current = meta.baseKind;
  }
  const merged = new Map<string, FieldDescriptor>();
  for (let i = ownFirst.length - 1; i >= 0; i--) {
    for (const field of ownFirst[i]) merged.set(field.name, field);
  }
  return [...merged.values()];
}
```

Ordering rule (what the loop produces, and the canonical contract): iterate the chain ancestor-first so `Map` insertion fixes positions in **base-chain declaration order**, while later (child) insertions overwrite the **descriptor** on name collision. So a collided field keeps the ancestor's position but carries the child's descriptor, and non-collided child fields append after base fields. The Step 1 test asserts exactly this (`shared` in base position with the child's `boolean/optional` descriptor, then `baseOnly`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/graph-workflow && npx jest src/types/kind-fields.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Export from the barrel**

In `packages/graph-workflow/src/types/index.ts`, append:

```ts
export { resolveKindFields } from "./kind-fields";
```

- [ ] **Step 6: Full package suite + rebuild**

Run: `cd packages/graph-workflow && npm test && npm run build`
Expected: PASS, clean build.

- [ ] **Step 7: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write packages/graph-workflow/src/types/
git add packages/graph-workflow/src/types/kind-fields.ts packages/graph-workflow/src/types/kind-fields.test.ts packages/graph-workflow/src/types/index.ts
git commit -m "feat(graph-workflow): resolveKindFields — baseKind-merged field resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Temporal `OcrPayloadRef` single-source migration

The shape is CONSTRUCTED in `apps/temporal/src/activities/extract-ocr-results.ts` and `apps/temporal/src/activities/mistral-ocr-process.ts`, both typing against `OcrPayloadRef` from `ocr-payload-ref-types.ts`. Re-pointing that one type at the package-derived `z.infer` puts the compiler enforcement exactly where the payload is built (spec §3.4).

**Files:**
- Modify: `apps/temporal/src/ocr-payload-ref-types.ts` (replace the interface, keep the guard)
- Modify: `apps/temporal/src/graph-workflow-types.ts:8`
- Modify: `apps/temporal/src/graph-engine/build-workflow-result.ts:2`
- Modify: `apps/temporal/src/ocr-payload-ref.ts:12,15`

- [ ] **Step 1: Replace the interface in `ocr-payload-ref-types.ts`**

The file currently defines `export interface OcrPayloadRef {…}` (lines 6-14) and `isOcrPayloadRef` (lines 16-26). Replace the whole file with:

```ts
/**
 * Workflow-safe OCR payload ref guard (no Node/Prisma/blob imports).
 * Activities use `ocr-payload-ref.ts` for I/O helpers.
 *
 * The `OcrPayloadRef` TYPE now lives in @ai-di/graph-workflow, derived from
 * the OcrResult kind's Zod schema (`z.infer<typeof OcrResultSchema>`), so the
 * activities constructing the ref and the builder's field drill-down share
 * one definition (KIND_FIELD_SCHEMAS_DESIGN.md §3.4).
 */
import type { OcrPayloadRef } from "@ai-di/graph-workflow";

export type { OcrPayloadRef };

export function isOcrPayloadRef(value: unknown): value is OcrPayloadRef {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as OcrPayloadRef).storage === "blob" &&
    typeof (value as OcrPayloadRef).documentId === "string" &&
    typeof (value as OcrPayloadRef).blobPath === "string"
  );
}
```

(The `export type { OcrPayloadRef }` here is the file's guard-adjacent public surface — the four existing importers keep working and any NEW code should import the type from `@ai-di/graph-workflow` directly. Do NOT add other re-exports.)

- [ ] **Step 2: Verify the four importers still compile untouched**

`graph-workflow-types.ts:8`, `build-workflow-result.ts:2`, and `ocr-payload-ref.ts:12,15` import from `./ocr-payload-ref-types` / `../ocr-payload-ref-types`, which still exports both names — no edits needed. Confirm with:

Run: `cd apps/temporal && npm run build:graph-workflow && npx tsc --noEmit`
Expected: clean. If tsc reports a structural mismatch between the old interface and `z.infer` (it should not — the schema was written to match exactly, including `storage: "blob"` via `z.literal`), STOP and reconcile the schema in Task 2 rather than loosening any temporal type.

- [ ] **Step 3: Run the affected temporal tests**

Run: `cd apps/temporal && npx jest ocr-payload-ref build-workflow-result graph-workflow`
Expected: PASS (these suites exercise `isOcrPayloadRef` and the ctx plumbing around the ref).

- [ ] **Step 4: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write apps/temporal/src/ocr-payload-ref-types.ts
git add apps/temporal/src/ocr-payload-ref-types.ts
git commit -m "refactor(temporal): derive OcrPayloadRef from the OcrResult kind schema (single source)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Frontend map-item unwrap in `resolveProducerKindFor`

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts`
- Test: extend `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.test.ts`

- [ ] **Step 1: Write the failing tests** (append a describe block; reuse the file's existing config-builder helpers for nodes/ctx — read the top of the test file first and follow its fixture idiom)

```ts
describe("map-item unwrap", () => {
  it("resolves a map itemCtxKey to the element kind of a ctx-declared collection", () => {
    const config = makeConfig({
      ctx: { documents: { type: "array", kind: "Document[]" } },
      nodes: {
        loop: {
          id: "loop",
          type: "map",
          label: "Loop",
          collectionCtxKey: "documents",
          itemCtxKey: "currentDoc",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        },
      },
    });
    expect(resolveProducerKindFor("currentDoc", config)).toBe("Document");
  });

  it("returns undefined for a kindless collection", () => {
    const config = makeConfig({
      ctx: { documents: { type: "array" } },
      nodes: {
        loop: {
          id: "loop",
          type: "map",
          label: "Loop",
          collectionCtxKey: "documents",
          itemCtxKey: "currentDoc",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        },
      },
    });
    expect(resolveProducerKindFor("currentDoc", config)).toBeUndefined();
  });

  it("terminates on a self-referential map (collection = its own item key)", () => {
    const config = makeConfig({
      ctx: {},
      nodes: {
        loop: {
          id: "loop",
          type: "map",
          label: "Loop",
          collectionCtxKey: "currentDoc",
          itemCtxKey: "currentDoc",
          bodyEntryNodeId: "",
          bodyExitNodeId: "",
        },
      },
    });
    expect(resolveProducerKindFor("currentDoc", config)).toBeUndefined();
  });
});
```

(`makeConfig` stands for whatever helper the existing test file uses to build a `GraphWorkflowConfig`; if it builds nodes differently — e.g. requires positions or edges — follow the file. The `MapNode` fields are `collectionCtxKey` / `itemCtxKey` per `packages/graph-workflow/src/types.ts:230-233`.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/resolve-producer-kind.test.ts`
Expected: new tests FAIL (`currentDoc` resolves to `undefined` in test 1).

- [ ] **Step 3: Implement**

In `resolve-producer-kind.ts`:

1. Add `MapNode` to the type imports from `"@ai-di/graph-workflow"` (it is exported from the package root; the local `../../../types/workflow` module may not re-export it).
2. Add the unwrap helper and an internal resolver with a visited-set guard; the public function keeps its signature:

```ts
/**
 * Map-item unwrap (KIND_FIELD_SCHEMAS_DESIGN.md §4 step 1, first in
 * precedence): a map node's `itemCtxKey` has the ELEMENT kind of its
 * collection. The collection's kind is resolved recursively through this
 * module's own precedence walk (NOT the package's resolveMapElementKind,
 * which only sees catalog producers — collections declared on ctx or fed by
 * sources must unwrap too). `visitedMaps` breaks self-referential cycles.
 */
function resolveMapItemKind(
  ctxKey: string,
  config: GraphWorkflowConfig,
  visitedMaps: Set<string>,
): KindRef | undefined {
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as MapNode;
    if (mapNode.itemCtxKey !== ctxKey) continue;
    if (!mapNode.collectionCtxKey) continue;
    if (visitedMaps.has(nodeId)) continue;
    visitedMaps.add(nodeId);
    const collectionKind = resolveInner(
      mapNode.collectionCtxKey,
      config,
      visitedMaps,
    );
    if (collectionKind !== undefined && collectionKind.endsWith("[]")) {
      return collectionKind.slice(0, -2) as KindRef;
    }
  }
  return undefined;
}
```

3. Rename the body of `resolveProducerKindFor` to `resolveInner(ctxKey, config, visitedMaps)` and insert the unwrap as the FIRST precedence step:

```ts
function resolveInner(
  ctxKey: string,
  config: GraphWorkflowConfig,
  visitedMaps: Set<string>,
): KindRef | undefined {
  // 0. Map-item unwrap — the item key exists only inside the map body and
  // shadows any same-named producer, so it goes first (spec §4).
  const mapItemKind = resolveMapItemKind(ctxKey, config, visitedMaps);
  if (mapItemKind !== undefined) {
    return mapItemKind;
  }

  // 1. Catalog-declared output kind … (existing body, unchanged, with the
  //    final `return undefined;`)
}

export function resolveProducerKindFor(
  ctxKey: string,
  config: GraphWorkflowConfig,
): KindRef | undefined {
  return resolveInner(ctxKey, config, new Set());
}
```

Update the module docstring's precedence list to include step 0.

- [ ] **Step 4: Run the file's full test suite**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/resolve-producer-kind.test.ts`
Expected: ALL pass (existing precedence tests unchanged — no prior test uses a map node).

- [ ] **Step 5: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.test.ts
git add apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.test.ts
git commit -m "feat(workflow-builder): map-item unwrap in producer-kind resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `variable-field-options` — pure prefix-driven expansion

**Files:**
- Create: `apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts`
- Test: `apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// variable-field-options.test.ts
import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  expandVariableOptions,
  resolveValuePathKind,
  splitKnownBase,
} from "./variable-field-options";

// Minimal config: one ctx key kind-tagged OcrResult (built-in kind with a
// field schema), one kindless object key. Mirror the fixture idiom of
// resolve-producer-kind.test.ts if it differs.
const config = {
  ctx: {
    ocrResult: { type: "object", kind: "OcrResult" },
    untyped: { type: "object" },
  },
  nodes: {},
  edges: [],
} as unknown as GraphWorkflowConfig;

const groups = [{ group: "Workflow context", items: ["ocrResult", "untyped"] }];

describe("splitKnownBase", () => {
  it("longest-prefix matches at dot boundaries and strips a leading ctx.", () => {
    const keys = ["ocrResult", "__auto.n1.result"];
    expect(splitKnownBase("ocrResult", keys)).toEqual({ base: "ocrResult", rest: [] });
    expect(splitKnownBase("ctx.ocrResult.status", keys)).toEqual({
      base: "ocrResult",
      rest: ["status"],
    });
    expect(splitKnownBase("__auto.n1.result.status", keys)).toEqual({
      base: "__auto.n1.result",
      rest: ["status"],
    });
    expect(splitKnownBase("ocrResultX", keys)).toBeNull();
  });
});

describe("expandVariableOptions", () => {
  it("appends one level of field rows for kinded keys only", () => {
    const { groups: out, meta } = expandVariableOptions(groups, config, "");
    expect(out).toEqual([
      {
        group: "Workflow context",
        items: [
          "ocrResult",
          "ocrResult.documentId",
          "ocrResult.blobPath",
          "ocrResult.storage",
          "ocrResult.byteLength",
          "ocrResult.pageCount",
          "ocrResult.status",
          "untyped",
        ],
      },
    ]);
    expect(meta.get("ocrResult.status")).toEqual({ type: "string", kind: undefined, required: false });
    expect(meta.get("ocrResult.documentId")).toEqual({ type: "string", kind: undefined, required: true });
    expect(meta.has("untyped")).toBe(true); // base keys get meta too (kind undefined)
  });

  it("does not emit deeper rows for scalar fields regardless of input", () => {
    const { groups: out } = expandVariableOptions(groups, config, "ocrResult.status.");
    // status is a string — no third level appears
    expect(out[0].items.some((i) => i.startsWith("ocrResult.status."))).toBe(false);
  });

  it("free-typed unknown paths do not crash and add nothing", () => {
    const { groups: out } = expandVariableOptions(groups, config, "nonexistent.x.y");
    expect(out[0].items).toContain("ocrResult");
  });
});

describe("resolveValuePathKind", () => {
  it("returns the base producer kind for a bare key and the leaf field kind for a drilled path", () => {
    expect(resolveValuePathKind("ocrResult", config, ["ocrResult", "untyped"])).toBe("OcrResult");
    // scalar leaf → no kind
    expect(
      resolveValuePathKind("ocrResult.status", config, ["ocrResult", "untyped"]),
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/variable-field-options.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts
/**
 * Prefix-driven field drill-down for the variable pickers
 * (KIND_FIELD_SCHEMAS_DESIGN.md §4–§5).
 *
 * Pure — no React. Given the grouped base options `buildVariableOptions`
 * already produces, appends `key.field` rows for keys whose resolved kind
 * carries a field schema. Generation is PREFIX-DRIVEN, never pre-expanded:
 * the empty input shows base keys + ONE level of fields; deeper levels are
 * emitted only once the typed input establishes a drillable prefix. That
 * bounds the flat Autocomplete list and doubles as the cycle guard — depth
 * only grows on deliberate author action (plus a hard MAX_DRILL_DEPTH cap).
 *
 * ctx keys may themselves contain dots (`__auto.<node>.<port>`), so path
 * splitting matches the LONGEST known base key at a dot boundary rather than
 * cutting at the first dot. A leading `ctx.` (seed/legacy ref style) is
 * stripped before matching.
 */
import {
  type FieldDescriptor,
  type KindRef,
  resolveKindFields,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { resolveProducerKindFor } from "./resolve-producer-kind";

export interface VariablePathInfo {
  type: FieldDescriptor["type"] | undefined;
  kind: KindRef | undefined;
  required: boolean | undefined;
}

export interface ExpandedVariableOptions {
  groups: { group: string; items: string[] }[];
  /** Caption metadata per option value (base keys and field rows). */
  meta: Map<string, VariablePathInfo>;
}

const MAX_DRILL_DEPTH = 8;

/**
 * Split a typed path into (known base key, remaining field segments).
 * Longest known base wins; matches only whole keys or a `.` boundary.
 * Returns null when no known key is a prefix of the path.
 */
export function splitKnownBase(
  input: string,
  knownKeys: readonly string[],
): { base: string; rest: string[] } | null {
  const path = input.startsWith("ctx.") ? input.slice(4) : input;
  let best: string | null = null;
  for (const key of knownKeys) {
    if (path === key || path.startsWith(`${key}.`)) {
      if (best === null || key.length > best.length) best = key;
    }
  }
  if (best === null) return null;
  const restStr = path.slice(best.length);
  const rest = restStr === "" ? [] : restStr.slice(1).split(".");
  return { base: best, rest };
}

/**
 * The field list reachable at `base` + `segments`: resolve the base key's
 * kind, then walk each segment through its field's `kind`. Any miss (no
 * kind, unknown field, scalar field) returns [] — drilling stops.
 */
function fieldsAtPath(
  config: GraphWorkflowConfig,
  base: string,
  segments: readonly string[],
): FieldDescriptor[] {
  const baseKind = resolveProducerKindFor(base, config);
  if (baseKind === undefined) return [];
  let fields = resolveKindFields(baseKind);
  for (const segment of segments) {
    const field = fields.find((f) => f.name === segment);
    if (field?.kind === undefined) return [];
    fields = resolveKindFields(field.kind);
  }
  return fields;
}

function pathInfoOf(field: FieldDescriptor): VariablePathInfo {
  return { type: field.type, kind: field.kind, required: field.required };
}

/**
 * Expand grouped base options with field rows. `inputValue` is the picker's
 * current text; when it establishes a drillable prefix deeper than one
 * level, that deeper level is appended too.
 */
export function expandVariableOptions(
  groups: { group: string; items: string[] }[],
  config: GraphWorkflowConfig,
  inputValue: string,
): ExpandedVariableOptions {
  const knownKeys = groups.flatMap((g) => g.items);
  const meta = new Map<string, VariablePathInfo>();
  const emitted = new Set<string>();

  // Deeper-level rows requested by the current input (if any). Computed
  // once; attached after the base key they extend.
  const deep = new Map<string, string[]>(); // base key → deeper option values
  const split = splitKnownBase(inputValue, knownKeys);
  if (split !== null && split.rest.length > 0) {
    // Treat a trailing "." as "list this level"; otherwise the last segment
    // is a partial field name being typed and the level above it is listed.
    const endsWithDot = inputValue.endsWith(".");
    const drillPath = endsWithDot ? split.rest.filter((s) => s !== "") : split.rest.slice(0, -1);
    if (drillPath.length >= 1 && drillPath.length < MAX_DRILL_DEPTH) {
      const fields = fieldsAtPath(config, split.base, drillPath);
      if (fields.length > 0) {
        const prefix = `${split.base}.${drillPath.join(".")}`;
        deep.set(
          split.base,
          fields.map((f) => {
            const value = `${prefix}.${f.name}`;
            meta.set(value, pathInfoOf(f));
            return value;
          }),
        );
      }
    }
  }

  const outGroups = groups.map((g) => {
    const items: string[] = [];
    for (const key of g.items) {
      if (emitted.has(key)) continue;
      emitted.add(key);
      items.push(key);
      const baseKind = resolveProducerKindFor(key, config);
      meta.set(key, { type: config.ctx?.[key]?.type, kind: baseKind, required: undefined });
      if (baseKind !== undefined) {
        for (const field of resolveKindFields(baseKind)) {
          const value = `${key}.${field.name}`;
          if (emitted.has(value)) continue;
          emitted.add(value);
          meta.set(value, pathInfoOf(field));
          items.push(value);
        }
      }
      const deeper = deep.get(key);
      if (deeper !== undefined) {
        for (const value of deeper) {
          if (emitted.has(value)) continue;
          emitted.add(value);
          items.push(value);
        }
      }
    }
    return { group: g.group, items };
  });

  return { groups: outGroups, meta };
}

/**
 * The kind of the VALUE a (possibly drilled) path yields — the base
 * producer kind for a bare key, the leaf field's kind for a drilled path,
 * undefined when the leaf is scalar/unknown. Used for typed-I/O
 * compatibility sorting of drilled options.
 */
export function resolveValuePathKind(
  input: string,
  config: GraphWorkflowConfig,
  knownKeys: readonly string[],
): KindRef | undefined {
  const split = splitKnownBase(input, knownKeys);
  if (split === null) return resolveProducerKindFor(input, config);
  if (split.rest.length === 0) return resolveProducerKindFor(split.base, config);
  const parentFields = fieldsAtPath(config, split.base, split.rest.slice(0, -1));
  const leaf = parentFields.find((f) => f.name === split.rest[split.rest.length - 1]);
  return leaf?.kind;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/variable-field-options.test.ts`
Expected: PASS. (If the OcrResult field ordering differs, the registry order in Task 2 is authoritative — fix the test, not the code.)

- [ ] **Step 5: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.test.ts
git add apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.test.ts
git commit -m "feat(workflow-builder): prefix-driven variable field-option expansion (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: VariablePicker integration (both render paths + captions)

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx`
- Test: extend `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx`

- [ ] **Step 1: Write the failing tests** (append; follow the file's existing render/fixture idiom — it already renders the picker with a `config` and asserts on options)

```ts
describe("field drill-down", () => {
  const drillConfig = {
    ctx: {
      ocrResult: { type: "object", kind: "OcrResult" },
      untyped: { type: "object" },
    },
    nodes: {},
    edges: [],
  } as unknown as GraphWorkflowConfig;

  it("offers key.field rows for a kinded ctx key in the legacy path", async () => {
    // render with value="" and no expectedKind; open the dropdown
    // (mirror how existing tests open the Autocomplete)
    // assert an option with text/testid for "ocrResult.status" exists
    // assert NO option "untyped.<anything>" exists
  });

  it("captions field rows with type · kind info", async () => {
    // open dropdown; the "ocrResult.status" option row shows caption "string"
    // via data-testid `variable-picker-caption-ocrResult.status`
  });

  it("typed path: a drilled option participates in compatibility sorting by its LEAF kind", async () => {
    // render with expectedKind="OcrResult" and the drillConfig:
    // - "ocrResult" appears under "Compatible"
    // - "ocrResult.status" (string leaf, no kind → Artifact wildcard) also
    //   lands in Compatible per the wildcard rule — assert it is present
    //   and NOT marked data-incompatible
  });

  it("free-typing an arbitrary dotted path still works (no crash, input keeps value)", async () => {
    // render with value="currentDoc.type" on a config with no kinds; the
    // input renders that value; no options list required
  });
});
```

Write these as real tests against the file's existing helpers (e.g. its `renderPicker`/user-event setup). The assertions above are the contract; the mechanics must match the file.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx`
Expected: new tests FAIL (no field rows emitted).

- [ ] **Step 3: Implement in `VariablePicker.tsx`**

1. Imports:

```ts
import {
  expandVariableOptions,
  resolveValuePathKind,
} from "./variable-field-options";
```

2. Replace the `groupedOptions` memo (line 154) with the expanded computation:

```ts
  const baseGroups = useMemo(
    () => buildVariableOptions(config, currentNodeId),
    [config, currentNodeId],
  );
  // Field drill-down (KIND_FIELD_SCHEMAS_DESIGN.md §5): re-expands as the
  // typed value establishes deeper drillable prefixes.
  const { groups: groupedOptions, meta: pathMeta } = useMemo(
    () => expandVariableOptions(baseGroups, config, value),
    [baseGroups, config, value],
  );
```

3. `existingOptionValues` (line 162) keeps working off `groupedOptions` — field rows contain dots so `NEW_CTX_KEY_RE` already excludes them from the "+ Create" affordance. No change beyond the variable now holding expanded options.

4. Add a caption renderer used by BOTH paths (place above the legacy-path `return`):

```ts
  const captionFor = (optionValue: string): string | null => {
    if (!optionValue.includes(".")) return null;
    const info = pathMeta.get(optionValue);
    if (info === undefined) return null;
    const parts: string[] = [];
    if (info.type !== undefined) parts.push(info.type);
    if (info.kind !== undefined) parts.push(info.kind);
    if (info.required === false) parts.push("optional");
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const renderFieldAwareOption = (optionValue: string, extra?: React.ReactNode) => {
    const caption = captionFor(optionValue);
    return (
      <div style={{ width: "100%" }}>
        {extra ?? (
          <Text size="xs" data-testid={`variable-picker-option-${optionValue}`}>
            {optionValue}
          </Text>
        )}
        {caption !== null && (
          <Text
            size="10px"
            c="dimmed"
            data-testid={`variable-picker-caption-${optionValue}`}
          >
            {caption}
          </Text>
        )}
      </div>
    );
  };
```

5. Legacy path: give the `Autocomplete` a `renderOption`:

```ts
          renderOption={({ option }) => renderFieldAwareOption(option.value)}
```

6. Typed path: drilled entries must sort by their LEAF kind, not the base key's kind. Change the `entries` mapping (line 208):

```ts
  const knownBaseKeys = baseGroups.flatMap((g) => g.items);
  const entries: VariablePickerEntry[] = flatCtxKeys.map((ctxKey) => ({
    id: ctxKey,
    label: ctxKey,
    ctxKey,
    producerKind: ctxKey.includes(".")
      ? resolveValuePathKind(ctxKey, config, knownBaseKeys)
      : (resolveProducerKind?.(ctxKey) ?? resolveValuePathKind(ctxKey, config, knownBaseKeys)),
  }));
```

7. Typed path `renderOption` (line 235): wrap the two existing branches with the caption. Keep the existing test-ids and the incompatible tooltip exactly as they are; only append the caption line:

```ts
  const renderOption = ({
    option,
  }: ComboboxLikeRenderOptionInput<ComboboxStringItem>) => {
    const isIncompatible = incompatibleIds.has(option.value);
    if (!isIncompatible) {
      return renderFieldAwareOption(option.value);
    }
    const reason = reasons.get(option.value) ?? "";
    return renderFieldAwareOption(
      option.value,
      <Tooltip label={reason} withinPortal>
        <Text
          size="xs"
          style={{ opacity: 0.5, width: "100%" }}
          data-testid={`variable-picker-option-${option.value}`}
          data-incompatible="true"
          data-incompatible-reason={reason}
        >
          {option.value}
        </Text>
      </Tooltip>,
    );
  };
```

- [ ] **Step 4: Run the picker + neighbours suites**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx src/features/workflow-builder/graph-widgets/variable-picker-utils.test.ts`
Expected: ALL pass, including pre-existing tests (legacy flat list per-key content unchanged for kindless configs; typed sort unchanged when nothing is drilled).

- [ ] **Step 5: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx
git add apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.test.tsx
git commit -m "feat(workflow-builder): field drill-down rows + captions in VariablePicker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Condition editor — drilled refs in step sub-mode

**Files:**
- Modify: `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts` (`resolveCtxKeyToProducer`, `ResolvedProducerRef`)
- Modify: `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx` (step sub-mode, around lines 928-950)
- Tests: extend `condition-producer-binding.test.ts` and `ConditionExpressionEditor.test.tsx`

- [ ] **Step 1: Write the failing binding tests** (append; reuse the file's config fixtures — it already builds configs with an `azureOcr.extract`-style producer or similar catalog activities)

```ts
describe("drilled refs", () => {
  it("reverse-resolves a drilled ctx key to producer + fieldPath", () => {
    // config with an activity node "ocr" of activityType "azureOcr.extract"
    // whose outputs bind port "ocrResult" → ctxKey "ocrResult"
    const resolved = resolveCtxKeyToProducer(config, "ocrResult.status");
    expect(resolved).toMatchObject({
      producerNodeId: "ocr",
      port: "ocrResult",
      fieldPath: "status",
      portKind: "OcrResult",
    });
  });

  it("exact (non-drilled) keys resolve with fieldPath undefined", () => {
    const resolved = resolveCtxKeyToProducer(config, "ocrResult");
    expect(resolved?.fieldPath).toBeUndefined();
  });

  it("does not prefix-match across a non-dot boundary", () => {
    // key "ocrResultX" must NOT resolve to the "ocrResult" producer
    expect(resolveCtxKeyToProducer(config, "ocrResultX")).toBeNull();
  });

  it("ensureConditionProducerBindings materialises the binding for a drilled ref", () => {
    // switch node with condition left = { ref: "__auto.ocr.ocrResult.status" }
    // → after the call, node "ocr" carries outputs [{ port: "ocrResult",
    //   ctxKey: "__auto.ocr.ocrResult" }]
  });
});
```

- [ ] **Step 2: Implement in `condition-producer-binding.ts`**

1. Extend the interface (line 64):

```ts
export interface ResolvedProducerRef {
  producerNodeId: string;
  nodeLabel: string;
  port: string;
  portLabel: string;
  /** Catalog kind of the producing port, when declared. */
  portKind?: KindRef;
  /** Field path segments AFTER the producer's ctx key ("status", "a.b"), for drilled refs. */
  fieldPath?: string;
}
```

(Add `import type { KindRef } from "@ai-di/graph-workflow";` — merge into the existing package import.)

2. In `resolveCtxKeyToProducer` (line 79), replace the exact-match check with a boundary-aware prefix match, and record the remainder + port kind. The inner loop currently reads:

```ts
    for (const out of entry.outputs) {
      if (producerCtxKey(config, nodeId, out.name) !== ctxKey) continue;
```

Replace with:

```ts
    for (const out of entry.outputs) {
      const key = producerCtxKey(config, nodeId, out.name);
      const isExact = key === ctxKey;
      const isDrilled = !isExact && ctxKey.startsWith(`${key}.`);
      if (!isExact && !isDrilled) continue;
      const fieldPath = isDrilled ? ctxKey.slice(key.length + 1) : undefined;
```

and include `portKind: out.kind, fieldPath` in the `best = {…}` assignment. When BOTH an exact and a drilled candidate could match (different producers), prefer the exact one: track `bestIsExact` and only replace an exact best with another exact at nearer distance. Keep the existing distance tie-break otherwise.

3. `ensureConditionProducerBindings` needs no change — it calls `resolveCtxKeyToProducer(next, ref)`, which now also resolves drilled refs, then binds `producer.port` exactly as before.

- [ ] **Step 3: Run binding tests**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`
Expected: ALL pass (existing + new).

- [ ] **Step 4: Write the failing editor tests** (append to `ConditionExpressionEditor.test.tsx`, reusing its render helpers — it already drives switch-node conditions with configs containing catalog activities)

```ts
describe("step sub-mode field drill-down", () => {
  it("offers a field picker when the selected producer port's kind has fields", async () => {
    // config: activity "ocr" (azureOcr.extract) upstream of the switch node;
    // condition left ref already bound to the ocrResult port's ctx key.
    // Assert: element with data-testid `<testId>-field-input` is present and
    // its options include "status".
  });

  it("selecting a field appends it to the stored ref; clearing restores the bare ref", async () => {
    // choose "status" → onChange fired with { ref: "<producerCtxKey>.status" }
    // clear → onChange fired with { ref: "<producerCtxKey>" }
  });

  it("a drilled stored ref still renders step sub-mode with the resolved row and field", async () => {
    // value = { ref: "<producerCtxKey>.status" } → the "<testId>-resolved"
    // line is shown (not manual sub-mode) and the field input shows "status"
  });

  it("no field picker for ports whose kind has no fields", async () => {
    // a producer with an Artifact-kind port → `<testId>-field-input` absent
  });
});
```

- [ ] **Step 5: Implement in `ConditionExpressionEditor.tsx`**

In the step sub-mode branch (currently lines 929-950), after the `resolved` dimmed line and before `ConditionProducerPicker`, add a field picker driven by the resolved port kind (imports to merge into existing import statements: `resolveKindFields` from `@ai-di/graph-workflow`, `Autocomplete` from `@mantine/core`, and `producerCtxKey` from `./condition-producer-binding` if the file does not import it already):

```tsx
            {resolved && resolved.portKind !== undefined && (() => {
              const fields = resolveKindFields(resolved.portKind);
              if (fields.length === 0) return null;
              const baseKey = producerCtxKey(
                config,
                resolved.producerNodeId,
                resolved.port,
              );
              return (
                <Autocomplete
                  size="xs"
                  label="Field (optional)"
                  placeholder="Whole value"
                  value={resolved.fieldPath ?? ""}
                  data={fields.map((f) => f.name)}
                  data-testid={`${testId}-field-input`}
                  onChange={(next) =>
                    onChange({ ref: next === "" ? baseKey : `${baseKey}.${next}` })
                  }
                />
              );
            })()}
```

Also append the field to the resolved caption line so drilled refs read naturally:

```tsx
              <Text size="10px" c="dimmed" data-testid={`${testId}-resolved`}>
                {resolved.nodeLabel} → {resolved.portLabel}
                {resolved.fieldPath !== undefined ? ` · ${resolved.fieldPath}` : ""}
              </Text>
```

Check the sub-mode selection logic near the top of the `ValueRefField` component: it decides step-vs-manual by whether `resolveCtxKeyToProducer(refValue)` returns non-null — drilled refs now resolve, so step mode is retained automatically. `ConditionProducerPicker`'s `value={refValue}` selected-row highlight compares the FULL ref; with a drilled ref no row shows selected — acceptable for v1 (the resolved line + field input above communicate the binding). If the file computes `resolved` with `resolveCtxKeyToProducer(config, refValue, currentNodeId)`, no further change is needed.

The manual sub-mode `VariablePicker` (line 953) picks up drill-down automatically from Task 7 — verify no prop changes are needed (it doesn't pass `expectedKind`, so it uses the legacy expanded path).

- [ ] **Step 6: Run the editor + binding suites**

Run: `cd apps/frontend && npx vitest run src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
npx @biomejs/biome check --write apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx
git add apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.test.ts apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.test.tsx
git commit -m "feat(workflow-builder): field drill-down for condition step refs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Demo seed kind-tag + browser verification

**Files:**
- Modify: `scripts/seed-feature-demos.mjs:399`

- [ ] **Step 1: Kind-tag the demo's `ocrResult`**

In `controlFlowConfig`'s ctx block (lines 394-401), change:

```js
  ocrResult: { type: "object" },
```

to:

```js
  // Kind-tagged so the condition editor's variable picker can drill into
  // OcrPayloadRef fields (ocrResult.status etc.). The value is written by
  // the childWorkflow's outputMappings, which the frontend kind resolver
  // does not walk — the ctx declaration is the authoritative tag here.
  ocrResult: { type: "object", kind: "OcrResult" },
```

Leave `documents`/`currentDoc` untagged: their trigger-supplied shape (`{type, confidence, blobKey}`) matches no registered kind, and a lying schema is worse than free-typing (spec §2 principles 3 & 6). The summary to the user must state this explicitly.

- [ ] **Step 2: Re-seed (backend must be running on :3002)**

Run: `cd /home/alstruk/GitHub/ai-adoption-document-intelligence && node scripts/seed-feature-demos.mjs`
Expected: script reports the demos upserted, including the part-4 control-flow demo.

- [ ] **Step 3: Browser-verify end-to-end** (frontend on :3000; follow the `app-browser-auth` skill, Approach A — origin-agnostic `**/api/**` route globs, run from the REPO ROOT, never install anything). Inline playwright script outline:

1. Auth-bypass routes per the skill, then `page.goto("http://localhost:3000/workflows/by-slug/demo-control-flow-forms-condition-editor-part-4/edit")`.
2. Click the "Wait until condition" (pollUntil) node; open its condition value editor; switch the left value to manual variable mode if step mode is shown.
3. Clear the input and assert the dropdown lists `ocrResult.status` with a dimmed caption, and does NOT list `untyped`-style drill rows for `documents`.
4. Pick `ocrResult.status`; assert the stored ref renders and no console/page errors occurred.
5. Screenshot to the scratchpad directory for the summary.

Expected: drill-down rows visible; picking works; zero pageerrors.

- [ ] **Step 4: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
git add scripts/seed-feature-demos.mjs
git commit -m "feat(demos): kind-tag ocrResult in control-flow demo for field drill-down

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Docs + spec sync + full regression pass

**Files:**
- Modify: `docs-md/workflow-builder/KIND_FIELD_SCHEMAS_DESIGN.md`
- Modify: `docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md`

- [ ] **Step 1: Sync the design doc with implementation reality**

1. §4 step 1: replace the `resolveMapElementKind` export sentence with the implemented approach — the frontend resolver recurses through its own precedence walk on `collectionCtxKey` with a visited-set guard (Key decision 7 above; quote the reason: catalog-only unwrap misses ctx-declared/source-fed collections).
2. §8 Open questions: mark each resolved with one-line outcomes per Key decisions 1-6 (OQ1: OcrResult only + why Document/Classification stay schema-free; OQ2: prefix-driven + caps; OQ3: yes, `type · kind · optional` captions; OQ4: moot v1; OQ5: confirmed; OQ6: accepted subset + throw).
3. Status line → `**Status:** Implemented (2026-07-18)` (adjust date to the actual completion date).

- [ ] **Step 2: FEATURE_DEMO_GUIDE.md** — in the part-4 control-flow demo section, add a short "Field drill-down" bullet: open the pollUntil condition, manual variable mode, observe `ocrResult.*` rows with captions; note that `currentDoc` intentionally stays free-typed (untyped trigger data).

- [ ] **Step 3: Full regression pass**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/packages/graph-workflow && npm test
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/frontend && npx vitest run src/features/workflow-builder
cd /home/alstruk/GitHub/ai-adoption-document-intelligence/apps/temporal && npx jest ocr-payload-ref build-workflow-result graph-workflow
```

Expected: all PASS. (Frontend/temporal type-checks run again via lefthook on the commit.)

- [ ] **Step 4: Commit**

```bash
cd /home/alstruk/GitHub/ai-adoption-document-intelligence
git add docs-md/workflow-builder/KIND_FIELD_SCHEMAS_DESIGN.md docs-md/workflow-builder/FEATURE_DEMO_GUIDE.md
git commit -m "docs(workflow-builder): sync kind-field-schemas spec with implementation + demo guide

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Summary notes for the final report (spec-gap disclosures required by CLAUDE.md)

- v1 seeds a field schema for **OcrResult only**; `Document`/`Classification` stay schema-free because their runtime shapes are polymorphic (evidence in Key decisions §1). The original motivating case `currentDoc.type` therefore stays free-typed in v1 — it lights up if/when trigger-supplied documents get an honest kind.
- The spec's `resolveMapElementKind` export was superseded by the frontend recursive unwrap (Key decision 7); the spec is updated in Task 10.
- No backend controllers/APIs were added or changed — no Swagger work applies. The executor evaluates drilled refs already.
