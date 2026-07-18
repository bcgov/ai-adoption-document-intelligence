# Kind field schemas — design

**Status:** Draft for review (2026-07-17)
**Scope:** `packages/graph-workflow` (artifact registry + resolution) and the frontend variable pickers.
**Extends:** [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md), [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md), [DATAFLOW_CONCEPTS.md](DATAFLOW_CONCEPTS.md).

---

## 1. Problem

Conditions and mappings frequently reference **sub-fields** of an object value — e.g. a switch case comparing `ctx.currentDoc.type`, a mapping reading `currentDoc.blobKey`. Today the builder cannot help you author these:

- A ctx object (`currentDoc`) is declared only as `{ type: "object" }` ([CtxDeclaration](../../packages/graph-workflow/src/types.ts#L94)) — the system stores **nothing** about its fields.
- The variable picker ([VariablePicker](../../apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx#L92)) sources options from `Object.keys(config.ctx)` — **top-level keys only**. To reference `currentDoc.type` you must **type** the `.type` suffix, which means you must already **know** the field exists.

The original user question was literally *"how am I supposed to know `currentDoc` has `type`?"* — a discoverability gap. The fix must satisfy two hard constraints:

1. **The workflow author declares nothing.** Any design that makes the author hand-type field lists fails, because you'd have to know the fields to declare them — it moves the typing around without creating the knowledge.
2. **No document-specific logic in the generic engine.** The system supports arbitrary workloads (per repo `CLAUDE.md`). Field shapes for `Document`/`OcrResult`/etc. are domain content; the *mechanism* must stay generic.

## 2. The model — central named types that carry fields

The model is the composition of two well-established patterns, not a new invention:

- **ComfyUI-style nominal typed sockets** — nodes annotate ports with a *type name* (`IMAGE`, `LATENT`); connections are name-matched. This is exactly today's `kind` system (`Document`, `Segment`, coloured handles).
- **GraphQL / protobuf / TypeScript named types** — a type is defined **once, centrally**, carries **fields**, is **referenced by name** by every producer and consumer, and tools **autocomplete its fields**.

Your builder already has the first half (`kind`). This design adds the second half: **let a `kind` carry its fields**, so annotating a port `kind: "Document"` publishes both the name *and* the shape, and the variable picker autocompletes into it.

### Principles

1. **Fields live on the kind, once, in a neutral central registry.** Not on activity output ports, and not "owned" by a producing activity — a type with multiple producers has no single owner (like a protobuf `.proto` message or a shared TypeScript type). Every port that references the kind by name inherits the one definition. No per-activity duplication.
2. **Compose, don't duplicate.** Two existing mechanisms cover reuse and nesting:
   - **`baseKind` inheritance** — the registry already forms a hierarchy (`MultiPageDocument → Document → Artifact`, [artifact-registry.ts](../../packages/graph-workflow/src/types/artifact-registry.ts#L48)). A subkind inherits its parent's fields and may add its own.
   - **Field→kind references** — [`FieldDescriptor.kind`](../../packages/graph-workflow/src/catalog/source-types.ts#L72) already exists. A `Document` field `primarySegment: { type: "object", kind: "Segment" }` lets the picker drill from `doc.primarySegment` into **Segment's** fields. Nesting is by reference to another central type — define `Segment` once, point at it.
3. **Type everything reasonable; wildcard is the rare escape hatch.** `Artifact` (the wildcard) is to kinds what `any` is to TypeScript — a deliberate exception, not the default. The healthy end state is that most structured outputs carry a real named type. **Caveat:** do not fabricate a schema for genuinely opaque / pass-through data (a raw third-party blob you just forward) — an honest wildcard beats a lying type, because a wrong schema sends authors drilling into fields that aren't there. Those cases are a small minority.
4. **The workflow author declares nothing.** Type/activity authors publish shapes once (register a kind's fields; annotate ports with the kind). The workflow author only *consumes* drill-down.
5. **Graceful degradation.** Unknown kind, wildcard, or a kind with no fields → no drill-down, and the author can still free-type the path exactly as today. Unknown kinds already render as the gray `Artifact` handle ([handle-style.ts](../../apps/frontend/src/features/workflow-builder/canvas/handle-style.ts#L100-L104)); this design keeps that behaviour.
6. **Drill-down needs both halves.** A value gets field drill-down only when (a) its ctx key / port carries a **kind** (not the `Artifact` wildcard) — the existing typed-I/O concern — *and* (b) that kind has a **field schema** — this feature. Shipping this feature lights up drill-down only for values that are already kind-tagged; untyped values (e.g. the demo's `documents` / `currentDoc`, declared with no `kind`) stay on free-typing until a kind is assigned at their origin. So the payoff is proportional to typed-I/O coverage and grows incrementally — v1 ships the mechanism plus a few seed kinds, not blanket coverage.

## 3. Data model changes

### 3.1 `ArtifactKindMeta` gains `fields`

```ts
// packages/graph-workflow/src/types/artifact-registry.ts
export interface ArtifactKindMeta {
  displayName: string;
  color: string;
  baseKind?: ArtifactKind;
  fields?: FieldDescriptor[];   // NEW — the kind's own fields (excludes inherited)
  isArray: false;
}
```

- Reuses [`FieldDescriptor`](../../packages/graph-workflow/src/catalog/source-types.ts#L72) verbatim (`{ name, type, kind?, required, description?, defaultValue? }`) — the same shape `source.api` authors and the same `FieldListEditor` renders. No new schema format is invented.
- `fields` holds a kind's **own** fields; inherited fields come from `baseKind` at resolution time (§4), so shared fields are declared once on the ancestor.
- `registerArtifactKind(name, meta)` (the existing live-registry mutation API) accepts `fields` so runtime/plugin kinds can publish shapes too.
- **`Artifact` (the wildcard) never carries `fields`.** A wildcard with a schema is a contradiction — it would make *every* value drillable into fields no value is guaranteed to have. `registerArtifactKind` guards against it the same way it guards duplicate names.

### 3.2 No change to ports

`PortDescriptor` ([catalog/types.ts](../../packages/graph-workflow/src/catalog/types.ts#L43)) keeps just `kind`. Ports reference a type by name; the shape lives on the kind. This is the "central, not per-port" decision — an inline per-port schema was explicitly considered and **rejected** as the un-central variant (§7).

### 3.3 Built-in kind field schemas

Field schemas for the built-in domain kinds (`Document`, `OcrResult`, `Segment`, …) live in the registry entry, defined once. This is domain content in the registry — which is where the domain kind *names* already live — and stays extensible via `registerArtifactKind`. The generic engine gains no document-specific branching; only the (already domain-flavoured) registry data grows. Exact field lists per kind are chosen to match the real runtime shapes and are enumerated in the implementation plan, not here.

### 3.4 Single source of truth — how activities and our types never drift

Two independent definitions of the same shape — an activity's TypeScript I/O type *and* a hand-written field list on the kind — **will** drift the moment one changes and the other doesn't. The rule that prevents it: **define each shape once and derive everything else from it.**

Two facts make this achievable here:

- **The kind registry lives in the shared `packages/graph-workflow` package, imported by *both* the frontend builder and the Temporal runtime.** One package, two consumers — the structural basis for a single source of truth. Neither side keeps its own copy.
- **The catalog already uses [Zod](../../packages/graph-workflow/src/catalog/types.ts) for config params.** Zod is the standard single-source tool, so extending it to kind shapes is consistent, not new.

The pattern, per kind:

```ts
// The shape is authored ONCE, as the kind:
const SegmentSchema = z.object({
  segmentType: z.string(),
  polygon: z.array(z.number()),
});
const DocumentSchema = z.object({
  type: z.string(),
  confidence: z.number(),
  blobKey: z.string(),
  primarySegment: SegmentSchema,   // nested kind = compose the OTHER kind's schema
});

// (1) Temporal activity code derives its I/O TYPE from it — compiler-enforced:
type Document = z.infer<typeof DocumentSchema>;
function runOcr(...): Document { ... }   // shape change here fails to compile

// (2) The registry's fields are derived from the SAME schema:
registerArtifactKind("Segment", { ..., fields: zodToFields(SegmentSchema, kindSchemas) });
registerArtifactKind("Document", { ..., fields: zodToFields(DocumentSchema, kindSchemas) });
```

So there is exactly one definition of "what a Document is." The **compiler** keeps every activity that declares `kind: "Document"` honest (it must produce/consume `z.infer<typeof DocumentSchema>`), and the **picker** reads fields derived from the same schema — it can never offer a field the activity doesn't actually produce. Storage form in the registry stays `FieldDescriptor[]` (derived via `zodToFields`); the authoring/source form is the Zod schema (so `z.infer` is available to activities).

**How `zodToFields` emits `kind` references (not inlined copies).** A plain Zod schema has no slot for "this nested object *is* the Segment kind" — a nested `z.object({...})` is anonymous. The converter recovers the reference the way GraphQL codegen does, by **schema identity**: kind schemas are held in a named map (`kindSchemas: Map<ZodTypeAny, KindRef>` — the same map the registration code builds up), and `zodToFields(schema, kindSchemas)` checks every sub-schema against it. A sub-schema that **is** (by object identity) a registered kind's schema becomes `{ type: "object", kind: "<thatName>" }` — a reference, not an inline copy — which is what powers nested drill-down (§4 step 3) and makes cycles representable without infinite expansion. A sub-schema *not* in the map is a plain anonymous object: emitted as `{ type: "object" }` with no `kind`, where drilling stops (open question 5). Consequence: kinds compose by referencing each other's schema objects (`primarySegment: SegmentSchema`), and a referenced kind's schema must be defined before schemas that embed it — plain declaration order, same as any TypeScript value dependency. (`z.lazy` covers genuinely cyclic pairs if one ever appears.)

**The honest cost + the bridge — and where the check belongs.** Full end-to-end drift-proofing requires the code that is loosely typed today to adopt the derived kind type — that refactor is where the real work is, and where the value is (an enforced contract, not just autocomplete). One precision: the shared package has **three** consumers, not two — the frontend, the Temporal runtime, *and* `apps/backend-services` (also a `file:` dependency). Many activity outputs are really **backend API responses the activity forwards**, so type-annotating only the activity's return doesn't catch drift introduced in the backend DTO. The rule: put the enforcement **where the payload is constructed** — if the backend builds the object, the backend DTO adopts (or is checked against) the kind type; the activity annotation then guarantees the forwarding. Until a producer is migrated, a **consistency check** bridges the gap: a type-level assertion (`Expect<Equal<ProducerOutput, z.infer<typeof KindSchema>>>`) or a runtime validation of a sample output against the schema, run in CI, so drift fails the build instead of surfacing as author confusion. This is the standard Zod single-source pattern (`z.infer` + schema-derived metadata), not an invention.

## 4. Resolution — how the picker finds fields

Given a ctx key the author is picking a value for, resolve in this order:

1. **ctx key → kind.** Reuse/extend the existing resolver [`resolveProducerKind(ctxKey) → KindRef | undefined`](../../apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx#L71) (already used for typed-I/O sorting). A ctx key's kind comes from, in precedence:
   - the map-item unwrap — [`resolveMapElementKind`](../../packages/graph-workflow/src/auto-wire/resolve-input-port.ts#L230) already maps `currentDoc` (element of `Document[]`) → `Document`. It is currently a private function in `resolve-input-port.ts`; this feature exports it;
   - the producing node's output port `kind`;
   - the `config.ctx[key].kind` declaration (for caller inputs).
2. **kind → fields.** `getArtifactKindMeta(kind)` then walk `baseKind` up the chain, merging inherited fields with own fields (own wins on name collision). Array suffix (`Document[]`) is stripped first (a value is drilled as its element type once unwrapped; direct `[]` drill-down is out of scope — §7).
3. **Offer `base.field`.** Each resolved field becomes a picker option `key.fieldName`. A field that itself carries a `kind` recurses (step 2) so `doc.primarySegment.polygon` is reachable.
4. **No kind / wildcard / no fields → no drill-down.** The picker shows only the top-level key (today's behaviour); free-typing a path still works.

Resolution is a pure function over `(config, ctxKey, registry)` so it is unit-testable without React.

## 5. UI

- **[VariablePicker](../../apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx):** `buildVariableOptions` additionally emits `key.field` rows for object keys whose resolved kind has fields. Rendering reuses the existing grouped Autocomplete; field rows are visually indented / captioned with their type + kind.
- **Recursion is prefix-driven, not pre-expanded.** The Autocomplete is a flat list, so pre-generating every reachable path (`doc.primarySegment.polygon`, …) would explode combinatorially with nested kinds. Instead the option set is a function of the current input text: with an empty input, offer top-level keys plus **one** level of fields (`doc`, `doc.type`, `doc.primarySegment`); once the typed/selected text establishes a drillable prefix (`doc.primarySegment` — a field whose own kind has fields), regenerate options one level deeper under that prefix. Each generation emits at most one level beyond the resolved prefix. This rule bounds the option count, gives the "a drilled option can itself be drilled" behaviour, and doubles as the practical cycle guard (open question 2): depth only grows when the author deliberately types/picks deeper.
- **[ConditionProducerPicker](../../apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.tsx):** the same drill-down applies where a condition Ref resolves to an object producer, so switch/pollUntil conditions get field drill-down too.
- No new authoring UI. There is deliberately **no** ctx-field editor in Workflow Settings — the manual-declaration approach was rejected (§7).

## 6. Testing

- **Resolution (pure):** kind→fields with `baseKind` inheritance and merge-on-collision; field→kind recursion; array-suffix unwrap; unknown kind → empty; map-item unwrap via `resolveMapElementKind`.
- **Registry:** `registerArtifactKind` round-trips `fields`; frozen built-ins expose fields.
- **Picker:** object key with fields offers `key.field`; nested `key.a.b`; wildcard/unknown offers no drill-down but still allows free-typed input; a field with a kind drills further.
- **Regression:** existing typed-sort behaviour and free-typing fallback unchanged.

## 7. Explicitly out of scope (v1)

- **Inline per-port anonymous schemas.** Rejected: un-central, duplicative, the "invention" we're avoiding. If an output has shape worth drilling into, it gets a **named** kind.
- **Hand-authored ctx object fields in Workflow Settings.** Rejected: pushes typing onto the author who doesn't know the fields.
- **New save-blocking validation** of refs to unknown fields (`currentDoc.typo`). Deferred — drill-down steers; it does not gate saving in v1.
- **Direct array-element drill-down** on an array-typed ctx key (`documents[].x`). The map-item case (`currentDoc`, already unwrapped to `Document`) is covered; direct `[]` drill-down is a later add.
- **`source.api` inline fields.** Left as-is; a later pass could have it emit a named kind, but that is not required here.

## 8. Open questions

1. **Which built-in kinds get field schemas in v1**, and their exact fields (matched to runtime shapes). Enumerated in the plan. Because value needs both halves (§2.6), the plan should also pick a small set of values to **kind-tag** so v1 has at least one visibly working drill-down path end-to-end.
2. **Recursion depth guard** — largely answered by §5's prefix-driven generation (depth only grows on author action, so the UI cannot loop). Remaining: whether the pure resolution function (§4) also wants a hard depth cap as a belt-and-suspenders bound for non-picker callers.
3. **Do we surface required/optional** in the picker caption, and does it matter before validation exists? (Lean: show it, cheap.)
4. **Parameterized kinds** (`Segment<Table>`) and their fields — inherit the base (`Segment`) schema via `baseKind`, or carry their own? (Lean: inherit, override where needed.)
5. **`type` vs `kind` stop rule** — a field `{ type: "object" }` with no `kind` is a known object of *unknown* shape → drilling stops there; a field carrying a `kind` recurses. Confirm this is the intended boundary.
6. **`zodToFields` scope** — the kind-reference mechanism is settled (§3.4: schema-identity lookup against the named-schema map). Remaining: which *other* Zod constructs the converter accepts (primitives, `z.array`, `z.optional` → `required: false`) vs. rejects loudly (`z.union`, `z.record`, transforms, …). Keep it to the subset the picker needs; reject the rest with an explicit error rather than mis-deriving.
